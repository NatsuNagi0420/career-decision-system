package com.careerdecision.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.LinkedHashMap;
import java.util.Map;

public record PathPlanGenerateRequest(
        @Size(max = 80) String requestId,
        @Size(max = 64) String userId,
        @NotNull @Size(max = 40) Map<String, Object> profile,
        @NotBlank @Size(max = 120) String targetRole
) {
    public Map<String, Object> toAgentPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("request_id", requestId);
        payload.put("user_id", userId);
        payload.put("profile", profile);
        payload.put("target_role", targetRole);
        return payload;
    }
}
