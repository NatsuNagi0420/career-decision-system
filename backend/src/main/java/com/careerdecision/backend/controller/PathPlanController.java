package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.dto.PathPlanGenerateRequest;
import com.careerdecision.backend.service.AgentServerClient;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/path-plans")
public class PathPlanController {
    private final AgentServerClient agentServerClient;

    public PathPlanController(AgentServerClient agentServerClient) {
        this.agentServerClient = agentServerClient;
    }

    @PostMapping("/generate")
    public ApiResponse<Map<String, Object>> generate(@Valid @RequestBody PathPlanGenerateRequest request) {
        return ApiResponse.success(agentServerClient.generatePathPlan(request.toAgentPayload()), request.requestId());
    }
}
