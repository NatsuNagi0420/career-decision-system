package com.careerdecision.backend.review;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class WeeklyReviewModels {
    private WeeklyReviewModels() {
    }

    public record ReviewRequest(
            @NotNull Long planId,
            @NotNull @Min(1) @Max(12) Integer weekNo,
            @Size(max = 5000) String completedSummary,
            @Size(max = 5000) String evidenceSummary,
            @Size(max = 5000) String difficulties,
            @Min(0) @Max(10080) Integer nextWeekMinutes,
            @Pattern(regexp = "increased|stable|decreased") String confidenceTrend,
            @Size(max = 5000) String confidenceReason,
            @Size(max = 10000) String adjustmentProposal,
            @Size(max = 80) String requestId
    ) {
    }

    public record AdjustmentRequest(
            @NotNull Boolean confirmed,
            @NotBlank @Size(max = 80) String requestId,
            @NotNull @Size(min = 1, max = 50) List<@Valid TaskAdjustment> adjustments
    ) {
    }

    public record TaskAdjustment(
            @NotNull Long taskId,
            @NotBlank @Pattern(regexp = "todo|in_progress|completed|deferred|skipped") String status,
            @Size(max = 500) String reason,
            LocalDateTime deferredTo,
            @NotNull @Min(0) Integer expectedVersion
    ) {
    }

    public record ReviewResponse(
            long id,
            long planId,
            long projectId,
            int weekNo,
            String completedSummary,
            String evidenceSummary,
            String difficulties,
            Integer nextWeekMinutes,
            String confidenceTrend,
            String confidenceReason,
            String adjustmentProposal,
            String status,
            String requestId,
            LocalDateTime submittedAt,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }
}
