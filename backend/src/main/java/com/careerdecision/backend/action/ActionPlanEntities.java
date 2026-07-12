package com.careerdecision.backend.action;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class ActionPlanEntities {
    private ActionPlanEntities() {
    }

    public static class PlanEntity {
        private Long id;
        private Long userId;
        private Long decisionProjectId;
        private Long decisionTargetId;
        private String targetRole;
        private String overview;
        private String status;
        private Integer durationWeeks;
        private String generationRequestId;
        private Integer version;
        private LocalDate startDate;
        private LocalDate endDate;
        private Integer taskCount;
        private Integer completedTaskCount;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public Long getId() { return id; }
        public void setId(Long value) { id = value; }
        public Long getUserId() { return userId; }
        public void setUserId(Long value) { userId = value; }
        public Long getDecisionProjectId() { return decisionProjectId; }
        public void setDecisionProjectId(Long value) { decisionProjectId = value; }
        public Long getDecisionTargetId() { return decisionTargetId; }
        public void setDecisionTargetId(Long value) { decisionTargetId = value; }
        public String getTargetRole() { return targetRole; }
        public void setTargetRole(String value) { targetRole = value; }
        public String getOverview() { return overview; }
        public void setOverview(String value) { overview = value; }
        public String getStatus() { return status; }
        public void setStatus(String value) { status = value; }
        public Integer getDurationWeeks() { return durationWeeks; }
        public void setDurationWeeks(Integer value) { durationWeeks = value; }
        public String getGenerationRequestId() { return generationRequestId; }
        public void setGenerationRequestId(String value) { generationRequestId = value; }
        public Integer getVersion() { return version; }
        public void setVersion(Integer value) { version = value; }
        public LocalDate getStartDate() { return startDate; }
        public void setStartDate(LocalDate value) { startDate = value; }
        public LocalDate getEndDate() { return endDate; }
        public void setEndDate(LocalDate value) { endDate = value; }
        public Integer getTaskCount() { return taskCount; }
        public void setTaskCount(Integer value) { taskCount = value; }
        public Integer getCompletedTaskCount() { return completedTaskCount; }
        public void setCompletedTaskCount(Integer value) { completedTaskCount = value; }
        public LocalDateTime getCreatedAt() { return createdAt; }
        public void setCreatedAt(LocalDateTime value) { createdAt = value; }
        public LocalDateTime getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
    }

    public static class WeekEntity {
        private Long id;
        private Long planId;
        private Integer weekNo;
        private String title;
        private String weekGoal;
        private Integer sortOrder;

        public Long getId() { return id; }
        public void setId(Long value) { id = value; }
        public Long getPlanId() { return planId; }
        public void setPlanId(Long value) { planId = value; }
        public Integer getWeekNo() { return weekNo; }
        public void setWeekNo(Integer value) { weekNo = value; }
        public String getTitle() { return title; }
        public void setTitle(String value) { title = value; }
        public String getWeekGoal() { return weekGoal; }
        public void setWeekGoal(String value) { weekGoal = value; }
        public Integer getSortOrder() { return sortOrder; }
        public void setSortOrder(Integer value) { sortOrder = value; }
    }

    public static class TaskEntity {
        private Long id;
        private Long milestoneId;
        private Integer weekNo;
        private String title;
        private String taskType;
        private String content;
        private String status;
        private LocalDateTime dueAt;
        private Integer estimatedMinutes;
        private String acceptanceCriteria;
        private LocalDateTime startedAt;
        private LocalDateTime completedAt;
        private LocalDateTime deferredTo;
        private String skipReason;
        private Integer sortOrder;
        private Integer version;
        private LocalDateTime updatedAt;

        public Long getId() { return id; }
        public void setId(Long value) { id = value; }
        public Long getMilestoneId() { return milestoneId; }
        public void setMilestoneId(Long value) { milestoneId = value; }
        public Integer getWeekNo() { return weekNo; }
        public void setWeekNo(Integer value) { weekNo = value; }
        public String getTitle() { return title; }
        public void setTitle(String value) { title = value; }
        public String getTaskType() { return taskType; }
        public void setTaskType(String value) { taskType = value; }
        public String getContent() { return content; }
        public void setContent(String value) { content = value; }
        public String getStatus() { return status; }
        public void setStatus(String value) { status = value; }
        public LocalDateTime getDueAt() { return dueAt; }
        public void setDueAt(LocalDateTime value) { dueAt = value; }
        public Integer getEstimatedMinutes() { return estimatedMinutes; }
        public void setEstimatedMinutes(Integer value) { estimatedMinutes = value; }
        public String getAcceptanceCriteria() { return acceptanceCriteria; }
        public void setAcceptanceCriteria(String value) { acceptanceCriteria = value; }
        public LocalDateTime getStartedAt() { return startedAt; }
        public void setStartedAt(LocalDateTime value) { startedAt = value; }
        public LocalDateTime getCompletedAt() { return completedAt; }
        public void setCompletedAt(LocalDateTime value) { completedAt = value; }
        public LocalDateTime getDeferredTo() { return deferredTo; }
        public void setDeferredTo(LocalDateTime value) { deferredTo = value; }
        public String getSkipReason() { return skipReason; }
        public void setSkipReason(String value) { skipReason = value; }
        public Integer getSortOrder() { return sortOrder; }
        public void setSortOrder(Integer value) { sortOrder = value; }
        public Integer getVersion() { return version; }
        public void setVersion(Integer value) { version = value; }
        public LocalDateTime getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
    }

    public record TargetRow(Long id, Long projectId, String targetName) { }

    public record TaskResultRow(
            Long id, String description, String linkUrl, String verificationStatus,
            LocalDateTime createdAt, LocalDateTime updatedAt
    ) { }
}
