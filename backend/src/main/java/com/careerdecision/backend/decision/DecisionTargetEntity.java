package com.careerdecision.backend.decision;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class DecisionTargetEntity {
    private Long id;
    private Long userId;
    private Long projectId;
    private Long candidateId;
    private String targetType;
    private String targetName;
    private String decisionReason;
    private String mainRisks;
    private LocalDate reviewDate;
    private LocalDateTime confirmedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getUserId() { return userId; }
    public void setUserId(Long value) { userId = value; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long value) { projectId = value; }
    public Long getCandidateId() { return candidateId; }
    public void setCandidateId(Long value) { candidateId = value; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String value) { targetType = value; }
    public String getTargetName() { return targetName; }
    public void setTargetName(String value) { targetName = value; }
    public String getDecisionReason() { return decisionReason; }
    public void setDecisionReason(String value) { decisionReason = value; }
    public String getMainRisks() { return mainRisks; }
    public void setMainRisks(String value) { mainRisks = value; }
    public LocalDate getReviewDate() { return reviewDate; }
    public void setReviewDate(LocalDate value) { reviewDate = value; }
    public LocalDateTime getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(LocalDateTime value) { confirmedAt = value; }
}
