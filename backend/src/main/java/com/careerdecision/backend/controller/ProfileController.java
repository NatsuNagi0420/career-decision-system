package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.dto.ProfileGenerateRequest;
import com.careerdecision.backend.service.AgentServerClient;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/profiles")
public class ProfileController {
    private final AgentServerClient agentServerClient;

    public ProfileController(AgentServerClient agentServerClient) {
        this.agentServerClient = agentServerClient;
    }

    @PostMapping("/generate")
    public ApiResponse<Map<String, Object>> generate(@Valid @RequestBody ProfileGenerateRequest request) {
        return ApiResponse.success(agentServerClient.generateProfile(request.toAgentPayload()), request.requestId());
    }
}
