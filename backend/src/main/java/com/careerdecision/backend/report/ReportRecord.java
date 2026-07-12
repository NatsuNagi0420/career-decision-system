package com.careerdecision.backend.report;

import java.time.LocalDateTime;

public class ReportRecord {
    private Long id;
    private Long userId;
    private Long decisionProjectId;
    private Long agentRunId;
    private String type;
    private String title;
    private String summary;
    private String contentJson;
    private Integer snapshotVersion;
    private String generationRequestId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getAgentRunId() {
        return agentRunId;
    }

    public Long getDecisionProjectId() {
        return decisionProjectId;
    }

    public void setDecisionProjectId(Long decisionProjectId) {
        this.decisionProjectId = decisionProjectId;
    }

    public void setAgentRunId(Long agentRunId) {
        this.agentRunId = agentRunId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public String getContentJson() {
        return contentJson;
    }

    public void setContentJson(String contentJson) {
        this.contentJson = contentJson;
    }

    public Integer getSnapshotVersion() {
        return snapshotVersion;
    }

    public void setSnapshotVersion(Integer snapshotVersion) {
        this.snapshotVersion = snapshotVersion;
    }

    public String getGenerationRequestId() {
        return generationRequestId;
    }

    public void setGenerationRequestId(String generationRequestId) {
        this.generationRequestId = generationRequestId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
