package com.careerdecision.backend.profile;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me/profile")
public class UserProfileController {
    private final UserProfileService profileService;

    public UserProfileController(UserProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public ApiResponse<UserProfileResponse> get(@CurrentUser UserInfo user) {
        return ApiResponse.success(profileService.get(user));
    }

    @PutMapping
    public ApiResponse<UserProfileResponse> save(
            @CurrentUser UserInfo user,
            @Valid @RequestBody UserProfileRequest request
    ) {
        return ApiResponse.success(profileService.save(user, request));
    }
}
