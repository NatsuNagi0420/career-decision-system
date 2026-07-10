package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.config.AgentServerProperties;
import com.careerdecision.backend.config.BackendReadinessProperties;
import com.careerdecision.backend.config.CorsProperties;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class HealthController {
    private final DataSource dataSource;
    private final BackendReadinessProperties readinessProperties;
    private final AgentServerProperties agentServerProperties;
    private final CorsProperties corsProperties;

    public HealthController(
            DataSource dataSource,
            BackendReadinessProperties readinessProperties,
            AgentServerProperties agentServerProperties,
            CorsProperties corsProperties
    ) {
        this.dataSource = dataSource;
        this.readinessProperties = readinessProperties;
        this.agentServerProperties = agentServerProperties;
        this.corsProperties = corsProperties;
    }

    @GetMapping("/health")
    public ApiResponse<Map<String, String>> health() {
        return ApiResponse.success(Map.of("status", "ok", "service", "backend"));
    }

    @GetMapping("/ready")
    public ResponseEntity<ApiResponse<Map<String, String>>> ready() {
        String productionProblem = readinessProperties.productionProblem(agentServerProperties, corsProperties);
        if (!productionProblem.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.error(50301, productionProblem));
        }

        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement()) {
            statement.execute("SELECT 1");
            return ResponseEntity.ok(ApiResponse.success(Map.of(
                    "status", "ready",
                    "service", "backend",
                    "database", "ok"
            )));
        } catch (SQLException ex) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.error(50301, "Database readiness check failed."));
        }
    }
}
