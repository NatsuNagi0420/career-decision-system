package com.careerdecision.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "career.data-server")
public record DataServerProperties(
        String rootLocation,
        String publicPath
) {
    public String normalizedPublicPath() {
        if (publicPath == null || publicPath.isBlank()) {
            return "/data-server";
        }
        String value = publicPath.trim();
        if (!value.startsWith("/")) {
            value = "/" + value;
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    public String normalizedRootLocation() {
        if (rootLocation == null || rootLocation.isBlank()) {
            return "./data_server";
        }
        return rootLocation.trim();
    }
}
