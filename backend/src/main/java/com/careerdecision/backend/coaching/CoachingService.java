package com.careerdecision.backend.coaching;

import com.careerdecision.backend.action.ActionPlanModels.PlanDetail;
import com.careerdecision.backend.action.ActionPlanService;
import com.careerdecision.backend.career.CareerDirectionModels.DirectionResponse;
import com.careerdecision.backend.career.CareerDirectionService;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectDetail;
import com.careerdecision.backend.decision.DecisionProjectService;
import com.careerdecision.backend.dto.AgentCoachingRequest;
import com.careerdecision.backend.review.WeeklyReviewModels.ReviewResponse;
import com.careerdecision.backend.review.WeeklyReviewService;
import com.careerdecision.backend.service.AgentServerClient;
import com.careerdecision.backend.profile.UserProfileService;
import com.careerdecision.backend.user.UserInfo;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CoachingService {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() { };

    private final DecisionProjectService decisionProjectService;
    private final ActionPlanService actionPlanService;
    private final WeeklyReviewService weeklyReviewService;
    private final CareerDirectionService careerDirectionService;
    private final AgentServerClient agentServerClient;
    private final ObjectMapper objectMapper;
    private final UserProfileService userProfileService;
    private final DecisionContextAssembler decisionContextAssembler;

    public CoachingService(
            DecisionProjectService decisionProjectService,
            ActionPlanService actionPlanService,
            WeeklyReviewService weeklyReviewService,
            CareerDirectionService careerDirectionService,
            AgentServerClient agentServerClient,
            ObjectMapper objectMapper,
            UserProfileService userProfileService,
            DecisionContextAssembler decisionContextAssembler
    ) {
        this.decisionProjectService = decisionProjectService;
        this.actionPlanService = actionPlanService;
        this.weeklyReviewService = weeklyReviewService;
        this.careerDirectionService = careerDirectionService;
        this.agentServerClient = agentServerClient;
        this.objectMapper = objectMapper;
        this.userProfileService = userProfileService;
        this.decisionContextAssembler = decisionContextAssembler;
    }

    public Map<String, Object> coachDecision(UserInfo user, long projectId, AgentCoachingRequest request) {
        ProjectDetail project = decisionProjectService.detail(user.id(), projectId);
        List<String> directions = careerDirectionService.list(user.id(), null, null).stream()
                .map(DirectionResponse::name)
                .limit(40)
                .toList();
        Map<String, Object> payload = basePayload(user, request);
        payload.put("project", map(project));
        payload.put("available_directions", directions);
        payload.put("decision_context", decisionContextAssembler.assemble(user, project, null, null));
        return agentServerClient.coachDecision(payload);
    }

    public Map<String, Object> compareJobs(UserInfo user, long projectId, AgentCoachingRequest request) {
        ProjectDetail project = decisionProjectService.detail(user.id(), projectId);
        Map<String, Object> payload = basePayload(user, request);
        payload.put("project", map(project));
        payload.put("decision_context", decisionContextAssembler.assemble(user, project, null, null));
        return agentServerClient.compareDecisionJobs(payload);
    }

    public Map<String, Object> coachAction(UserInfo user, long planId, AgentCoachingRequest request) {
        PlanDetail plan = actionPlanService.detail(user.id(), planId);
        ProjectDetail project = decisionProjectService.detail(user.id(), plan.projectId());
        Map<String, Object> payload = basePayload(user, request);
        payload.put("plan", map(plan));
        payload.put("decision_context", decisionContextAssembler.assemble(user, project, plan, null));
        return agentServerClient.coachAction(payload);
    }

    public Map<String, Object> coachWeeklyReview(UserInfo user, long reviewId, AgentCoachingRequest request) {
        ReviewResponse review = weeklyReviewService.detail(user.id(), reviewId);
        PlanDetail plan = actionPlanService.detail(user.id(), review.planId());
        Map<String, Object> payload = basePayload(user, request);
        payload.put("review", map(review));
        payload.put("plan", map(plan));
        ProjectDetail project = decisionProjectService.detail(user.id(), plan.projectId());
        payload.put("decision_context", decisionContextAssembler.assemble(user, project, plan, review));
        return agentServerClient.coachWeeklyReview(payload);
    }

    private Map<String, Object> basePayload(UserInfo user, AgentCoachingRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("request_id", request.requestId().trim());
        payload.put("user_id", String.valueOf(user.id()));
        payload.put("allow_external_model", userProfileService.allowsExternalAi(user.id()));
        if (request.focus() != null && !request.focus().isBlank()) {
            payload.put("focus", request.focus().trim());
        }
        return payload;
    }

    private Map<String, Object> map(Object value) {
        return objectMapper.convertValue(value, MAP_TYPE);
    }
}
