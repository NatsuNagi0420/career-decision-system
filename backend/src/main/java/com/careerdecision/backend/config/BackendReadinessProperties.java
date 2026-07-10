package com.careerdecision.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "career.readiness")
public record BackendReadinessProperties(
        String appEnv,
        String databaseUsername,
        String databasePassword
) {
    private static final String DEFAULT_AGENT_INTERNAL_TOKEN = "change-me";
    private static final int MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH = 24;

    public String productionProblem(AgentServerProperties agentServer, CorsProperties cors) {
        if (!isProduction()) {
            return "";
        }

        String token = agentServer == null ? "" : safeTrim(agentServer.internalToken());
        if (token.isBlank()) {
            return "Agent server internal token is required in production.";
        }
        if (DEFAULT_AGENT_INTERNAL_TOKEN.equals(token)) {
            return "Agent server internal token must not use the local default in production.";
        }
        if (token.length() < MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH) {
            return "Agent server internal token is too short for production.";
        }

        if ("root".equalsIgnoreCase(safeTrim(databaseUsername))
                && "root".equals(safeTrim(databasePassword))) {
            return "Database credentials must not use root/root in production.";
        }

        if (cors == null || hasOnlyLocalCorsOrigins(cors.normalizedAllowedOrigins())) {
            return "CORS allowed origins must include a non-local production origin.";
        }

        return "";
    }

    public boolean productionReady(AgentServerProperties agentServer, CorsProperties cors) {
        return productionProblem(agentServer, cors).isBlank();
    }

    private boolean isProduction() {
        String normalized = safeTrim(appEnv).toLowerCase();
        return "prod".equals(normalized) || "production".equals(normalized);
    }

    private boolean hasOnlyLocalCorsOrigins(List<String> origins) {
        return origins.stream().allMatch(this::isLocalOrigin);
    }

    private boolean isLocalOrigin(String origin) {
        String value = safeTrim(origin).toLowerCase();
        return value.contains("localhost")
                || value.contains("127.0.0.1")
                || value.contains("0.0.0.0")
                || value.contains("[::1]")
                || value.contains("10.0.2.2");
    }

    private String safeTrim(String value) {
        return value == null ? "" : value.trim();
    }
}
