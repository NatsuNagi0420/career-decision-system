package com.careerdecision.backend.pathplan;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/path-plans")
public class PathPlanArchiveController {
    private final PathPlanArchiveService archiveService;

    public PathPlanArchiveController(PathPlanArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @PostMapping("/archive")
    public ApiResponse<PathPlanDetailResponse> archive(
            @CurrentUser UserInfo user,
            @Valid @RequestBody PathPlanArchiveRequest request
    ) {
        return ApiResponse.success(archiveService.archive(user.id(), request));
    }

    @GetMapping
    public ApiResponse<List<PathPlanSnapshotResponse>> list(
            @CurrentUser UserInfo user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ApiResponse.success(archiveService.list(user.id(), page, size));
    }

    @GetMapping("/{planId}")
    public ApiResponse<PathPlanDetailResponse> detail(
            @CurrentUser UserInfo user,
            @PathVariable long planId
    ) {
        return ApiResponse.success(archiveService.detail(user.id(), planId));
    }

    @PatchMapping("/{planId}/tasks/{taskId}")
    public ApiResponse<PathPlanDetailResponse> updateTaskStatus(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @PathVariable long taskId,
            @Valid @RequestBody PathPlanTaskStatusRequest request
    ) {
        return ApiResponse.success(archiveService.updateTaskStatus(user.id(), planId, taskId, request));
    }

    @DeleteMapping("/{planId}")
    public ApiResponse<Void> archiveStatus(
            @CurrentUser UserInfo user,
            @PathVariable long planId
    ) {
        archiveService.archiveStatus(user.id(), planId);
        return ApiResponse.success(null);
    }
}
