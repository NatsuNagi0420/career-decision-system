package com.careerdecision.backend.report;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/decision-projects")
public class DecisionReportController {
    private final ReportArchiveService reportArchiveService;

    public DecisionReportController(ReportArchiveService reportArchiveService) {
        this.reportArchiveService = reportArchiveService;
    }

    @PostMapping("/{projectId}/reports/snapshot")
    public ApiResponse<ReportSnapshot> snapshot(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody DecisionSnapshotRequest request
    ) {
        return ApiResponse.success(
                reportArchiveService.archiveDecisionSnapshot(user.id(), projectId, request),
                request.requestId()
        );
    }
}
