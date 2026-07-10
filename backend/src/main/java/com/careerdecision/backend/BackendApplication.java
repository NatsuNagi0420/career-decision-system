package com.careerdecision.backend;

import com.careerdecision.backend.config.AgentServerProperties;
import com.careerdecision.backend.config.AuthProperties;
import com.careerdecision.backend.config.BackendReadinessProperties;
import com.careerdecision.backend.config.CorsProperties;
import com.careerdecision.backend.config.DataServerProperties;
import com.careerdecision.backend.config.LoginRateLimitProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({
        AgentServerProperties.class,
        AuthProperties.class,
        BackendReadinessProperties.class,
        CorsProperties.class,
        DataServerProperties.class,
        LoginRateLimitProperties.class
})
public class BackendApplication {
    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }
}
