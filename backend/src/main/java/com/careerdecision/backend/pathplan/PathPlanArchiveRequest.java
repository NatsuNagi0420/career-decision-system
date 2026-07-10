package com.careerdecision.backend.pathplan;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record PathPlanArchiveRequest(
        @NotBlank @Size(max = 120) String targetRole,
        @Size(max = 2000) String overview,
        @Positive Long agentRunId,
        @NotEmpty @Size(max = 12) List<@Valid PathPlanMilestonePayload> milestones,
        @Size(max = 20) List<@Size(max = 300) String> checkpoints
) {
}
