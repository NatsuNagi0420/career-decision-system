package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.dto.ResumeAnalyzeRequest;
import com.careerdecision.backend.service.AgentServerClient;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/resumes")
public class ResumeController {
    private final AgentServerClient agentServerClient;

    public ResumeController(AgentServerClient agentServerClient) {
        this.agentServerClient = agentServerClient;
    }

    @PostMapping("/analyze")
    public ApiResponse<Map<String, Object>> analyze(@Valid @RequestBody ResumeAnalyzeRequest request) {
        return ApiResponse.success(agentServerClient.analyzeResume(request.toAgentPayload()), request.requestId());
    }
}
