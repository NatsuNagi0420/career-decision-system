package com.careerdecision.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.LinkedHashMap;
import java.util.Map;

public record ResumeAnalyzeRequest(
        @Size(max = 80) String requestId,
        @Size(max = 64) String userId,
        @Size(max = 120) String targetRole,
        @NotBlank @Size(max = 20000) String resumeText
) {
    public Map<String, Object> toAgentPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("request_id", requestId);
        payload.put("user_id", userId);
        payload.put("target_role", targetRole);
        payload.put("resume_text", resumeText);
        return payload;
    }
}
