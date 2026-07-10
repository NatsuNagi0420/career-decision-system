package com.careerdecision.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "career.agent-server")
public record AgentServerProperties(
        String baseUrl,
        String internalToken,
        Integer timeoutSeconds
) {
    private static final int DEFAULT_TIMEOUT_SECONDS = 30;
    private static final int MAX_TIMEOUT_SECONDS = 300;

    public int normalizedTimeoutSeconds() {
        int seconds = timeoutSeconds == null ? DEFAULT_TIMEOUT_SECONDS : timeoutSeconds;
        if (seconds < 1 || seconds > MAX_TIMEOUT_SECONDS) {
            throw new IllegalArgumentException("Agent server timeout seconds must be between 1 and 300.");
        }
        return seconds;
    }

    public String normalizedInternalToken() {
        if (internalToken == null || internalToken.isBlank()) {
            throw new IllegalArgumentException("Agent server internal token is required.");
        }
        return internalToken.trim();
    }
}
