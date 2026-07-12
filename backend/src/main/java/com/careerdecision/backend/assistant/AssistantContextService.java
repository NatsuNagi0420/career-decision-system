package com.careerdecision.backend.assistant;

import com.careerdecision.backend.action.ActionPlanModels.PlanDetail;
import com.careerdecision.backend.action.ActionPlanService;
import com.careerdecision.backend.dashboard.DashboardModels.DashboardResponse;
import com.careerdecision.backend.dashboard.DashboardService;
import com.careerdecision.backend.decision.DecisionProjectModels.CandidateResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectDetail;
import com.careerdecision.backend.decision.DecisionProjectModels.TargetResponse;
import com.careerdecision.backend.decision.DecisionProjectService;
import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.job.JobDetailResponse;
import com.careerdecision.backend.job.JobService;
import com.careerdecision.backend.profile.UserProfileService;
import com.careerdecision.backend.review.WeeklyReviewModels.ReviewResponse;
import com.careerdecision.backend.review.WeeklyReviewService;
import com.careerdecision.backend.user.UserInfo;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the trusted, user-scoped context sent to the conversational agent.
 * Client-provided IDs select resources; they are never treated as data.
 */
@Service
public class AssistantContextService {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() { };
    private static final int MAX_CONTEXT_STRING = 1600;
    private static final int MAX_CONTEXT_ITEMS = 40;

    private final DashboardService dashboardService;
    private final UserProfileService userProfileService;
    private final DecisionProjectService decisionProjectService;
    private final ActionPlanService actionPlanService;
    private final WeeklyReviewService weeklyReviewService;
    private final JobService jobService;
    private final ObjectMapper objectMapper;

    public AssistantContextService(
            DashboardService dashboardService,
            UserProfileService userProfileService,
            DecisionProjectService decisionProjectService,
            ActionPlanService actionPlanService,
            WeeklyReviewService weeklyReviewService,
            JobService jobService,
            ObjectMapper objectMapper
    ) {
        this.dashboardService = dashboardService;
        this.userProfileService = userProfileService;
        this.decisionProjectService = decisionProjectService;
        this.actionPlanService = actionPlanService;
        this.weeklyReviewService = weeklyReviewService;
        this.jobService = jobService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> build(UserInfo user, String page, Map<String, Object> requestedContext) {
        Map<String, Object> requested = requestedContext == null ? Map.of() : requestedContext;
        DashboardResponse dashboard = dashboardService.get(user.id());
        Map<String, Object> context = new LinkedHashMap<>();
        putText(context, "page", page, 120);
        putText(context, "routePath", text(requested, "routePath"), 240);
        putText(context, "tab", text(requested, "tab"), 80);
        context.put("dashboard", compact(toMap(dashboard), 0));

        Map<String, Object> profile = toMap(userProfileService.get(user));
        profile.remove("userId");
        profile.remove("externalAiConsent");
        context.put("profile", compact(profile, 0));

        Long projectId = positiveId(requested, "projectId");
        Long planId = positiveId(requested, "planId");
        Long reviewId = positiveId(requested, "reviewId");
        boolean hasExplicitResource = projectId != null || planId != null || reviewId != null;

        ReviewResponse review = null;
        if (reviewId != null) {
            review = weeklyReviewService.detail(user.id(), reviewId);
            context.put("weeklyReview", compact(toMap(review), 0));
            if (planId != null && planId != review.planId()) {
                throw new BusinessException(40980, "Selected action plan and weekly review do not belong together.");
            }
            planId = review.planId();
        }

        PlanDetail plan = null;
        if (planId != null) {
            plan = actionPlanService.detail(user.id(), planId);
            context.put("plan", compact(toMap(plan), 0));
            if (projectId != null && projectId != plan.projectId()) {
                throw new BusinessException(40980, "Selected project and action plan do not belong to the same decision.");
            }
            projectId = plan.projectId();
        }

        if (projectId == null && dashboard.currentProject() != null) {
            projectId = dashboard.currentProject().id();
        }

        ProjectDetail project = null;
        if (projectId != null) {
            project = decisionProjectService.detail(user.id(), projectId);
            context.put("project", compact(toMap(project), 0));
            putText(context, "projectTitle", project.title(), MAX_CONTEXT_STRING);
        }

        if (plan == null && dashboard.today() != null && dashboard.today().planId() != null) {
            boolean sameProject = project == null
                    || dashboard.today().projectId() == null
                    || project.id() == dashboard.today().projectId();
            if (!hasExplicitResource || sameProject) {
                PlanDetail currentPlan = actionPlanService.detail(user.id(), dashboard.today().planId());
                if (project == null || project.id() == currentPlan.projectId()) {
                    plan = currentPlan;
                    context.put("plan", compact(toMap(plan), 0));
                    if (project == null) {
                        project = decisionProjectService.detail(user.id(), plan.projectId());
                        context.put("project", compact(toMap(project), 0));
                        putText(context, "projectTitle", project.title(), MAX_CONTEXT_STRING);
                    }
                }
            }
        }

        Long candidateId = firstId(requested, "candidateId", "currentCandidateId");
        if (candidateId != null && project != null) {
            CandidateResponse candidate = project.candidates().stream()
                    .filter(item -> item.id() == candidateId)
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(40451, "Decision candidate not found: " + candidateId));
            context.put("currentCandidate", compact(toMap(candidate), 0));
        }

        Long targetId = positiveId(requested, "targetId");
        if (targetId == null && plan != null) {
            targetId = plan.targetId();
        }
        if (targetId != null && project != null) {
            long selectedTargetId = targetId;
            TargetResponse target = project.targets().stream()
                    .filter(item -> item.id() == selectedTargetId)
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(40457, "Decision target not found: " + selectedTargetId));
            context.put("currentTarget", compact(toMap(target), 0));
            putText(context, "targetRole", target.targetName(), MAX_CONTEXT_STRING);
        }

