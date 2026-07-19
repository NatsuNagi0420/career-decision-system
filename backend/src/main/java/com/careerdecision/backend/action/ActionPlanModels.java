package com.careerdecision.backend.action;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class ActionPlanModels {
    private ActionPlanModels() {
    }

    public record GenerateRequest(
            @NotBlank @Size(max = 80) String requestId,
            @NotNull Long projectId,
            Long targetId,
            @Min(2) @Max(12) Integer durationWeeks,
            LocalDate startDate,
            @Pattern(regexp = "validation|action") String planType
    ) {
    }

    public record PreviewRequest(
            @NotBlank @Size(max = 80) String requestId,
            @NotNull Long projectId,
            Long targetId,
            @Min(2) @Max(12) Integer durationWeeks,
            LocalDate startDate,
            @Size(max = 1000) String focus,
            @Pattern(regexp = "validation|action") String planType
    ) {
    }

    public record PreviewTask(
            @NotBlank @Size(max = 200) String title,
            @NotBlank @Pattern(regexp = "career_research|skill_learning|project|resume|networking|interview|application|custom") String taskType,
            @NotBlank @Size(max = 1000) String content,
            @NotNull @Min(5) @Max(10080) Integer estimatedMinutes,
            @NotBlank @Size(max = 1000) String acceptanceCriteria,
            @NotBlank @Size(max = 1000) String rationale,
            @Size(max = 1000) String capabilityGap,
            @Size(max = 1000) String jobRequirement,
            @Size(max = 12) List<@Size(max = 160) String> sourceRefs
    ) {
    }

    public record PreviewWeek(
            @NotNull @Min(1) @Max(12) Integer weekNo,
            @NotBlank @Size(max = 500) String goal,
            @NotNull @Size(min = 1, max = 4) List<@Valid PreviewTask> tasks
    ) {
    }

    public record PlanEvidenceBasis(
            @NotBlank @Size(max = 1000) String statement,
            @Size(max = 12) List<@Size(max = 160) String> sourceRefs
    ) {
    }

    public record PlanPreview(
            String requestId,
            long projectId,
            long targetId,
            String targetRole,
            String planType,
            String overview,
            int durationWeeks,
            LocalDate startDate,
            LocalDate endDate,
            String generationMode,
            String modelName,
            double confidence,
            List<PlanEvidenceBasis> evidenceBasis,
            List<String> uncertainties,
            List<PreviewWeek> weeks
    ) {
    }

    public record ConfirmPreviewRequest(
            @NotBlank @Size(max = 80) String requestId,
            @NotNull Long projectId,
            @NotNull Long targetId,
            @NotNull @Min(2) @Max(12) Integer durationWeeks,
            @NotNull LocalDate startDate,
            @NotBlank @Pattern(regexp = "validation|action") String planType,
            @NotBlank @Size(max = 5000) String overview,
            @NotNull @Size(min = 2, max = 12) List<@Valid PreviewWeek> weeks
    ) {
    }

    public record PlanUpdateRequest(
            @Size(max = 5000) String overview,
            @Size(max = 20) String status
    ) {
    }

    public record TaskRequest(
            @NotNull @Min(1) @Max(12) Integer weekNo,
            @NotBlank @Size(max = 200) String title,
            @NotBlank @Size(max = 40) String taskType,
            @Size(max = 500) String content,
            LocalDateTime dueAt,
            @Min(5) @Max(10080) Integer estimatedMinutes,
            @NotBlank @Size(max = 800) String acceptanceCriteria,
            @Min(0) Integer sortOrder,
            @Min(0) Integer expectedVersion
    ) {
    }

    public record TaskStatusRequest(
            @NotBlank @Pattern(regexp = "todo|in_progress|completed|deferred|skipped") String status,
            @Size(max = 500) String reason,
            LocalDateTime deferredTo,
            @NotBlank @Size(max = 80) String requestId,
            @NotNull @Min(0) Integer expectedVersion
    ) {
    }

    public record ReorderRequest(
            @NotNull @Size(min = 1, max = 100) List<@NotNull Long> taskIds,
            @NotNull @Size(min = 1, max = 100) Map<Long, @NotNull @Min(0) Integer> expectedVersions
    ) {
    }

    public record TaskResultRequest(
            @NotBlank @Size(max = 5000) String description,
            @Size(max = 1000) String linkUrl,
            @Size(max = 80) String requestId,
            Boolean saveAsEvidence
    ) {
    }

    public record TaskResultResponse(
            long id,
            String description,
            String linkUrl,
            String verificationStatus,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    public record TaskResponse(
            long id,
            int weekNo,
            String title,
            String taskType,
            String content,
            String status,
            LocalDateTime dueAt,
            Integer estimatedMinutes,
            String acceptanceCriteria,
            LocalDateTime startedAt,
            LocalDateTime completedAt,
            LocalDateTime deferredTo,
            String skipReason,
            int sortOrder,
            int version,
            List<TaskResultResponse> results,
            LocalDateTime updatedAt
    ) {
    }

    public record WeekResponse(
            long id,
            int weekNo,
            String title,
            String goal,
            List<TaskResponse> tasks
    ) {
    }

    public record PlanSummary(
            long id,
            long projectId,
            long targetId,
            String targetRole,
            String planType,
            String status,
            int durationWeeks,
            int taskCount,
            int completedTaskCount,
            int progressPercent,
            LocalDate startDate,
            LocalDate endDate,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    public record PlanDetail(
            long id,
            long projectId,
            long targetId,
            String targetRole,
            String planType,
            String overview,
            String status,
            int durationWeeks,
            int version,
            LocalDate startDate,
            LocalDate endDate,
            int taskCount,
            int completedTaskCount,
            int progressPercent,
            List<WeekResponse> weeks,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    public record TodayResponse(
            Long planId,
            Long projectId,
            Long targetId,
            String targetRole,
            String planType,
            int weekNo,
            int completedThisWeek,
            int totalThisWeek,
            List<TaskResponse> tasks,
            LocalDateTime serverTime
    ) {
        public static TodayResponse empty() {
            return new TodayResponse(null, null, null, null, null, 0, 0, 0, List.of(), LocalDateTime.now());
        }
    }
}
