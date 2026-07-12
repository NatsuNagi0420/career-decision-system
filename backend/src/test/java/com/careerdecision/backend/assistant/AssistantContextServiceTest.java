package com.careerdecision.backend.assistant;

import com.careerdecision.backend.decision.DecisionProjectModels.ProjectRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectDetail;
import com.careerdecision.backend.decision.DecisionProjectService;
import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.user.UserInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.jdbc.Sql;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Sql(statements = {
        "DELETE FROM reports",
        "DELETE FROM weekly_reviews",
        "DELETE FROM task_change_history",
        "DELETE FROM task_results",
        "DELETE FROM path_plan_tasks",
        "DELETE FROM path_plan_milestones",
        "DELETE FROM path_plans",
        "DELETE FROM target_confidence_feedback",
        "DELETE FROM decision_targets",
        "DELETE FROM comparison_results",
        "DELETE FROM comparison_criteria",
        "DELETE FROM decision_evidence",
        "DELETE FROM decision_project_job_samples",
        "DELETE FROM decision_candidates",
        "DELETE FROM decision_projects",
        "DELETE FROM personal_evidence",
        "DELETE FROM user_profiles"
})
class AssistantContextServiceTest {
    private static final UserInfo ALICE = new UserInfo(1L, "alice", "alice@example.com", null);
    private static final UserInfo BOB = new UserInfo(2L, "bob", "bob@example.com", null);

    @Autowired
    private AssistantContextService contextService;

    @Autowired
    private DecisionProjectService decisionProjectService;

    @Test
    void buildsTrustedContextAndRejectsForeignProjectId() {
        ProjectDetail aliceProject = decisionProjectService.create(1L, request("Alice 的决策"));
        ProjectDetail bobProject = decisionProjectService.create(2L, request("Bob 的决策"));

        Map<String, Object> context = contextService.build(
                ALICE,
                "/decision-projects/" + aliceProject.id(),
                Map.of(
                        "projectId", aliceProject.id(),
                        "targetRole", "客户端伪造目标"
                )
        );

        assertThat(context.get("projectTitle")).isEqualTo("Alice 的决策");
        assertThat(context.get("targetRole")).isNull();
        assertThat(context.toString()).doesNotContain("Bob 的决策");

        assertThatThrownBy(() -> contextService.build(
                ALICE,
                "/decision-projects/" + bobProject.id(),
                Map.of("projectId", bobProject.id())
        ))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.code()).isEqualTo(40456));
    }

    private ProjectRequest request(String title) {
        return new ProjectRequest(
                title,
                "未来三个月优先验证哪个方向？",
                null,
                "需要把选择依据写清楚。",
                null,
                java.util.List.of("成长空间"),
                java.util.List.of("有真实岗位样本"),
                java.util.List.of("长期没有反馈"),
                null
        );
    }
}
