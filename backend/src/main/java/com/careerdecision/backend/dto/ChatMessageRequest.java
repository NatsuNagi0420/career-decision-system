package com.careerdecision.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.LinkedHashMap;
import java.util.Map;

public record ChatMessageRequest(
        @Size(max = 80) String requestId,
        @Size(max = 64) String userId,
        @Size(max = 80) String page,
        @NotBlank @Size(max = 4000) String message,
        @Size(max = 40) Map<String, Object> context
) {
    public Map<String, Object> toAgentPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("request_id", requestId);
        payload.put("user_id", userId);
        payload.put("page", page);
        payload.put("message", message);
        payload.put("context", context == null ? Map.of() : context);
        return payload;
    }
}
