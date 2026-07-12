package com.careerdecision.backend.agent;

import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.dao.DuplicateKeyException;

import java.lang.reflect.Array;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class AgentRunService {
    private static final int MAX_REQUEST_ID_LENGTH = 80;
    private static final int MAX_AGENT_TYPE_LENGTH = 60;
    private static final int MAX_MODEL_NAME_LENGTH = 80;
    private static final int MAX_ERROR_LENGTH = 4000;
    private static final int MAX_STRING_LENGTH = 4000;
    private static final String REDACTED = "[redacted]";
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern PHONE_PATTERN = Pattern.compile(
            "(?<!\\d)(?:\\+?\\d[\\d\\s-]{7,}\\d)(?!\\d)"
    );
    private static final Pattern BEARER_TOKEN_PATTERN = Pattern.compile(
            "(?i)\\bBearer\\s+[A-Za-z0-9._~+\\-/=]+"
    );
    private static final Pattern SENSITIVE_ASSIGNMENT_PATTERN = Pattern.compile(
            "(?i)((?:\"|')?(?:resume[_-]?text|messages|message|raw[_-]?profile|"
                    + "improved[_-]?fragments|password(?:[_-]?hash)?|access[_-]?token|"
                    + "refresh[_-]?token|token|authorization|phone|email|id[_-]?card|"
                    + "identity[_-]?number)(?:\"|')?\\s*(?:=|:)\\s*)"
                    + "(\"[^\"]*\"|'[^']*'|[^,;\\r\\n}\\]]+)"
    );
    private static final Set<String> SENSITIVE_KEYS = Set.of(
            "resumetext",
            "message",
            "messages",
            "rawprofile",
            "improvedfragments",
            "password",
            "passwordhash",
            "token",
            "accesstoken",
            "refreshtoken",
            "authorization",
            "phone",
            "email",
            "idcard",
            "identitynumber",
            "focus",
            "background",
            "completedsummary",
            "evidencesummary",
            "difficulties",
            "confidencereason",
            "adjustmentproposal"
    );

    private final AgentRunMapper agentRunMapper;
    private final ObjectMapper objectMapper;

    public AgentRunService(AgentRunMapper agentRunMapper, ObjectMapper objectMapper) {
        this.agentRunMapper = agentRunMapper;
        this.objectMapper = objectMapper;
    }

    public Long recordSuccess(
            String agentType,
            String requestId,
            Map<String, Object> input,
            Map<String, Object> output,
            long latencyMs,
            LocalDateTime startedAt,
            LocalDateTime finishedAt
    ) {
        AgentRunRecord record = baseRecord(agentType, requestId, input, latencyMs, startedAt, finishedAt);
        record.setStatus("success");
        record.setModelName(extractModelName(output));
        record.setOutputJson(toAuditJson(output));
        return insertOrReuse(record, true);
    }

    public Long recordFailure(
            String agentType,
            String requestId,
            Map<String, Object> input,
            RuntimeException error,
            long latencyMs,
            LocalDateTime startedAt,
            LocalDateTime finishedAt
    ) {
        AgentRunRecord record = baseRecord(agentType, requestId, input, latencyMs, startedAt, finishedAt);
        record.setStatus("failed");
        record.setErrorMessage(safeErrorMessage(error));
        return insertOrReuse(record, false);
    }

    public Long verifyLinkableRunId(Long agentRunId, long userId, String agentType) {
        if (agentRunId == null) {
            return null;
        }
        if (agentRunId <= 0) {
            throw new BusinessException(40070, "agentRunId must be a positive id.");
        }
        String normalizedType = blankToDefault(agentType, "unknown");
        if (agentRunMapper.countLinkable(agentRunId, userId, normalizedType) == 0) {
            throw new BusinessException(40470, "Agent run not found or not linkable: " + agentRunId);
        }
        return agentRunId;
    }

    Object sanitizeForAudit(Object value) {
        return sanitizeValue(value);
    }

    private Long insertOrReuse(AgentRunRecord record, boolean successful) {
        try {
            agentRunMapper.insert(record);
            return record.getId();
        } catch (DuplicateKeyException ex) {
            AgentRunRecord existing = agentRunMapper.findByRequestId(record.getRequestId());
            if (existing != null && sameRequestOwner(existing, record)) {
                if (successful && !"success".equals(existing.getStatus())) {
                    record.setId(existing.getId());
                    agentRunMapper.upgradeToSuccess(record);
                }
                return existing.getId();
            }

            record.setRequestId(collisionSafeRequestId(record.getRequestId()));
            agentRunMapper.insert(record);
            return record.getId();
        }
    }

    private boolean sameRequestOwner(AgentRunRecord left, AgentRunRecord right) {
        return Objects.equals(left.getUserId(), right.getUserId())
                && Objects.equals(left.getAgentType(), right.getAgentType());
    }

    private String collisionSafeRequestId(String requestId) {
        String suffix = "-" + UUID.randomUUID().toString().substring(0, 12);
        int prefixLength = Math.max(0, MAX_REQUEST_ID_LENGTH - suffix.length());
        String prefix = requestId == null ? "request" : requestId.substring(0, Math.min(prefixLength, requestId.length()));
        return prefix + suffix;
    }

    private AgentRunRecord baseRecord(
            String agentType,
            String requestId,
            Map<String, Object> input,
            long latencyMs,
            LocalDateTime startedAt,
            LocalDateTime finishedAt
    ) {
        AgentRunRecord record = new AgentRunRecord();
        record.setRequestId(normalizeRequestId(requestId));
        record.setUserId(parseUserId(input == null ? null : input.get("user_id")));
        record.setAgentType(limit(blankToDefault(agentType, "unknown"), MAX_AGENT_TYPE_LENGTH));
        record.setInputJson(toAuditJson(input));
        record.setLatencyMs(toIntLatency(latencyMs));
        record.setStartedAt(startedAt == null ? LocalDateTime.now() : startedAt);
        record.setFinishedAt(finishedAt == null ? LocalDateTime.now() : finishedAt);
        return record;
    }

    private String toAuditJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(sanitizeValue(value));
        } catch (JsonProcessingException ex) {
            return "{\"serialization_error\":\"Failed to serialize audit payload.\"}";
        }
    }

    private Object sanitizeValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> sanitized = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String key = String.valueOf(entry.getKey());
                sanitized.put(key, isSensitiveKey(key) ? REDACTED : sanitizeValue(entry.getValue()));
            }
            return sanitized;
        }
        if (value instanceof Iterable<?> iterable) {
            List<Object> sanitized = new ArrayList<>();
            for (Object item : iterable) {
                sanitized.add(sanitizeValue(item));
            }
            return sanitized;
        }
        if (value.getClass().isArray()) {
            List<Object> sanitized = new ArrayList<>();
            int length = Array.getLength(value);
            for (int index = 0; index < length; index++) {
                sanitized.add(sanitizeValue(Array.get(value, index)));
            }
            return sanitized;
        }
        if (value instanceof String text) {
            return limit(text, MAX_STRING_LENGTH);
        }
        return value;
    }

    private String safeErrorMessage(RuntimeException error) {
        if (error == null || error.getMessage() == null || error.getMessage().isBlank()) {
            return "Agent run failed.";
        }
        return limit(redactSensitiveText(error.getMessage()), MAX_ERROR_LENGTH);
    }

    private String redactSensitiveText(String value) {
        String redacted = SENSITIVE_ASSIGNMENT_PATTERN.matcher(value).replaceAll("$1" + REDACTED);
        redacted = BEARER_TOKEN_PATTERN.matcher(redacted).replaceAll(REDACTED);
        redacted = EMAIL_PATTERN.matcher(redacted).replaceAll(REDACTED);
        redacted = PHONE_PATTERN.matcher(redacted).replaceAll(REDACTED);
        return redacted;
    }

    private boolean isSensitiveKey(String key) {
        String normalized = normalizeKey(key);
        return SENSITIVE_KEYS.contains(normalized)
                || normalized.endsWith("token")
                || normalized.contains("password")
                || normalized.contains("authorization");
    }

    private Long parseUserId(Object value) {
        if (value instanceof Number number) {
            long id = number.longValue();
            return id > 0 ? id : null;
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                long id = Long.parseLong(text.trim());
                return id > 0 ? id : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private String extractModelName(Map<String, Object> output) {
        if (output == null) {
            return null;
        }
        Object modelName = firstPresent(output, "model_name", "modelName", "model");
        if (modelName == null && output.get("metadata") instanceof Map<?, ?> metadata) {
            modelName = firstPresent(metadata, "model_name", "modelName", "model");
        }
        if (modelName == null) {
            return null;
        }
        String text = String.valueOf(modelName).trim();
        return text.isEmpty() ? null : limit(text, MAX_MODEL_NAME_LENGTH);
    }

    private Object firstPresent(Map<?, ?> map, String... keys) {
        for (String key : keys) {
            if (map.containsKey(key)) {
                return map.get(key);
            }
        }
        return null;
    }

    private String normalizeRequestId(String requestId) {
        String normalized = blankToDefault(requestId, UUID.randomUUID().toString());
        return limit(normalized.trim(), MAX_REQUEST_ID_LENGTH);
    }

    private int toIntLatency(long latencyMs) {
        if (latencyMs <= 0) {
            return 0;
        }
        return latencyMs > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) latencyMs;
    }

    private String normalizeKey(String key) {
        return key.replace("_", "")
                .replace("-", "")
                .toLowerCase(Locale.ROOT);
    }

    private String blankToDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private String limit(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        String marker = "...[truncated]";
        if (maxLength <= marker.length()) {
            return value.substring(0, maxLength);
        }
        return value.substring(0, maxLength - marker.length()) + marker;
    }
}
