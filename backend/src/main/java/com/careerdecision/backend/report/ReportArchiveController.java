package com.careerdecision.backend.report;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportArchiveController {
    private final ReportArchiveService reportArchiveService;

    public ReportArchiveController(ReportArchiveService reportArchiveService) {
        this.reportArchiveService = reportArchiveService;
    }

    @PostMapping("/archive")
    public ApiResponse<ReportSnapshot> archive(
            @CurrentUser UserInfo user,
            @Valid @RequestBody ReportArchiveRequest request
    ) {
        return ApiResponse.success(reportArchiveService.archive(user.id(), request));
    }

    @GetMapping
    public ApiResponse<ReportPageResponse> list(
            @CurrentUser UserInfo user,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.success(reportArchiveService.list(user.id(), type, page, size));
    }

    @GetMapping("/{id}")
    public ApiResponse<ReportSnapshot> detail(@CurrentUser UserInfo user, @PathVariable String id) {
        return ApiResponse.success(reportArchiveService.get(user.id(), id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@CurrentUser UserInfo user, @PathVariable String id) {
        reportArchiveService.delete(user.id(), id);
        return ApiResponse.success(null);
    }
}
