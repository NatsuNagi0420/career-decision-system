package com.careerdecision.backend.coaching;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.dto.AgentCoachingRequest;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class CoachingController {
    private final CoachingService service;

    public CoachingController(CoachingService service) {
        this.service = service;
    }

    @PostMapping("/decision-projects/{projectId}/coach")
    public ApiResponse<Map<String, Object>> coachDecision(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody AgentCoachingRequest request
    ) {
        return ApiResponse.success(service.coachDecision(user, projectId, request), request.requestId());
    }

    @PostMapping("/decision-projects/{projectId}/comparison/suggest")
    public ApiResponse<Map<String, Object>> compareJobs(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody AgentCoachingRequest request
    ) {
        return ApiResponse.success(service.compareJobs(user, projectId, request), request.requestId());
    }

    @PostMapping("/action-plans/{planId}/coach")
    public ApiResponse<Map<String, Object>> coachAction(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @Valid @RequestBody AgentCoachingRequest request
    ) {
        return ApiResponse.success(service.coachAction(user, planId, request), request.requestId());
    }

    @PostMapping("/weekly-reviews/{reviewId}/coach")
    public ApiResponse<Map<String, Object>> coachWeeklyReview(
            @CurrentUser UserInfo user,
            @PathVariable long reviewId,
            @Valid @RequestBody AgentCoachingRequest request
    ) {
        return ApiResponse.success(service.coachWeeklyReview(user, reviewId, request), request.requestId());
    }
}
