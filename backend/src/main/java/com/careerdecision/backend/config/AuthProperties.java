package com.careerdecision.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "career.auth")
public record AuthProperties(
        Integer tokenExpireDays,
        Integer refreshTokenExpireDays
) {
    private static final int DEFAULT_TOKEN_EXPIRE_DAYS = 7;
    private static final int DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS = 30;
    private static final int MAX_TOKEN_EXPIRE_DAYS = 90;
    private static final int MAX_REFRESH_TOKEN_EXPIRE_DAYS = 180;

    public int normalizedTokenExpireDays() {
        int days = tokenExpireDays == null ? DEFAULT_TOKEN_EXPIRE_DAYS : tokenExpireDays;
        if (days < 1 || days > MAX_TOKEN_EXPIRE_DAYS) {
            throw new IllegalArgumentException("Auth token expiration days must be between 1 and 90.");
        }
        return days;
    }

    public int normalizedRefreshTokenExpireDays() {
        int days = refreshTokenExpireDays == null ? DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS : refreshTokenExpireDays;
        if (days < 1 || days > MAX_REFRESH_TOKEN_EXPIRE_DAYS) {
            throw new IllegalArgumentException("Auth refresh token expiration days must be between 1 and 180.");
        }
        return days;
    }
}
