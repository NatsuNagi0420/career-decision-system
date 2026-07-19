package com.careerdecision.backend.decision;

import java.time.LocalDateTime;

public class ComparisonResultEntity {
    private Long id;
    private Long criterionId;
    private Long candidateId;
    private Integer score;
    private String assessment;
    private String evidenceRefsJson;
    private String uncertainty;
    private String validationAction;
    private String verdict;
    private LocalDateTime confirmedAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getCriterionId() { return criterionId; }
    public void setCriterionId(Long value) { criterionId = value; }
    public Long getCandidateId() { return candidateId; }
    public void setCandidateId(Long value) { candidateId = value; }
    public Integer getScore() { return score; }
    public void setScore(Integer value) { score = value; }
    public String getAssessment() { return assessment; }
    public void setAssessment(String value) { assessment = value; }
    public String getEvidenceRefsJson() { return evidenceRefsJson; }
    public void setEvidenceRefsJson(String value) { evidenceRefsJson = value; }
    public String getUncertainty() { return uncertainty; }
    public void setUncertainty(String value) { uncertainty = value; }
    public String getValidationAction() { return validationAction; }
    public void setValidationAction(String value) { validationAction = value; }
    public String getVerdict() { return verdict; }
    public void setVerdict(String value) { verdict = value; }
    public LocalDateTime getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(LocalDateTime value) { confirmedAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
}
