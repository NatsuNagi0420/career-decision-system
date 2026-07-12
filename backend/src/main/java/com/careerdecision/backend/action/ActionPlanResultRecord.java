package com.careerdecision.backend.action;

public class ActionPlanResultRecord {
    private Long id;
    private Long taskId;
    private Long userId;
    private String requestId;
    private String description;
    private String linkUrl;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getTaskId() { return taskId; }
    public void setTaskId(Long value) { taskId = value; }
    public Long getUserId() { return userId; }
    public void setUserId(Long value) { userId = value; }
    public String getRequestId() { return requestId; }
    public void setRequestId(String value) { requestId = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { description = value; }
    public String getLinkUrl() { return linkUrl; }
    public void setLinkUrl(String value) { linkUrl = value; }
}
