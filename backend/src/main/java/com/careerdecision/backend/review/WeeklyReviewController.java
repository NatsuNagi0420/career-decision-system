package com.careerdecision.backend.review;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.review.WeeklyReviewModels.AdjustmentRequest;
import com.careerdecision.backend.review.WeeklyReviewModels.ReviewRequest;
import com.careerdecision.backend.review.WeeklyReviewModels.ReviewResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/weekly-reviews")
public class WeeklyReviewController {
    private final WeeklyReviewService service;

    public WeeklyReviewController(WeeklyReviewService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<List<ReviewResponse>> list(
            @CurrentUser UserInfo user,
            @RequestParam(required = false) Long planId
    ) {
        return ApiResponse.success(service.list(user.id(), planId));
    }

    @GetMapping("/{reviewId}")
    public ApiResponse<ReviewResponse> detail(@CurrentUser UserInfo user, @PathVariable long reviewId) {
        return ApiResponse.success(service.detail(user.id(), reviewId));
    }

    @PutMapping
    public ApiResponse<ReviewResponse> save(
            @CurrentUser UserInfo user,
            @Valid @RequestBody ReviewRequest request
    ) {
        return ApiResponse.success(service.save(user.id(), request));
    }

    @PostMapping("/{reviewId}/submit")
    public ApiResponse<ReviewResponse> submit(@CurrentUser UserInfo user, @PathVariable long reviewId) {
        return ApiResponse.success(service.submit(user.id(), reviewId));
    }

    @PostMapping("/{reviewId}/adjustments/apply")
    public ApiResponse<ReviewResponse> applyAdjustments(
            @CurrentUser UserInfo user,
            @PathVariable long reviewId,
            @Valid @RequestBody AdjustmentRequest request
    ) {
        return ApiResponse.success(service.applyAdjustments(user.id(), reviewId, request));
    }

    @DeleteMapping("/{reviewId}")
    public ApiResponse<Void> deleteDraft(@CurrentUser UserInfo user, @PathVariable long reviewId) {
        service.deleteDraft(user.id(), reviewId);
        return ApiResponse.success(null);
    }
}
