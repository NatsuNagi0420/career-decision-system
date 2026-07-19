package com.careerdecision.backend.decision;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class DecisionProjectEntity {
    private Long id;
    private Long userId;
    private String title;
    private String question;
    private LocalDate decisionDeadline;
    private String background;
    private String triggerReason;
    private String prioritiesJson;
    private String mustHavesJson;
    private String dealBreakersJson;
    private String status;
    private String currentStage;
    private Integer isCurrent;
    private Integer version;
    private Integer flowVersion;
    private LocalDateTime comparisonReviewedAt;
    private Integer candidateCount;
    private Integer jobSampleCount;
    private String primaryTarget;
    private LocalDateTime decidedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getUserId() { return userId; }
    public void setUserId(Long value) { userId = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getQuestion() { return question; }
    public void setQuestion(String value) { question = value; }
    public LocalDate getDecisionDeadline() { return decisionDeadline; }
    public void setDecisionDeadline(LocalDate value) { decisionDeadline = value; }
    public String getBackground() { return background; }
    public void setBackground(String value) { background = value; }
    public String getTriggerReason() { return triggerReason; }
    public void setTriggerReason(String value) { triggerReason = value; }
    public String getPrioritiesJson() { return prioritiesJson; }
    public void setPrioritiesJson(String value) { prioritiesJson = value; }
    public String getMustHavesJson() { return mustHavesJson; }
    public void setMustHavesJson(String value) { mustHavesJson = value; }
    public String getDealBreakersJson() { return dealBreakersJson; }
    public void setDealBreakersJson(String value) { dealBreakersJson = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }
    public String getCurrentStage() { return currentStage; }
    public void setCurrentStage(String value) { currentStage = value; }
    public Integer getIsCurrent() { return isCurrent; }
    public void setIsCurrent(Integer value) { isCurrent = value; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer value) { version = value; }
    public Integer getFlowVersion() { return flowVersion; }
    public void setFlowVersion(Integer value) { flowVersion = value; }
    public LocalDateTime getComparisonReviewedAt() { return comparisonReviewedAt; }
    public void setComparisonReviewedAt(LocalDateTime value) { comparisonReviewedAt = value; }
    public Integer getCandidateCount() { return candidateCount; }
    public void setCandidateCount(Integer value) { candidateCount = value; }
    public Integer getJobSampleCount() { return jobSampleCount; }
    public void setJobSampleCount(Integer value) { jobSampleCount = value; }
    public String getPrimaryTarget() { return primaryTarget; }
    public void setPrimaryTarget(String value) { primaryTarget = value; }
    public LocalDateTime getDecidedAt() { return decidedAt; }
    public void setDecidedAt(LocalDateTime value) { decidedAt = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
}
