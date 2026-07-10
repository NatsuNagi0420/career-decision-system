package com.careerdecision.backend.agent;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class AgentRunServiceTest {
    @Autowired
    private AgentRunService agentRunService;

    @Autowired
    private AgentRunMapper agentRunMapper;

    @Test
    void recordsSuccessWithSensitiveInputAndOutputRedacted() {
        LocalDateTime startedAt = LocalDateTime.now().minusSeconds(1);

        Long id = agentRunService.recordSuccess(
                "resume",
                "agent-run-success-001",
                Map.of(
                        "request_id", "agent-run-success-001",
                        "user_id", "1",
                        "resume_text", "raw resume should not be stored",
                        "profile", Map.of(
                                "target_role", "AI Application Engineer",
                                "email", "alice@example.com"
                        )
                ),
                Map.of(
                        "score", 86,
                        "improved_fragments", List.of("rewritten raw resume line"),
                        "metadata", Map.of("model_name", "mock-agent")
                ),
                42,
                startedAt,
                LocalDateTime.now()
        );

        AgentRunRecord record = agentRunMapper.findByRequestId("agent-run-success-001");

        assertThat(id).isNotNull();
        assertThat(record).isNotNull();
        assertThat(record.getStatus()).isEqualTo("success");
        assertThat(record.getAgentType()).isEqualTo("resume");
        assertThat(record.getUserId()).isEqualTo(1L);
        assertThat(record.getModelName()).isEqualTo("mock-agent");
        assertThat(record.getLatencyMs()).isEqualTo(42);
        assertThat(record.getInputJson()).contains("\"resume_text\":\"[redacted]\"");
        assertThat(record.getInputJson()).contains("\"email\":\"[redacted]\"");
        assertThat(record.getInputJson()).contains("AI Application Engineer");
        assertThat(record.getInputJson()).doesNotContain("raw resume should not be stored");
        assertThat(record.getOutputJson()).contains("\"improved_fragments\":\"[redacted]\"");
        assertThat(record.getOutputJson()).doesNotContain("rewritten raw resume line");
    }

    @Test
    void recordsFailureWithoutOutputPayload() {
        agentRunService.recordFailure(
                "chat",
                "agent-run-failed-001",
                Map.of(
                        "request_id", "agent-run-failed-001",
                        "user_id", "user-001",
                        "message", "private chat text"
                ),
                new IllegalStateException("Agent server request failed."),
                7,
                LocalDateTime.now().minusSeconds(1),
                LocalDateTime.now()
        );

        AgentRunRecord record = agentRunMapper.findByRequestId("agent-run-failed-001");

        assertThat(record).isNotNull();
        assertThat(record.getStatus()).isEqualTo("failed");
        assertThat(record.getUserId()).isNull();
        assertThat(record.getOutputJson()).isNull();
        assertThat(record.getErrorMessage()).isEqualTo("Agent server request failed.");
        assertThat(record.getInputJson()).contains("\"message\":\"[redacted]\"");
        assertThat(record.getInputJson()).doesNotContain("private chat text");
    }

    @Test
    void recordsFailureWithSensitiveErrorMessageRedacted() {
        agentRunService.recordFailure(
                "resume",
                "agent-run-failed-sensitive-001",
                Map.of(
                        "request_id", "agent-run-failed-sensitive-001",
                        "user_id", "1",
                        "resume_text", "private resume input should not be stored"
                ),
                new IllegalStateException(
                        "Agent failed: resume_text=private resume line; "
                                + "message: private chat text, "
                                + "Authorization: Bearer abc.def.ghi, "
                                + "email=alice@example.com, "
                                + "phone=138 0013 8000"
                ),
                9,
                LocalDateTime.now().minusSeconds(1),
                LocalDateTime.now()
        );

        AgentRunRecord record = agentRunMapper.findByRequestId("agent-run-failed-sensitive-001");

        assertThat(record).isNotNull();
        assertThat(record.getStatus()).isEqualTo("failed");
        assertThat(record.getErrorMessage()).contains("resume_text=[redacted]");
        assertThat(record.getErrorMessage()).contains("message: [redacted]");
        assertThat(record.getErrorMessage()).contains("Authorization: [redacted]");
        assertThat(record.getErrorMessage()).contains("email=[redacted]");
        assertThat(record.getErrorMessage()).contains("phone=[redacted]");
        assertThat(record.getErrorMessage()).doesNotContain("private resume line");
        assertThat(record.getErrorMessage()).doesNotContain("private chat text");
        assertThat(record.getErrorMessage()).doesNotContain("Bearer abc.def.ghi");
        assertThat(record.getErrorMessage()).doesNotContain("alice@example.com");
        assertThat(record.getErrorMessage()).doesNotContain("138 0013 8000");
        assertThat(record.getInputJson()).contains("\"resume_text\":\"[redacted]\"");
        assertThat(record.getInputJson()).doesNotContain("private resume input should not be stored");
    }
}
