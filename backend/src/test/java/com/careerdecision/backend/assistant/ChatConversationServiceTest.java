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

    @Test
    void deletingSessionRemovesMessagesAndRedactsUnreferencedChatAudit() {
        jdbcTemplate.update("""
                INSERT INTO agent_runs (
                  id, request_id, user_id, agent_type, model_name, status,
                  input_json, output_json, error_message, latency_ms
                ) VALUES (91001, 'chat-delete-audit-001', 1, 'chat', 'test-model', 'success',
                          '{"private":"question"}', '{"private":"answer"}', 'private error', 12)
                """);

        PreparedConversation conversation = service.prepare(
                1L, null, "/assistant", "chat-delete-session-001", "private question"
        );
        service.complete(
                1L, conversation.sessionId(), conversation.requestId(), "/assistant",
                Map.of("reply", "private answer", "agentRunId", 91001L)
        );

        service.deleteSession(1L, conversation.sessionId());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM chat_sessions WHERE id = ?", Integer.class, conversation.sessionId()
        )).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM chat_messages WHERE session_id = ?", Integer.class, conversation.sessionId()
        )).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT input_json FROM agent_runs WHERE id = 91001", String.class
        )).isEqualTo("{\"deleted\":true,\"reason\":\"chat_session_deleted\"}");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT output_json FROM agent_runs WHERE id = 91001", String.class
        )).isEqualTo("{\"deleted\":true,\"reason\":\"chat_session_deleted\"}");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT error_message FROM agent_runs WHERE id = 91001", String.class
        )).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT user_id FROM agent_runs WHERE id = 91001", Long.class
        )).isNull();
    }
    @Test
    void lateCompletionAfterDeletionScrubsDetachedAuditAndDoesNotRestoreMessage() {
        PreparedConversation conversation = service.prepare(
                1L, null, "/assistant", "chat-delete-late-001", "late question"
        );
        service.deleteSession(1L, conversation.sessionId());
        jdbcTemplate.update("""
                INSERT INTO agent_runs (
                  id, request_id, user_id, agent_type, model_name, status,
                  input_json, output_json, error_message, latency_ms
                ) VALUES (91003, 'chat-delete-late-001', 1, 'chat', 'test-model', 'success',
                          '{"late":"input"}', '{"late":"output"}', NULL, 20)
                """);

        assertThat(service.complete(
                1L, conversation.sessionId(), conversation.requestId(), "/assistant",
                Map.of("reply", "late answer", "agentRunId", 91003L)
        )).isFalse();

        assertThat(jdbcTemplate.queryForObject(
                "SELECT input_json FROM agent_runs WHERE id = 91003", String.class
        )).isEqualTo("{\"deleted\":true,\"reason\":\"chat_session_deleted\"}");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT user_id FROM agent_runs WHERE id = 91003", Long.class
        )).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM chat_messages WHERE session_id = ?", Integer.class, conversation.sessionId()
        )).isZero();
    }
    @Test
    void deletingSessionDoesNotRedactAuditLinkedToBusinessArtifact() {
        jdbcTemplate.update("""
                INSERT INTO agent_runs (
                  id, request_id, user_id, agent_type, model_name, status,
                  input_json, output_json, error_message, latency_ms
                ) VALUES (91002, 'chat-delete-linked-audit-001', 1, 'chat', 'test-model', 'success',
                          '{"kept":"input"}', '{"kept":"output"}', NULL, 8)
                """);
        jdbcTemplate.update("""
                INSERT INTO path_plans (id, user_id, agent_run_id, target_role)
                VALUES (91002, 1, 91002, 'Linked plan')
                """);
        PreparedConversation conversation = service.prepare(
                1L, null, "/assistant", "chat-delete-linked-audit-001", "linked question"
        );
        service.complete(
                1L, conversation.sessionId(), conversation.requestId(), "/assistant",
                Map.of("reply", "linked answer", "agentRunId", 91002L)
        );

        service.deleteSession(1L, conversation.sessionId());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT input_json FROM agent_runs WHERE id = 91002", String.class
        )).isEqualTo("{\"kept\":\"input\"}");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT user_id FROM agent_runs WHERE id = 91002", Long.class
        )).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM path_plans WHERE id = 91002", Integer.class
        )).isOne();
    }
    @Test
    void previouslyArchivedSessionCanBePermanentlyDeletedOnlyOnce() {
        PreparedConversation conversation = service.prepare(
                1L, null, "/assistant", "chat-delete-archived-001", "archived question"
        );
        jdbcTemplate.update(
                "UPDATE chat_sessions SET status = 'archived' WHERE id = ?",
                conversation.sessionId()
        );

        service.deleteSession(1L, conversation.sessionId());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM chat_sessions WHERE id = ?", Integer.class, conversation.sessionId()
        )).isZero();
        assertThatThrownBy(() -> service.deleteSession(1L, conversation.sessionId()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Chat session not found: " + conversation.sessionId());
    }
    @Test
    void sessionHistoryCanBeListedRestoredRenamedAndDeleted() {
        PreparedConversation conversation = service.prepare(
                1L, null, "/android/mentor", "chat-history-001", "帮我比较两个方向"
        );
        service.complete(
                1L, conversation.sessionId(), conversation.requestId(), "/android/mentor",
                Map.of("reply", "先统一比较维度。", "generationMode", "llm", "confidence", 0.88)
        );

        assertThat(service.listSessions(1L))
                .anySatisfy(item -> {
                    assertThat(item.id()).isEqualTo(conversation.sessionId());
                    assertThat(item.messageCount()).isEqualTo(2);
                    assertThat(item.lastMessage()).isEqualTo("先统一比较维度。");
                });

        var detail = service.getSession(1L, conversation.sessionId());
        assertThat(detail.messages()).hasSize(2);
        assertThat(detail.messages().get(1).response()).containsEntry("generationMode", "llm");
        assertThat(detail.messages().get(1).response()).containsEntry("evidenceBasis", java.util.List.of());
        assertThat(detail.messages().get(1).response()).containsEntry("uncertainties", java.util.List.of());

        assertThat(service.renameSession(1L, conversation.sessionId(), "方向选择讨论").title())
                .isEqualTo("方向选择讨论");
        service.deleteSession(1L, conversation.sessionId());
        assertThat(service.listSessions(1L)).noneMatch(item -> item.id() == conversation.sessionId());
        assertThatThrownBy(() -> service.getSession(1L, conversation.sessionId()))
                .isInstanceOf(BusinessException.class);
    }
}
