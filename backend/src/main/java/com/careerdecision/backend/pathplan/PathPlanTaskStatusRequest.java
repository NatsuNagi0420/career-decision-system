package com.careerdecision.backend.pathplan;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PathPlanTaskStatusRequest(
        @NotBlank @Size(max = 16) String status
) {
}
