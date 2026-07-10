package com.careerdecision.backend.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BackendReadinessPropertiesTest {
    @Test
    void localEnvironmentDoesNotRejectLocalDefaults() {
        BackendReadinessProperties properties = new BackendReadinessProperties("local", "root", "root");

        assertThat(properties.productionProblem(
                new AgentServerProperties(null, "change-me", null),
                new CorsProperties("http://localhost:5173")
        )).isBlank();
    }

    @Test
    void productionRejectsMissingOrUnsafeAgentToken() {
        assertThat(productionProblem(" ", "career_user", "strong-db-password", "https://career.example.test"))
                .isEqualTo("Agent server internal token is required in production.");
        assertThat(productionProblem("change-me", "career_user", "strong-db-password", "https://career.example.test"))
                .isEqualTo("Agent server internal token must not use the local default in production.");
        assertThat(productionProblem("short-token", "career_user", "strong-db-password", "https://career.example.test"))
                .isEqualTo("Agent server internal token is too short for production.");
    }

    @Test
    void productionRejectsDefaultDatabaseCredentials() {
        assertThat(productionProblem(strongToken(), "root", "root", "https://career.example.test"))
                .isEqualTo("Database credentials must not use root/root in production.");
    }

    @Test
    void productionRejectsLocalOnlyCorsOrigins() {
        assertThat(productionProblem(strongToken(), "career_user", "strong-db-password", "http://localhost:5173,http://127.0.0.1:5173"))
                .isEqualTo("CORS allowed origins must include a non-local production origin.");
    }

    @Test
    void productionAcceptsStrongConfiguration() {
        assertThat(productionProblem(strongToken(), "career_user", "strong-db-password", "https://career.example.test"))
                .isBlank();
    }

    private String productionProblem(String agentToken, String databaseUsername, String databasePassword, String corsOrigins) {
        BackendReadinessProperties properties = new BackendReadinessProperties(
                "production",
                databaseUsername,
                databasePassword
        );
        return properties.productionProblem(
                new AgentServerProperties("http://agent.internal.test:8001", agentToken, 30),
                new CorsProperties(corsOrigins)
        );
    }

    private String strongToken() {
        return "backend-production-token-1234567890";
    }
}
