package com.careerdecision.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AgentCoachingRequest(
        @NotBlank @Size(max = 80) String requestId,
        @Size(max = 1000) String focus
) {
}
