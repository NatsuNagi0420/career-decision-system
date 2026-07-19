package com.careerdecision.backend.decision;

import java.time.LocalDateTime;

public class DecisionCandidateEntity {
    private Long id;
    private Long projectId;
    private Long directionId;
    private String name;
    private String sourceType;
    private String recommendationReason;
    private String opposingFactors;
    private String uncertainties;
    private String validationActionsJson;
    private Integer sortOrder;
    private String exclusionReason;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long value) { projectId = value; }
    public Long getDirectionId() { return directionId; }
    public void setDirectionId(Long value) { directionId = value; }
    public String getName() { return name; }
    public void setName(String value) { name = value; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String value) { sourceType = value; }
    public String getRecommendationReason() { return recommendationReason; }
    public void setRecommendationReason(String value) { recommendationReason = value; }
    public String getOpposingFactors() { return opposingFactors; }
    public void setOpposingFactors(String value) { opposingFactors = value; }
    public String getUncertainties() { return uncertainties; }
    public void setUncertainties(String value) { uncertainties = value; }
    public String getValidationActionsJson() { return validationActionsJson; }
    public void setValidationActionsJson(String value) { validationActionsJson = value; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer value) { sortOrder = value; }
    public String getExclusionReason() { return exclusionReason; }
    public void setExclusionReason(String value) { exclusionReason = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
}
