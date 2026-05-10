/**
 * 文件说明：用户活动信号数据传输对象
 * 职责：封装前端发送的用户行为信号数据
 */
package com.example.ba.dto;

import java.util.List;
import java.util.Map;

public class ActivitySignalDTO {
    private String page;
    private Long pageEnteredAt;
    private Long lastActionAt;
    private List<String> recentActions;
    private Map<String, Object> pageState;

    public String getPage() {
        return page;
    }

    public void setPage(String page) {
        this.page = page;
    }

    public Long getPageEnteredAt() {
        return pageEnteredAt;
    }

    public void setPageEnteredAt(Long pageEnteredAt) {
        this.pageEnteredAt = pageEnteredAt;
    }

    public Long getLastActionAt() {
        return lastActionAt;
    }

    public void setLastActionAt(Long lastActionAt) {
        this.lastActionAt = lastActionAt;
    }

    public List<String> getRecentActions() {
        return recentActions;
    }

    public void setRecentActions(List<String> recentActions) {
        this.recentActions = recentActions;
    }

    public Map<String, Object> getPageState() {
        return pageState;
    }

    public void setPageState(Map<String, Object> pageState) {
        this.pageState = pageState;
    }
}