        if (!context.containsKey("targetRole")) {
            String targetRole = plan == null ? null : plan.targetRole();
            if (targetRole == null && project != null) {
                targetRole = project.targets().stream()
                        .filter(item -> "primary".equals(item.targetType()))
                        .map(TargetResponse::targetName)
                        .findFirst()
                        .orElse(null);
            }
            if (targetRole == null && dashboard.currentProject() != null) {
                targetRole = dashboard.currentProject().primaryTarget();
            }
            if (targetRole == null) {
                targetRole = text(profile, "targetRole");
            }
            putText(context, "targetRole", targetRole, MAX_CONTEXT_STRING);
        }

        Long jobId = positiveId(requested, "jobId");
        if (jobId != null) {
            JobDetailResponse job = jobService.detail(jobId);
            context.put("currentJob", compact(toMap(job), 0));
        }
        return context;
    }

    private Long firstId(Map<String, Object> values, String... keys) {
        for (String key : keys) {
            Long id = positiveId(values, key);
            if (id != null) return id;
        }
        return null;
    }

    private Long positiveId(Map<String, Object> values, String key) {
        Object value = values.get(key);
        if (value instanceof Number number) {
            return number.longValue() > 0 ? number.longValue() : null;
        }
        if (value instanceof String string) {
            try {
                long id = Long.parseLong(string.trim());
                return id > 0 ? id : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private String text(Map<String, Object> values, String key) {
        Object value = values.get(key);
        return value instanceof String string && !string.isBlank() ? string.trim() : null;
    }

    private void putText(Map<String, Object> target, String key, String value, int maxLength) {
        if (value != null && !value.isBlank()) {
            target.put(key, truncate(value.trim(), maxLength));
        }
    }

    private Map<String, Object> toMap(Object value) {
        return objectMapper.convertValue(value, MAP_TYPE);
    }

    private Object compact(Object value, int depth) {
        if (value instanceof String string) {
            return truncate(string, MAX_CONTEXT_STRING);
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            map.entrySet().stream().limit(MAX_CONTEXT_ITEMS).forEach(entry -> {
                if (entry.getKey() != null) {
                    result.put(String.valueOf(entry.getKey()), compact(entry.getValue(), depth + 1));
                }
            });
            return result;
        }
        if (value instanceof Collection<?> collection) {
            return collection.stream().limit(MAX_CONTEXT_ITEMS)
                    .map(item -> compact(item, depth + 1))
                    .toList();
        }
        return value;
    }

    private String truncate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength) + "...";
    }
}
