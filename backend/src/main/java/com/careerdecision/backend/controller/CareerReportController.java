package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.dto.CareerReportGenerateRequest;
import com.careerdecision.backend.job.JobMatchResponse;
import com.careerdecision.backend.job.JobRecommendationRequest;
import com.careerdecision.backend.job.JobService;
import com.careerdecision.backend.service.AgentServerClient;
import com.careerdecision.backend.profile.UserProfileService;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/career-reports")
public class CareerReportController {
    private final AgentServerClient agentServerClient;
    private final JobService jobService;
    private final UserProfileService userProfileService;

    public CareerReportController(
            AgentServerClient agentServerClient,
            JobService jobService,
            UserProfileService userProfileService
    ) {
        this.agentServerClient = agentServerClient;
        this.jobService = jobService;
        this.userProfileService = userProfileService;
    }

    @PostMapping("/generate")
    public ApiResponse<Map<String, Object>> generate(
            @CurrentUser UserInfo user,
            @Valid @RequestBody CareerReportGenerateRequest request
    ) {
        Map<String, Object> payload = request.toAgentPayload();
        payload.put("user_id", String.valueOf(user.id()));
        payload.put("allow_external_model", userProfileService.allowsExternalAi(user.id()));
        List<Map<String, Object>> candidates = jobService.recommend(
                        new JobRecommendationRequest(request.profile(), request.assessment(), 8)
                ).stream()
                .map(JobMatchResponse::toAgentPayload)
                .toList();
        payload.put("job_candidates", candidates);
        return ApiResponse.success(agentServerClient.generateCareerReport(payload), request.requestId());
    }
}
