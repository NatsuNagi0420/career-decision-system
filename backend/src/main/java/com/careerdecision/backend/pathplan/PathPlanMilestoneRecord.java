package com.careerdecision.backend.pathplan;

public class PathPlanMilestoneRecord {
    private Long id;
    private Long planId;
    private String title;
    private String duration;
    private Integer sortOrder;
    private String acceptanceJson;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getPlanId() {
        return planId;
    }

    public void setPlanId(Long planId) {
        this.planId = planId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDuration() {
        return duration;
    }

    public void setDuration(String duration) {
        this.duration = duration;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    public String getAcceptanceJson() {
        return acceptanceJson;
    }

    public void setAcceptanceJson(String acceptanceJson) {
        this.acceptanceJson = acceptanceJson;
    }
}
