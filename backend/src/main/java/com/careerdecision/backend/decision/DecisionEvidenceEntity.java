package com.careerdecision.backend.decision;

import java.time.LocalDateTime;

public class DecisionEvidenceEntity {
    private Long id;
    private Long projectId;
    private Long candidateId;
    private Long personalEvidenceId;
    private String title;
    private String detail;
    private String sourceType;
    private String sourceRef;
    private String credibility;
    private String stance;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long value) { projectId = value; }
    public Long getCandidateId() { return candidateId; }
    public void setCandidateId(Long value) { candidateId = value; }
    public Long getPersonalEvidenceId() { return personalEvidenceId; }
    public void setPersonalEvidenceId(Long value) { personalEvidenceId = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getDetail() { return detail; }
    public void setDetail(String value) { detail = value; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String value) { sourceType = value; }
    public String getSourceRef() { return sourceRef; }
    public void setSourceRef(String value) { sourceRef = value; }
    public String getCredibility() { return credibility; }
    public void setCredibility(String value) { credibility = value; }
    public String getStance() { return stance; }
    public void setStance(String value) { stance = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
}
