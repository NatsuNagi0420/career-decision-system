package com.careerdecision.backend.assistant;

import java.time.LocalDateTime;

public class ChatSessionRecord {
    private Long id;
    private Long userId;
    private String title;
    private String lastPage;
    private String status;
    private Integer messageCount;
    private String lastMessage;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getUserId() { return userId; }
    public void setUserId(Long value) { userId = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getLastPage() { return lastPage; }
    public void setLastPage(String value) { lastPage = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }
    public Integer getMessageCount() { return messageCount; }
    public void setMessageCount(Integer value) { messageCount = value; }
    public String getLastMessage() { return lastMessage; }
    public void setLastMessage(String value) { lastMessage = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
}
