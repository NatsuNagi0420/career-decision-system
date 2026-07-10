package com.careerdecision.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Arrays;
import java.util.List;

@ConfigurationProperties(prefix = "career.cors")
public record CorsProperties(
        String allowedOrigins
) {
    private static final String DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173";

    public List<String> normalizedAllowedOrigins() {
        String value = allowedOrigins == null || allowedOrigins.isBlank() ? DEFAULT_ALLOWED_ORIGINS : allowedOrigins;
        List<String> origins = Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .distinct()
                .toList();
        if (origins.isEmpty()) {
            return Arrays.stream(DEFAULT_ALLOWED_ORIGINS.split(",")).toList();
        }
        if (origins.contains("*")) {
            throw new IllegalArgumentException("CORS wildcard origins are not allowed when credentials are enabled.");
        }
        return origins;
    }

    public String[] allowedOriginsArray() {
        return normalizedAllowedOrigins().toArray(String[]::new);
    }
}
