package com.careerdecision.backend.career;

import com.careerdecision.backend.career.CareerDirectionModels.DirectionRequest;
import com.careerdecision.backend.career.CareerDirectionModels.DirectionResponse;
import com.careerdecision.backend.career.CareerDirectionJobModels.DirectionInsights;
import com.careerdecision.backend.career.CareerDirectionJobModels.DirectionJobPage;
import com.careerdecision.backend.common.ApiResponse;
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
@RequestMapping("/api/v1/career-directions")
public class CareerDirectionController {
    private final CareerDirectionService service;
    private final CareerDirectionJobService directionJobService;

    public CareerDirectionController(CareerDirectionService service, CareerDirectionJobService directionJobService) {
        this.service = service;
        this.directionJobService = directionJobService;
    }

    @GetMapping
    public ApiResponse<List<DirectionResponse>> list(
            @CurrentUser UserInfo user,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category
    ) {
        return ApiResponse.success(service.list(user.id(), keyword, category));
    }

    @GetMapping("/{id}")
    public ApiResponse<DirectionResponse> detail(@CurrentUser UserInfo user, @PathVariable long id) {
        return ApiResponse.success(service.detail(user.id(), id));
    }

    @GetMapping("/{id}/jobs")
    public ApiResponse<DirectionJobPage> jobs(
            @CurrentUser UserInfo user,
            @PathVariable long id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.success(directionJobService.jobs(user.id(), id, page, size));
    }

    @GetMapping("/{id}/insights")
    public ApiResponse<DirectionInsights> insights(@CurrentUser UserInfo user, @PathVariable long id) {
        return ApiResponse.success(directionJobService.insights(user.id(), id));
    }

    @PostMapping
    public ApiResponse<DirectionResponse> create(
            @CurrentUser UserInfo user,
            @Valid @RequestBody DirectionRequest request
    ) {
        return ApiResponse.success(service.create(user.id(), request));
    }

    @PutMapping("/{id}")
    public ApiResponse<DirectionResponse> update(
            @CurrentUser UserInfo user,
            @PathVariable long id,
            @Valid @RequestBody DirectionRequest request
    ) {
        return ApiResponse.success(service.update(user.id(), id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@CurrentUser UserInfo user, @PathVariable long id) {
        service.delete(user.id(), id);
        return ApiResponse.success(null);
    }

    @PostMapping("/{id}/favorite")
    public ApiResponse<DirectionResponse> favorite(@CurrentUser UserInfo user, @PathVariable long id) {
        return ApiResponse.success(service.favorite(user.id(), id, true));
    }

    @DeleteMapping("/{id}/favorite")
    public ApiResponse<DirectionResponse> unfavorite(@CurrentUser UserInfo user, @PathVariable long id) {
        return ApiResponse.success(service.favorite(user.id(), id, false));
    }
}
