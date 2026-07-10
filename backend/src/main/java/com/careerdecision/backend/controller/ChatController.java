package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.dto.ChatMessageRequest;
import com.careerdecision.backend.service.AgentServerClient;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/chat")
public class ChatController {
    private final AgentServerClient agentServerClient;

    public ChatController(AgentServerClient agentServerClient) {
        this.agentServerClient = agentServerClient;
    }

    @PostMapping("/messages")
    public ApiResponse<Map<String, Object>> send(@Valid @RequestBody ChatMessageRequest request) {
        return ApiResponse.success(agentServerClient.sendChatMessage(request.toAgentPayload()), request.requestId());
    }
}
