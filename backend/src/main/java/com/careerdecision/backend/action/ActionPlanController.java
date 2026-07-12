package com.careerdecision.backend.action;

import com.careerdecision.backend.action.ActionPlanModels.GenerateRequest;
import com.careerdecision.backend.action.ActionPlanModels.PlanDetail;
import com.careerdecision.backend.action.ActionPlanModels.PlanSummary;
import com.careerdecision.backend.action.ActionPlanModels.PlanUpdateRequest;
import com.careerdecision.backend.action.ActionPlanModels.ReorderRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskResultRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskStatusRequest;
import com.careerdecision.backend.action.ActionPlanModels.TodayResponse;
import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import jakarta.validation.constraints.Min;

import java.util.List;

@RestController
@RequestMapping("/api/v1/action-plans")
public class ActionPlanController {
    private final ActionPlanService service;

    public ActionPlanController(ActionPlanService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<List<PlanSummary>> list(@CurrentUser UserInfo user) {
        return ApiResponse.success(service.list(user.id()));
    }

    @PostMapping("/generate")
    public ApiResponse<PlanDetail> generate(
            @CurrentUser UserInfo user,
            @Valid @RequestBody GenerateRequest request
    ) {
        return ApiResponse.success(service.generate(user.id(), request));
    }

    @GetMapping("/current/today")
    public ApiResponse<TodayResponse> today(@CurrentUser UserInfo user) {
        return ApiResponse.success(service.today(user.id()));
    }

    @GetMapping("/{planId}")
    public ApiResponse<PlanDetail> detail(@CurrentUser UserInfo user, @PathVariable long planId) {
        return ApiResponse.success(service.detail(user.id(), planId));
    }

    @PatchMapping("/{planId}")
    public ApiResponse<PlanDetail> update(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @Valid @RequestBody PlanUpdateRequest request
    ) {
        return ApiResponse.success(service.update(user.id(), planId, request));
    }

    @DeleteMapping("/{planId}")
    public ApiResponse<Void> archive(@CurrentUser UserInfo user, @PathVariable long planId) {
        service.archive(user.id(), planId);
        return ApiResponse.success(null);
    }

    @PostMapping("/{planId}/tasks")
    public ApiResponse<PlanDetail> addTask(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @Valid @RequestBody TaskRequest request
    ) {
        return ApiResponse.success(service.addTask(user.id(), planId, request));
    }

    @PutMapping("/{planId}/tasks/{taskId}")
    public ApiResponse<PlanDetail> updateTask(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @PathVariable long taskId,
            @Valid @RequestBody TaskRequest request
    ) {
        return ApiResponse.success(service.updateTask(user.id(), planId, taskId, request));
    }

    @PatchMapping("/{planId}/tasks/{taskId}/status")
    public ApiResponse<PlanDetail> updateTaskStatus(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @PathVariable long taskId,
            @Valid @RequestBody TaskStatusRequest request
    ) {
        return ApiResponse.success(service.updateStatus(user.id(), planId, taskId, request));
    }

    @PutMapping("/{planId}/tasks/order")
    public ApiResponse<PlanDetail> reorder(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @Valid @RequestBody ReorderRequest request
    ) {
        return ApiResponse.success(service.reorder(user.id(), planId, request));
    }

    @DeleteMapping("/{planId}/tasks/{taskId}")
    public ApiResponse<PlanDetail> deleteTask(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @PathVariable long taskId,
            @RequestParam @Min(0) int expectedVersion
    ) {
        return ApiResponse.success(service.deleteTask(user.id(), planId, taskId, expectedVersion));
    }

    @PostMapping("/{planId}/tasks/{taskId}/results")
    public ApiResponse<PlanDetail> addResult(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @PathVariable long taskId,
            @Valid @RequestBody TaskResultRequest request
    ) {
        return ApiResponse.success(service.addResult(user.id(), planId, taskId, request));
    }

    @PutMapping("/{planId}/tasks/{taskId}/results/{resultId}")
    public ApiResponse<PlanDetail> updateResult(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @PathVariable long taskId,
            @PathVariable long resultId,
            @Valid @RequestBody TaskResultRequest request
    ) {
        return ApiResponse.success(service.updateResult(user.id(), planId, taskId, resultId, request));
    }

    @DeleteMapping("/{planId}/tasks/{taskId}/results/{resultId}")
    public ApiResponse<PlanDetail> deleteResult(
            @CurrentUser UserInfo user,
            @PathVariable long planId,
            @PathVariable long taskId,
            @PathVariable long resultId
    ) {
        return ApiResponse.success(service.deleteResult(user.id(), planId, taskId, resultId));
    }
}
