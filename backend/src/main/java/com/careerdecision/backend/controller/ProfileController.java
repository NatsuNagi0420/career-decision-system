package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.dto.ProfileGenerateRequest;
import com.careerdecision.backend.service.AgentServerClient;
import com.careerdecision.backend.profile.UserProfileService;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
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
    private final UserProfileService userProfileService;

    public ProfileController(AgentServerClient agentServerClient, UserProfileService userProfileService) {
        this.agentServerClient = agentServerClient;
        this.userProfileService = userProfileService;
    }

    @PostMapping("/generate")
    public ApiResponse<Map<String, Object>> generate(
            @CurrentUser UserInfo user,
            @Valid @RequestBody ProfileGenerateRequest request
    ) {
        Map<String, Object> payload = request.toAgentPayload();
        payload.put("user_id", String.valueOf(user.id()));
        payload.put("allow_external_model", userProfileService.allowsExternalAi(user.id()));
        return ApiResponse.success(agentServerClient.generateProfile(payload), request.requestId());
    }
}
