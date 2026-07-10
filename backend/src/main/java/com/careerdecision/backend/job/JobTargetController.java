package com.careerdecision.backend.job;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/jobs/targets")
public class JobTargetController {
    private final JobTargetService targetService;

    public JobTargetController(JobTargetService targetService) {
        this.targetService = targetService;
    }

    @GetMapping
    public ApiResponse<List<JobSummaryResponse>> list(@CurrentUser UserInfo user) {
        return ApiResponse.success(targetService.list(user.id()));
    }

    @PostMapping("/{jobId}")
    public ApiResponse<List<JobSummaryResponse>> add(
            @CurrentUser UserInfo user,
            @PathVariable long jobId
    ) {
        return ApiResponse.success(targetService.add(user.id(), jobId));
    }

    @DeleteMapping("/{jobId}")
    public ApiResponse<List<JobSummaryResponse>> remove(
            @CurrentUser UserInfo user,
            @PathVariable long jobId
    ) {
        return ApiResponse.success(targetService.remove(user.id(), jobId));
    }
}
