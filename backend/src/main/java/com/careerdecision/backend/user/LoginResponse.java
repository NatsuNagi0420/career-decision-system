package com.careerdecision.backend.user;

public record LoginResponse(
        String token,
        String refreshToken,
        UserInfo user
) {
}
