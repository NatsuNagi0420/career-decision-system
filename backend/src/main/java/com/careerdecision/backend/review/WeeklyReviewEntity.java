package com.careerdecision.backend.review;

import java.time.LocalDateTime;

public class WeeklyReviewEntity {
    private Long id;
    private Long userId;
    private Long planId;
    private Long projectId;
    private Integer weekNo;
    private String completedSummary;
    private String evidenceSummary;
    private String difficulties;
    private Integer nextWeekMinutes;
    private String confidenceTrend;
    private String confidenceReason;
    private String adjustmentProposalJson;
    private String status;
    private String requestId;
    private LocalDateTime submittedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getUserId() { return userId; }
    public void setUserId(Long value) { userId = value; }
    public Long getPlanId() { return planId; }
    public void setPlanId(Long value) { planId = value; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long value) { projectId = value; }
    public Integer getWeekNo() { return weekNo; }
    public void setWeekNo(Integer value) { weekNo = value; }
    public String getCompletedSummary() { return completedSummary; }
    public void setCompletedSummary(String value) { completedSummary = value; }
    public String getEvidenceSummary() { return evidenceSummary; }
    public void setEvidenceSummary(String value) { evidenceSummary = value; }
    public String getDifficulties() { return difficulties; }
    public void setDifficulties(String value) { difficulties = value; }
    public Integer getNextWeekMinutes() { return nextWeekMinutes; }
    public void setNextWeekMinutes(Integer value) { nextWeekMinutes = value; }
    public String getConfidenceTrend() { return confidenceTrend; }
    public void setConfidenceTrend(String value) { confidenceTrend = value; }
    public String getConfidenceReason() { return confidenceReason; }
    public void setConfidenceReason(String value) { confidenceReason = value; }
    public String getAdjustmentProposalJson() { return adjustmentProposalJson; }
    public void setAdjustmentProposalJson(String value) { adjustmentProposalJson = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }
    public String getRequestId() { return requestId; }
    public void setRequestId(String value) { requestId = value; }
    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime value) { submittedAt = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
}
