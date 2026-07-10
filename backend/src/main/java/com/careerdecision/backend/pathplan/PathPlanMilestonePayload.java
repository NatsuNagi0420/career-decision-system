package com.careerdecision.backend.pathplan;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record PathPlanMilestonePayload(
        @NotBlank @Size(max = 160) String title,
        @Size(max = 80) String duration,
        @Size(max = 20) List<@Size(max = 500) String> tasks,
        @Size(max = 12) List<@Size(max = 300) String> acceptance
) {
}
