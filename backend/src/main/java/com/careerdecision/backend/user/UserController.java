package com.careerdecision.backend.user;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.exception.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class UserController {
    private final UserService userService;
    private final LoginRateLimiter loginRateLimiter;

    public UserController(UserService userService, LoginRateLimiter loginRateLimiter) {
        this.userService = userService;
        this.loginRateLimiter = loginRateLimiter;
    }

    @PostMapping("/auth/register")
    public ApiResponse<UserInfo> register(@Valid @RequestBody UserRegisterRequest request) {
        return ApiResponse.success(userService.register(request));
    }

    @PostMapping("/auth/login")
    public ApiResponse<LoginResponse> login(
            @Valid @RequestBody UserLoginRequest request,
            HttpServletRequest httpRequest
    ) {
        loginRateLimiter.assertAllowed(request.username(), httpRequest);
        try {
            LoginResponse response = userService.login(request);
            loginRateLimiter.recordSuccess(request.username(), httpRequest);
            return ApiResponse.success(response);
        } catch (BusinessException ex) {
            if (ex.code() == 401) {
                loginRateLimiter.recordFailure(request.username(), httpRequest);
            }
            throw ex;
        }
    }

    @PostMapping("/auth/logout")
    public ApiResponse<Void> logout(
            @CurrentUser UserInfo user,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization
    ) {
        userService.logout(user.id(), authorization);
        return ApiResponse.success(null);
    }

    @PostMapping("/auth/refresh")
    public ApiResponse<LoginResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ApiResponse.success(userService.refresh(request));
    }

    @GetMapping("/users/me")
    public ApiResponse<UserInfo> me(@CurrentUser UserInfo user) {
        return ApiResponse.success(user);
    }
}
