package com.careerdecision.backend.service;

import com.careerdecision.backend.agent.AgentRunMapper;
import com.careerdecision.backend.agent.AgentRunRecord;
import com.careerdecision.backend.agent.AgentRunService;
import com.careerdecision.backend.common.TraceContext;
import com.careerdecision.backend.config.AgentServerProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class AgentServerClientSmokeTest {
    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AgentRunService agentRunService;

    @Autowired
    private AgentRunMapper agentRunMapper;

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
        TraceContext.clear();
    }

    @Test
    void successfulProxyCallPersistsAuditAndReturnsAgentRunId() throws Exception {
        AtomicReference<CapturedRequest> captured = new AtomicReference<>();
        startServer("/api/v1/career-reports/generate", 200, """
                {
                  "code": 0,
                  "message": "success",
                  "data": {
                    "summary": "Best matched with AI application engineering.",
                    "confidence": 0.82,
                    "metadata": {
                      "model_name": "mock-agent"
                    }
                  },
                  "timestamp": 1,
                  "traceId": "client-report-001"
                }
                """, captured);

        AgentServerClient client = client();
        Map<String, Object> result = client.generateCareerReport(Map.of(
                "request_id", "client-report-001",
                "user_id", "1",
                "profile", Map.of(
                        "target_role", "AI Application Engineer",
                        "email", "alice@example.com"
                )
        ));

        assertThat(result).containsEntry("summary", "Best matched with AI application engineering.");
        assertThat(result.get("agentRunId")).isInstanceOf(Number.class);
        assertThat(captured.get()).isNotNull();
        assertThat(captured.get().method()).isEqualTo("POST");
        assertThat(captured.get().internalToken()).isEqualTo("smoke-token");
        assertThat(captured.get().requestId()).isEqualTo("client-report-001");
        assertThat(captured.get().body()).contains("\"request_id\":\"client-report-001\"");

        AgentRunRecord run = agentRunMapper.findByRequestId("client-report-001");
        assertThat(run).isNotNull();
        assertThat(run.getId()).isEqualTo(((Number) result.get("agentRunId")).longValue());
        assertThat(run.getStatus()).isEqualTo("success");
        assertThat(run.getAgentType()).isEqualTo("career_report");
        assertThat(run.getModelName()).isEqualTo("mock-agent");
        assertThat(run.getInputJson()).contains("\"email\":\"[redacted]\"");
        assertThat(run.getInputJson()).doesNotContain("alice@example.com");
        assertThat(run.getOutputJson()).contains("Best matched with AI application engineering.");
        assertThat(run.getLatencyMs()).isNotNull();
    }

    @Test
    void failedProxyCallPersistsRedactedFailureAudit() throws Exception {
        startServer("/api/v1/resumes/analyze", 500, """
                {
                  "code": 500,
                  "message": "agent failure with private body echo",
                  "data": null,
                  "timestamp": 1,
                  "traceId": "client-resume-fail-001"
                }
                """, new AtomicReference<>());

        AgentServerClient client = client();

        assertThatThrownBy(() -> client.analyzeResume(Map.of(
                "request_id", "client-resume-fail-001",
                "user_id", "1",
                "target_role", "AI Application Engineer",
                "resume_text", "private resume line should not be stored"
        )))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Agent server request failed with status 500.");

        AgentRunRecord run = agentRunMapper.findByRequestId("client-resume-fail-001");
        assertThat(run).isNotNull();
        assertThat(run.getStatus()).isEqualTo("failed");
        assertThat(run.getAgentType()).isEqualTo("resume");
        assertThat(run.getOutputJson()).isNull();
        assertThat(run.getErrorMessage()).isEqualTo("Agent server request failed with status 500.");
        assertThat(run.getErrorMessage()).doesNotContain("private body echo");
        assertThat(run.getInputJson()).contains("\"resume_text\":\"[redacted]\"");
        assertThat(run.getInputJson()).doesNotContain("private resume line should not be stored");
    }

    @Test
    void timedOutProxyCallPersistsRedactedFailureAudit() throws Exception {
        startDelayedServer("/api/v1/chat/messages", 200, """
                {
                  "code": 0,
                  "message": "success",
                  "data": {
                    "answer": "too late"
                  },
                  "timestamp": 1,
                  "traceId": "client-chat-timeout-001"
                }
                """, new AtomicReference<>(), 2000);

        AgentServerClient client = client(1);

        assertThatThrownBy(() -> client.sendChatMessage(Map.of(
                "request_id", "client-chat-timeout-001",
                "user_id", "1",
                "message", "private chat message should not be stored"
        )))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Agent server request timed out.");

        AgentRunRecord run = agentRunMapper.findByRequestId("client-chat-timeout-001");
        assertThat(run).isNotNull();
        assertThat(run.getStatus()).isEqualTo("failed");
        assertThat(run.getAgentType()).isEqualTo("chat");
        assertThat(run.getErrorMessage()).isEqualTo("Agent server request timed out.");
        assertThat(run.getInputJson()).contains("\"message\":\"[redacted]\"");
        assertThat(run.getInputJson()).doesNotContain("private chat message should not be stored");
    }

    private AgentServerClient client() {
        return client(null);
    }

    private AgentServerClient client(Integer timeoutSeconds) {
        return new AgentServerClient(
                new AgentServerProperties(
                        "http://127.0.0.1:" + server.getAddress().getPort(),
                        "smoke-token",
                        timeoutSeconds
                ),
                objectMapper,
                agentRunService
        );
    }

    private void startServer(
            String path,
            int status,
            String response,
            AtomicReference<CapturedRequest> captured
    ) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(path, exchange -> respond(exchange, status, response, captured));
        server.start();
    }

    private void startDelayedServer(
            String path,
            int status,
            String response,
            AtomicReference<CapturedRequest> captured,
            long delayMillis
    ) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(path, exchange -> {
            try {
                Thread.sleep(delayMillis);
                respond(exchange, status, response, captured);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        });
        server.start();
    }

    private void respond(
            HttpExchange exchange,
            int status,
            String response,
            AtomicReference<CapturedRequest> captured
    ) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        captured.set(new CapturedRequest(
                exchange.getRequestMethod(),
                exchange.getRequestHeaders().getFirst("X-Internal-Token"),
                exchange.getRequestHeaders().getFirst("X-Request-ID"),
                body
        ));
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private record CapturedRequest(
            String method,
            String internalToken,
            String requestId,
            String body
    ) {
    }
}
