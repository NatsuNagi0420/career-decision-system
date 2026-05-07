/**
 * 文件说明：AI 助手对话请求参数 DTO。
 * 职责：承载前端发起助手对话时的页面标识、用户输入内容以及上下文数据。
 */
package com.example.ba.dto;

import lombok.Data;

import java.util.Map;

@Data
public class AssistantChatDTO {
    private String page;
    private String message;
    private Map<String, Object> context;
}

