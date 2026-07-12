package com.careerdecision.backend.assistant;

import java.time.LocalDateTime;

public class ChatMessageRecord {
    private Long id;
    private Long sessionId;
    private Long userId;
    private String requestId;
    private String role;
    private String content;
    private Long agentRunId;
    private String metadataJson;
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long value) { sessionId = value; }
    public Long getUserId() { return userId; }
    public void setUserId(Long value) { userId = value; }
    public String getRequestId() { return requestId; }
    public void setRequestId(String value) { requestId = value; }
    public String getRole() { return role; }
    public void setRole(String value) { role = value; }
    public String getContent() { return content; }
    public void setContent(String value) { content = value; }
    public Long getAgentRunId() { return agentRunId; }
    public void setAgentRunId(Long value) { agentRunId = value; }
    public String getMetadataJson() { return metadataJson; }
    public void setMetadataJson(String value) { metadataJson = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { createdAt = value; }
}
