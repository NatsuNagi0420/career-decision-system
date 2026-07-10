package com.careerdecision.backend.report;

import com.careerdecision.backend.agent.AgentRunService;
import com.careerdecision.backend.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
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

    @Test
    void archiveCreatesReportSnapshot() {
        ReportSnapshot report = service.archive(1L, request("career", "Career Report"));

        assertThat(report.id()).isNotBlank();
        assertThat(report.userId()).isEqualTo("1");
        assertThat(report.agentRunId()).isNull();
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

    private ReportArchiveRequest request(String type, String title) {
        return request(type, title, null);
    }

    private ReportArchiveRequest request(String type, String title, Long agentRunId) {
        return new ReportArchiveRequest(type, title, "summary", "content", agentRunId);
    }
}
