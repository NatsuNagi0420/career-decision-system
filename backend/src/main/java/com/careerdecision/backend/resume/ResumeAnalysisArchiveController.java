package com.careerdecision.backend.resume;

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

import java.util.List;

@RestController
@RequestMapping("/api/v1/resumes/analyses")
public class ResumeAnalysisArchiveController {
    private final ResumeAnalysisArchiveService archiveService;

    public ResumeAnalysisArchiveController(ResumeAnalysisArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @PostMapping("/archive")
    public ApiResponse<ResumeAnalysisDetailResponse> archive(
            @CurrentUser UserInfo user,
            @Valid @RequestBody ResumeAnalysisArchiveRequest request
    ) {
        return ApiResponse.success(archiveService.archive(user.id(), request));
    }

    @GetMapping
    public ApiResponse<List<ResumeAnalysisSnapshotResponse>> list(
            @CurrentUser UserInfo user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ApiResponse.success(archiveService.list(user.id(), page, size));
    }

    @GetMapping("/{analysisId}")
    public ApiResponse<ResumeAnalysisDetailResponse> detail(
            @CurrentUser UserInfo user,
            @PathVariable long analysisId
    ) {
        return ApiResponse.success(archiveService.detail(user.id(), analysisId));
    }

    @DeleteMapping("/{analysisId}")
    public ApiResponse<Void> delete(
            @CurrentUser UserInfo user,
            @PathVariable long analysisId
    ) {
        archiveService.delete(user.id(), analysisId);
        return ApiResponse.success(null);
    }
}
