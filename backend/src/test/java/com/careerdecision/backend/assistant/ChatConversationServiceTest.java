package com.careerdecision.backend.assistant;

import com.careerdecision.backend.assistant.ChatConversationService.PreparedConversation;
import com.careerdecision.backend.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class ChatConversationServiceTest {
    @Autowired
    private ChatConversationService service;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void conversationPersistsHistoryAndCachesIdempotentResponse() {
        PreparedConversation first = service.prepare(
                1L, null, "/decision-projects/1", "chat-conversation-001", "我该先验证什么？"
        );
        assertThat(first.history()).isEmpty();
        assertThat(first.cached()).isFalse();

        service.complete(
                1L, first.sessionId(), first.requestId(), "/decision-projects/1",
                Map.of("reply", "先补一个真实岗位样本。", "generationMode", "fallback", "confidence", 0.5)
        );

        PreparedConversation repeated = service.prepare(
                1L, first.sessionId(), "/decision-projects/1", "chat-conversation-001", "重复发送"
        );
        assertThat(repeated.cached()).isTrue();
        assertThat(repeated.cachedResponse()).containsEntry("reply", "先补一个真实岗位样本。");

        PreparedConversation next = service.prepare(
                1L, first.sessionId(), "/decision-projects/1", "chat-conversation-002", "岗位样本怎么看？"
        );
        assertThat(next.history()).containsExactly(
                Map.of("role", "user", "content", "我该先验证什么？"),
                Map.of("role", "assistant", "content", "先补一个真实岗位样本。")
        );
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM chat_messages WHERE session_id = ?", Integer.class, first.sessionId()
        )).isEqualTo(3);
    }

    @Test
    void conversationRejectsAnotherUsersSession() {
        PreparedConversation other = service.prepare(
                2L, null, "/", "chat-conversation-other-001", "其他用户消息"
        );

        assertThatThrownBy(() -> service.prepare(
                1L, other.sessionId(), "/", "chat-conversation-owner-001", "越权消息"
        ))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Chat session not found: " + other.sessionId());
    }

    @Test
    void requestIdCannotMoveBetweenSessions() {
        PreparedConversation first = service.prepare(
                1L, null, "/", "chat-conversation-fixed-001", "第一条消息"
        );
        PreparedConversation second = service.prepare(
                1L, null, "/explore", "chat-conversation-fixed-002", "另一个会话"
        );

        assertThatThrownBy(() -> service.prepare(
                1L, second.sessionId(), "/explore", first.requestId(), "重复请求"
        ))
                .isInstanceOf(BusinessException.class)
                .hasMessage("requestId belongs to another chat session.");
    }
}
