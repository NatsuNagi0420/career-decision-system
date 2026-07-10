package com.careerdecision.backend.controller;

import com.careerdecision.backend.config.AgentServerProperties;
import com.careerdecision.backend.config.BackendReadinessProperties;
import com.careerdecision.backend.config.CorsProperties;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.sql.Connection;
import java.sql.SQLException;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HealthControllerTest {
    @Test
    void readinessReturnsReadyWhenDatabaseResponds() throws Exception {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:backend_readiness_test;MODE=MySQL;DB_CLOSE_DELAY=-1");
        dataSource.setUser("sa");
        dataSource.setPassword("");

        mockMvc(dataSource)
                .perform(get("/api/v1/ready"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.status", is("ready")))
                .andExpect(jsonPath("$.data.database", is("ok")));
    }

    @Test
    void readinessReturnsUnavailableWhenDatabaseCheckFails() throws Exception {
        mockMvc(new FailingDataSource())
                .perform(get("/api/v1/ready"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code", is(50301)))
                .andExpect(jsonPath("$.message", is("Database readiness check failed.")));
    }

    @Test
    void productionReadinessRejectsUnsafeDefaultAgentTokenBeforeDatabaseCheck() throws Exception {
        mockMvc(
                new FailingDataSource(),
                readiness("production", "career_user", "strong-db-password"),
                "change-me",
                "https://career.example.test"
        )
                .perform(get("/api/v1/ready"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code", is(50301)))
                .andExpect(jsonPath(
                        "$.message",
                        is("Agent server internal token must not use the local default in production.")
                ));
    }

    @Test
    void productionReadinessRejectsDefaultDatabaseCredentials() throws Exception {
        mockMvc(
                dataSource(),
                readiness("production", "root", "root"),
                strongToken(),
                "https://career.example.test"
        )
                .perform(get("/api/v1/ready"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code", is(50301)))
                .andExpect(jsonPath("$.message", is("Database credentials must not use root/root in production.")));
    }

    @Test
    void productionReadinessRejectsLocalOnlyCorsOrigins() throws Exception {
        mockMvc(
                dataSource(),
                readiness("production", "career_user", "strong-db-password"),
                strongToken(),
                "http://localhost:5173"
        )
                .perform(get("/api/v1/ready"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code", is(50301)))
                .andExpect(jsonPath("$.message", is("CORS allowed origins must include a non-local production origin.")));
    }

    @Test
    void productionReadinessAcceptsStrongConfigurationAndDatabase() throws Exception {
        mockMvc(
                dataSource(),
                readiness("production", "career_user", "strong-db-password"),
                strongToken(),
                "https://career.example.test"
        )
                .perform(get("/api/v1/ready"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.status", is("ready")))
                .andExpect(jsonPath("$.data.database", is("ok")));
    }

    private MockMvc mockMvc(javax.sql.DataSource dataSource) {
        return mockMvc(dataSource, readiness("local", "root", "root"), "change-me", "http://localhost:5173");
    }

    private MockMvc mockMvc(
            javax.sql.DataSource dataSource,
            BackendReadinessProperties readinessProperties,
            String agentToken,
            String corsOrigins
    ) {
        return MockMvcBuilders.standaloneSetup(new HealthController(
                dataSource,
                readinessProperties,
                new AgentServerProperties("http://127.0.0.1:8001", agentToken, 30),
                new CorsProperties(corsOrigins)
        )).build();
    }

    private JdbcDataSource dataSource() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:backend_readiness_test;MODE=MySQL;DB_CLOSE_DELAY=-1");
        dataSource.setUser("sa");
        dataSource.setPassword("");
        return dataSource;
    }

    private BackendReadinessProperties readiness(
            String appEnv,
            String databaseUsername,
            String databasePassword
    ) {
        return new BackendReadinessProperties(
                appEnv,
                databaseUsername,
                databasePassword
        );
    }

    private String strongToken() {
        return "backend-production-token-1234567890";
    }

    private static final class FailingDataSource extends AbstractDataSource {
        @Override
        public Connection getConnection() throws SQLException {
            throw new SQLException("database down");
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            throw new SQLException("database down");
        }
    }
}
