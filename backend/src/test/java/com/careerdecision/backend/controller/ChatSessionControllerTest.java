package com.careerdecision.backend.controller;

import com.careerdecision.backend.assistant.ChatConversationService;
import com.careerdecision.backend.assistant.ChatConversationService.PreparedConversation;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ChatSessionControllerTest {
    private static final String AUTHORIZATION = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ChatConversationService conversationService;

    @Test
    void sessionHistoryRequiresAuthorization() throws Exception {
        mockMvc.perform(get("/api/v1/chat/sessions"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void sessionCanBeListedRestoredRenamedAndDeletedWithoutChangingMessageContract() throws Exception {
        PreparedConversation conversation = completedConversation(
                1L,
                "chat-session-controller-001",
                "帮我梳理下一步",
                "先验证一个真实岗位样本。"
        );
        int sessionId = Math.toIntExact(conversation.sessionId());

        mockMvc.perform(get("/api/v1/chat/sessions")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id", is(sessionId)))
                .andExpect(jsonPath("$.data[0].title", is("帮我梳理下一步")))
                .andExpect(jsonPath("$.data[0].messageCount", is(2)))
                .andExpect(jsonPath("$.data[0].lastMessage", is("先验证一个真实岗位样本。")));

        mockMvc.perform(get("/api/v1/chat/sessions/{sessionId}", sessionId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id", is(sessionId)))
                .andExpect(jsonPath("$.data.messages", hasSize(2)))
                .andExpect(jsonPath("$.data.messages[0].role", is("user")))
                .andExpect(jsonPath("$.data.messages[1].role", is("assistant")))
                .andExpect(jsonPath("$.data.messages[1].response.sessionId", is(sessionId)))
                .andExpect(jsonPath("$.data.messages[1].response.reply", is("先验证一个真实岗位样本。")))
                .andExpect(jsonPath("$.data.messages[1].response.evidenceBasis", hasSize(0)))
                .andExpect(jsonPath("$.data.messages[1].response.uncertainties", hasSize(0)));

        mockMvc.perform(patch("/api/v1/chat/sessions/{sessionId}", sessionId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"岗位验证讨论"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id", is(sessionId)))
                .andExpect(jsonPath("$.data.title", is("岗位验证讨论")));

        mockMvc.perform(delete("/api/v1/chat/sessions/{sessionId}", sessionId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId", is(sessionId)))
                .andExpect(jsonPath("$.data.deleted", is(true)));

        mockMvc.perform(get("/api/v1/chat/sessions/{sessionId}", sessionId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40490)));
    }

    @Test
    void sessionEndpointsDoNotExposeOrMutateAnotherUsersConversation() throws Exception {
        PreparedConversation bobConversation = completedConversation(
                2L,
                "chat-session-controller-bob-001",
                "Bob private question",
                "Bob private answer"
        );
        int sessionId = Math.toIntExact(bobConversation.sessionId());

        mockMvc.perform(get("/api/v1/chat/sessions")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));

        mockMvc.perform(get("/api/v1/chat/sessions/{sessionId}", sessionId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40490)));

        mockMvc.perform(patch("/api/v1/chat/sessions/{sessionId}", sessionId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Unauthorized rename"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40490)));

        mockMvc.perform(delete("/api/v1/chat/sessions/{sessionId}", sessionId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40490)));

        org.assertj.core.api.Assertions.assertThat(conversationService.getSession(2L, sessionId).title())
                .isEqualTo("Bob private question");
    }

    @Test
    void renameRejectsBlankAndOversizedTitles() throws Exception {
        PreparedConversation conversation = completedConversation(
                1L,
                "chat-session-controller-validation-001",
                "原始标题",
                "回答"
        );

        mockMvc.perform(patch("/api/v1/chat/sessions/{sessionId}", conversation.sessionId())
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"   "}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)));

        mockMvc.perform(patch("/api/v1/chat/sessions/{sessionId}", conversation.sessionId())
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + "a".repeat(81) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)));

        org.assertj.core.api.Assertions.assertThat(
                conversationService.getSession(1L, conversation.sessionId()).title()
        ).isEqualTo("原始标题");
    }

    private PreparedConversation completedConversation(
            long userId,
            String requestId,
            String question,
            String answer
    ) {
        PreparedConversation conversation = conversationService.prepare(
                userId, null, "/assistant", requestId, question
        );
        conversationService.complete(
                userId,
                conversation.sessionId(),
                conversation.requestId(),
                "/assistant",
                Map.of(
                        "sessionId", conversation.sessionId(),
                        "reply", answer,
                        "generationMode", "fallback",
                        "modelName", "test-model",
                        "confidence", 0.75
                )
        );
        return conversation;
    }
}
