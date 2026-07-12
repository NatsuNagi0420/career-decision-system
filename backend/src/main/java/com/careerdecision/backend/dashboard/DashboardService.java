package com.careerdecision.backend.dashboard;

import com.careerdecision.backend.action.ActionPlanModels.TodayResponse;
import com.careerdecision.backend.action.ActionPlanService;
import com.careerdecision.backend.dashboard.DashboardModels.DashboardResponse;
import com.careerdecision.backend.dashboard.DashboardModels.ProjectSnapshot;
import com.careerdecision.backend.dashboard.DashboardModels.ProfileSnapshot;
import com.careerdecision.backend.dashboard.DashboardModels.ReviewSnapshot;
import com.careerdecision.backend.dashboard.DashboardModels.ExecutionRiskSnapshot;
import com.careerdecision.backend.dashboard.DashboardModels.AgentAdviceSnapshot;
import com.careerdecision.backend.agent.AgentRunRecord;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class DashboardService {
    private final DashboardMapper mapper;
    private final ActionPlanService actionPlanService;
    private final ObjectMapper objectMapper;

    public DashboardService(
            DashboardMapper mapper,
            ActionPlanService actionPlanService,
            ObjectMapper objectMapper
    ) {
        this.mapper = mapper;
        this.actionPlanService = actionPlanService;
        this.objectMapper = objectMapper;
    }

    public DashboardResponse get(long userId) {
        boolean onboardingCompleted = mapper.onboardingCompleted(userId) > 0;
        ProfileSnapshot profile = mapper.profile(userId);
        ProjectSnapshot project = mapper.currentProject(userId);
        TodayResponse today = actionPlanService.today(userId);
        ExecutionRiskSnapshot risk = mapper.executionRisk(userId, LocalDateTime.now().minusDays(14));
        if (risk == null) risk = new ExecutionRiskSnapshot(0, 0, 0, 0);
        AgentAdviceSnapshot advice = latestAdvice(userId);
        ReviewSnapshot review = mapper.latestReview(userId);
        NextAction next = nextAction(onboardingCompleted, project, today);
        return new DashboardResponse(
                next.state(), next.action(), next.label(), next.path(), onboardingCompleted,
                profile, project, today, risk, advice, review, LocalDateTime.now()
        );
    }

    private AgentAdviceSnapshot latestAdvice(long userId) {
        AgentRunRecord run = mapper.latestSuccessfulAgentRun(userId);
        if (run == null || run.getOutputJson() == null || run.getOutputJson().isBlank()) return null;
        try {
            JsonNode output = objectMapper.readTree(run.getOutputJson());
            String conclusion = firstText(output, "conclusion", "reply");
            if (conclusion == null) return null;
            return new AgentAdviceSnapshot(
                    run.getId(), run.getAgentType(), firstText(output, "generationMode", "generation_mode"),
                    conclusion, firstText(output, "nextStep", "next_step"),
                    run.getFinishedAt() == null ? run.getStartedAt() : run.getFinishedAt()
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    private String firstText(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node.path(key);
            if (value.isTextual() && !value.asText().isBlank()) return value.asText().trim();
        }
        return null;
    }

    private NextAction nextAction(boolean onboardingCompleted, ProjectSnapshot project, TodayResponse today) {
        if (!onboardingCompleted) {
            return new NextAction("new_user", "complete_onboarding", "开始第一次职业决策", "/onboarding");
        }
        if (project == null) {
            return new NextAction("ready_to_explore", "create_decision_project", "开始第一次职业决策", "/decision-projects/new");
        }
        if (project.primaryTarget() == null || project.primaryTarget().isBlank()) {
            return new NextAction("exploring", "continue_decision", "继续当前决策", "/decision-projects/" + project.id());
        }
        if (today.planId() == null) {
            return new NextAction("decided", "generate_action_plan", "生成四周行动计划", "/action-plans/new?projectId=" + project.id());
        }
        if (!today.tasks().isEmpty()) {
            return new NextAction("executing", "continue_task", "继续今日任务", "/action-plans/" + today.planId());
        }
        return new NextAction("review_due", "weekly_review", "完成本周复盘", "/weekly-reviews/new?planId=" + today.planId());
    }

    private record NextAction(String state, String action, String label, String path) { }
}
