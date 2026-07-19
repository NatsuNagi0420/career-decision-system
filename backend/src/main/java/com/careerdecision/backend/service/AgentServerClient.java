package com.careerdecision.backend.service;

import com.careerdecision.backend.agent.AgentRunService;
import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.common.TraceContext;
import com.careerdecision.backend.config.AgentServerProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class AgentServerClient {
    private static final Logger log = LoggerFactory.getLogger(AgentServerClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final AgentRunService agentRunService;
    private final String baseUrl;
    private final String internalToken;
    private final Duration requestTimeout;

    public AgentServerClient(
            AgentServerProperties properties,
            ObjectMapper objectMapper,
            AgentRunService agentRunService
    ) {
        this.requestTimeout = Duration.ofSeconds(properties.normalizedTimeoutSeconds());
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(requestTimeout)
                .build();
        this.objectMapper = objectMapper;
        this.agentRunService = agentRunService;
        this.baseUrl = trimTrailingSlash(properties.baseUrl());
        this.internalToken = properties.normalizedInternalToken();
    }

    public Map<String, Object> generateCareerReport(Map<String, Object> payload) {
        return post("career_report", "/api/v1/career-reports/generate", payload);
    }

    public Map<String, Object> generateProfile(Map<String, Object> payload) {
        return post("profile", "/api/v1/profiles/generate", payload);
    }

    public Map<String, Object> sendChatMessage(Map<String, Object> payload) {
        return post("chat", "/api/v1/chat/messages", payload);
    }

    public Map<String, Object> analyzeResume(Map<String, Object> payload) {
        return post("resume", "/api/v1/resumes/analyze", payload);
    }

    public Map<String, Object> generatePathPlan(Map<String, Object> payload) {
        return post("path_plan", "/api/v1/path-plans/generate", payload);
    }

    public Map<String, Object> coachDecision(Map<String, Object> payload) {
        return post("decision_coach", "/api/v1/coaching/decision", payload);
    }

    public Map<String, Object> compareDecisionJobs(Map<String, Object> payload) {
        return post("job_comparison", "/api/v1/coaching/job-comparison", payload);
    }

    public Map<String, Object> coachAction(Map<String, Object> payload) {
        return post("action_coach", "/api/v1/coaching/action", payload);
    }

    public Map<String, Object> previewActionPlan(Map<String, Object> payload) {
        return post("action_plan_preview", "/api/v1/coaching/action-plan-preview", payload);
    }

    public Map<String, Object> coachWeeklyReview(Map<String, Object> payload) {
        return post("weekly_review", "/api/v1/coaching/weekly-review", payload);
    }

    private Map<String, Object> post(String agentType, String path, Map<String, Object> payload) {
        String traceId = traceIdFromPayload(payload);
        LocalDateTime startedAt = LocalDateTime.now();
        long startedNanos = System.nanoTime();
        try {
            String jsonPayload = toJson(payload);
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                    .version(HttpClient.Version.HTTP_1_1)
                    .timeout(requestTimeout)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("X-Internal-Token", internalToken)
                    .header("X-Request-ID", traceId)
                    .POST(HttpRequest.BodyPublishers.ofString(jsonPayload, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> httpResponse = send(request);
            if (httpResponse.statusCode() >= 400) {
                throw new IllegalStateException("Agent server request failed with status " + httpResponse.statusCode() + ".");
            }

            ApiResponse<Map<String, Object>> response = parse(httpResponse.body());

            if (response == null || response.code() != 0 || response.data() == null) {
                throw new IllegalStateException("Agent server returned an invalid " + agentType + " response.");
            }

            Map<String, Object> data = response.data();
            Long agentRunId = recordSuccess(agentType, traceId, payload, data, elapsedMillis(startedNanos), startedAt);
            if (agentRunId == null) {
                return data;
            }
            Map<String, Object> enrichedData = new LinkedHashMap<>(data);
            enrichedData.put("agentRunId", agentRunId);
            return enrichedData;
        } catch (RuntimeException ex) {
            recordFailure(agentType, traceId, payload, ex, elapsedMillis(startedNanos), startedAt);
            throw ex;
        }
    }

    private String traceIdFromPayload(Map<String, Object> payload) {
        Object requestId = payload.get("request_id");
        if (requestId instanceof String value && !value.isBlank()) {
            return value;
        }
        return TraceContext.getOrCreate();
    }

    private String trimTrailingSlash(String value) {
        if (value == null || value.isBlank()) {
            return "http://127.0.0.1:8001";
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String toJson(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to serialize agent request payload.", e);
        }
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (HttpTimeoutException e) {
            throw new IllegalStateException("Agent server request timed out.", e);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to call agent server.", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Agent server call was interrupted.", e);
        }
    }

    private ApiResponse<Map<String, Object>> parse(String body) {
        try {
            return objectMapper.readValue(body, new TypeReference<>() {
            });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to parse agent server response.", e);
        }
    }

    private long elapsedMillis(long startedNanos) {
        return Math.max(0, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedNanos));
    }

    private Long recordSuccess(
            String agentType,
            String traceId,
            Map<String, Object> payload,
            Map<String, Object> data,
            long latencyMs,
            LocalDateTime startedAt
    ) {
        try {
            return agentRunService.recordSuccess(agentType, traceId, payload, data, latencyMs, startedAt, LocalDateTime.now());
        } catch (RuntimeException ex) {
            log.warn("Failed to persist successful agent run audit for request {}.", traceId, ex);
            return null;
        }
    }

    private void recordFailure(
            String agentType,
            String traceId,
            Map<String, Object> payload,
            RuntimeException error,
            long latencyMs,
            LocalDateTime startedAt
    ) {
        try {
            agentRunService.recordFailure(agentType, traceId, payload, error, latencyMs, startedAt, LocalDateTime.now());
        } catch (RuntimeException ex) {
            log.warn("Failed to persist failed agent run audit for request {}.", traceId, ex);
        }
    }
}
