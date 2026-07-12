package com.careerdecision.backend.dashboard;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.dashboard.DashboardModels.DashboardResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {
    private final DashboardService service;

    public DashboardController(DashboardService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<DashboardResponse> get(@CurrentUser UserInfo user) {
        return ApiResponse.success(service.get(user.id()));
    }
}
