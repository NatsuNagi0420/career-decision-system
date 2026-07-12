package com.careerdecision.backend.evidence;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class PersonalEvidenceEntity {
    private Long id;
    private Long userId;
    private String evidenceType;
    private String title;
    private String description;
    private String roleName;
    private String resultSummary;
    private String linkUrl;
    private String proficiency;
    private LocalDate lastUsedAt;
    private String feedback;
    private String sourceType;
    private String sourceRefType;
    private Long sourceRefId;
    private String credibility;
    private String visibility;
    private LocalDate occurredAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getUserId() { return userId; }
    public void setUserId(Long value) { userId = value; }
    public String getEvidenceType() { return evidenceType; }
    public void setEvidenceType(String value) { evidenceType = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { description = value; }
    public String getRoleName() { return roleName; }
    public void setRoleName(String value) { roleName = value; }
    public String getResultSummary() { return resultSummary; }
    public void setResultSummary(String value) { resultSummary = value; }
    public String getLinkUrl() { return linkUrl; }
    public void setLinkUrl(String value) { linkUrl = value; }
    public String getProficiency() { return proficiency; }
    public void setProficiency(String value) { proficiency = value; }
    public LocalDate getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(LocalDate value) { lastUsedAt = value; }
    public String getFeedback() { return feedback; }
    public void setFeedback(String value) { feedback = value; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String value) { sourceType = value; }
    public String getSourceRefType() { return sourceRefType; }
    public void setSourceRefType(String value) { sourceRefType = value; }
    public Long getSourceRefId() { return sourceRefId; }
    public void setSourceRefId(Long value) { sourceRefId = value; }
    public String getCredibility() { return credibility; }
    public void setCredibility(String value) { credibility = value; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String value) { visibility = value; }
    public LocalDate getOccurredAt() { return occurredAt; }
    public void setOccurredAt(LocalDate value) { occurredAt = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
}
