package com.careerdecision.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "career.auth.login-rate-limit")
public record LoginRateLimitProperties(
        Boolean enabled,
        Integer maxAttempts,
        Integer windowSeconds
) {
    private static final int DEFAULT_MAX_ATTEMPTS = 5;
    private static final int DEFAULT_WINDOW_SECONDS = 300;

    public boolean normalizedEnabled() {
        return enabled == null || enabled;
    }

    public int normalizedMaxAttempts() {
        int attempts = maxAttempts == null ? DEFAULT_MAX_ATTEMPTS : maxAttempts;
        if (attempts < 1 || attempts > 100) {
            throw new IllegalArgumentException("Login rate limit max attempts must be between 1 and 100.");
        }
        return attempts;
    }

    public int normalizedWindowSeconds() {
        int seconds = windowSeconds == null ? DEFAULT_WINDOW_SECONDS : windowSeconds;
        if (seconds < 1 || seconds > 86400) {
            throw new IllegalArgumentException("Login rate limit window seconds must be between 1 and 86400.");
        }
        return seconds;
    }
}
