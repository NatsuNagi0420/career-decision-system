package com.careerdecision.backend.report;

import com.careerdecision.backend.action.ActionPlanModels.GenerateRequest;
import com.careerdecision.backend.action.ActionPlanService;
import com.careerdecision.backend.agent.AgentRunService;
import com.careerdecision.backend.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class ReportArchiveServiceTests {
    @Autowired
    private ReportArchiveService service;

    @Autowired
    private AgentRunService agentRunService;

    @Autowired
    private ActionPlanService actionPlanService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void archiveCreatesReportSnapshot() {
        ReportSnapshot report = service.archive(1L, request("career", "Career Report"));

        assertThat(report.id()).isNotBlank();
        assertThat(report.userId()).isEqualTo("1");
        assertThat(report.agentRunId()).isNull();
        assertThat(report.decisionProjectId()).isNull();
        assertThat(report.snapshotVersion()).isNull();
        assertThat(report.generationRequestId()).isNull();
        assertThat(report.type()).isEqualTo("career");
        assertThat(report.title()).isEqualTo("Career Report");
        assertThat(report.summary()).isEqualTo("summary");
        assertThat(report.content()).isEqualTo("content");
        assertThat(report.createdAt()).isNotNull();
        assertThat(report.updatedAt()).isEqualTo(report.createdAt());
    }

    @Test
    void listFiltersByUserIdAndTypeWithPagination() {
        service.archive(1L, request("career", "A"));
        service.archive(1L, request("resume", "B"));
        ReportSnapshot matching = service.archive(1L, request("career", "C"));
        service.archive(2L, request("career", "D"));

        ReportPageResponse response = service.list(1L, "career", 0, 1);

        assertThat(response.total()).isEqualTo(2);
        assertThat(response.totalPages()).isEqualTo(2);
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().getFirst()).isEqualTo(matching);
    }

    @Test
    void getReturnsExistingReport() {
        ReportSnapshot report = service.archive(1L, request("career", "Career Report"));

        assertThat(service.get(1L, report.id())).isEqualTo(report);
    }

    @Test
    void deleteRemovesExistingReport() {
        ReportSnapshot report = service.archive(1L, request("career", "Career Report"));

        service.delete(1L, report.id());

        assertThatThrownBy(() -> service.get(1L, report.id()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Report not found.");
    }

    @Test
    void userScopedAccessRejectsOtherUsersReports() {
        ReportSnapshot report = service.archive(2L, request("career", "Bob Report"));

        assertThat(service.list(1L, "career", 0, 20).items())
                .noneMatch(item -> item.id().equals(report.id()));
        assertThatThrownBy(() -> service.get(1L, report.id()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Report not found.");
        assertThatThrownBy(() -> service.delete(1L, report.id()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Report not found.");
    }

    @Test
    void listRejectsInvalidPageRequest() {
        assertThatThrownBy(() -> service.list(1L, null, -1, 20))
                .isInstanceOf(BusinessException.class)
                .hasMessage("page must be greater than or equal to 0.");

        assertThatThrownBy(() -> service.list(1L, null, 0, 0))
                .isInstanceOf(BusinessException.class)
                .hasMessage("size must be between 1 and 50.");

        assertThatThrownBy(() -> service.list(1L, null, 0, 51))
                .isInstanceOf(BusinessException.class)
                .hasMessage("size must be between 1 and 50.");
    }

    @Test
    void archiveLinksMatchingAgentRun() {
        Long agentRunId = agentRunService.recordSuccess(
                "career_report",
                "report-agent-run-001",
                Map.of("request_id", "report-agent-run-001", "user_id", "1"),
                Map.of("summary", "ok"),
                12,
                LocalDateTime.now().minusSeconds(1),
                LocalDateTime.now()
        );

        ReportSnapshot report = service.archive(1L, request("career_report", "Career Report", agentRunId));

        assertThat(report.agentRunId()).isEqualTo(agentRunId);
    }

    @Test
    void archiveRejectsAgentRunFromAnotherUser() {
        Long agentRunId = agentRunService.recordSuccess(
                "career_report",
                "report-agent-run-002",
                Map.of("request_id", "report-agent-run-002", "user_id", "2"),
                Map.of("summary", "ok"),
                12,
                LocalDateTime.now().minusSeconds(1),
                LocalDateTime.now()
        );

        assertThatThrownBy(() -> service.archive(1L, request("career_report", "Career Report", agentRunId)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Agent run not found or not linkable: " + agentRunId);
    }

    @Test
    void decisionSnapshotIsProjectOwnedVersionedAndIdempotent() {
        long projectId = 91001L;
        long candidateId = 91002L;
        long targetId = 91003L;
        jdbcTemplate.update("""
                INSERT INTO decision_projects (
                  id, user_id, title, question, status, current_stage, is_current, version, decided_at
                ) VALUES (?, 1, 'Java 后端还是数据分析', '未来三个月优先验证哪个方向？',
                          'decided', 'target', 1, 7, CURRENT_TIMESTAMP)
                """, projectId);
        jdbcTemplate.update("""
                INSERT INTO decision_candidates (
                  id, project_id, name, source_type, recommendation_reason, opposing_factors,
                  uncertainties, validation_actions_json, status, sort_order
                ) VALUES (?, ?, 'Java 后端', 'user', '已有项目证据', '系统基础仍需补齐',
                          '岗位样本仍少', '["分析岗位"]', 'active', 0)
                """, candidateId, projectId);
        jdbcTemplate.update("""
                INSERT INTO decision_targets (
                  id, user_id, project_id, candidate_id, target_type, target_name,
                  decision_reason, main_risks, confirmed_at
                ) VALUES (?, 1, ?, ?, 'primary', 'Java 后端', '已有证据更强', '岗位样本仍少', CURRENT_TIMESTAMP)
                """, targetId, projectId, candidateId);
        actionPlanService.generate(1L, new GenerateRequest(
                "decision-snapshot-plan-001", projectId, targetId, 4, LocalDate.of(2026, 7, 7)
        ));

        DecisionSnapshotRequest firstRequest = new DecisionSnapshotRequest("decision-snapshot-idempotent-001");
        ReportSnapshot first = service.archiveDecisionSnapshot(1L, projectId, firstRequest);
        ReportSnapshot repeated = service.archiveDecisionSnapshot(1L, projectId, firstRequest);
        ReportSnapshot secondVersion = service.archiveDecisionSnapshot(
                1L, projectId, new DecisionSnapshotRequest("decision-snapshot-idempotent-002")
        );

        assertThat(repeated.id()).isEqualTo(first.id());
        assertThat(first.decisionProjectId()).isEqualTo(projectId);
        assertThat(first.snapshotVersion()).isEqualTo(1);
        assertThat(first.generationRequestId()).isEqualTo("decision-snapshot-idempotent-001");
        assertThat(first.content()).contains(
                "decision-project-snapshot", "Java 后端", "岗位样本仍少",
                "actionPlan", "分析 5 个真实岗位", "acceptanceCriteria"
        );
        assertThat(secondVersion.snapshotVersion()).isEqualTo(2);

        assertThatThrownBy(() -> service.archiveDecisionSnapshot(
                2L, projectId, new DecisionSnapshotRequest("decision-snapshot-other-user")
        ))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Decision project not found: " + projectId);
    }

    private ReportArchiveRequest request(String type, String title) {
        return request(type, title, null);
    }

    private ReportArchiveRequest request(String type, String title, Long agentRunId) {
        return new ReportArchiveRequest(type, title, "summary", "content", agentRunId);
    }
}
