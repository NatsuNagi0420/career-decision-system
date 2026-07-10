package com.careerdecision.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "CORS_ALLOWED_ORIGINS=http://web.example.test, https://career.example.test, http://web.example.test"
})
@AutoConfigureMockMvc
class CorsPropertiesTest {
    @Autowired
    private CorsProperties properties;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void corsAllowedOriginsCanBeOverriddenFromEnvironment() {
        assertThat(properties.normalizedAllowedOrigins())
                .containsExactly("http://web.example.test", "https://career.example.test");
    }

    @Test
    void corsPreflightUsesConfiguredOrigins() throws Exception {
        mockMvc.perform(options("/api/v1/health")
                        .header("Origin", "http://web.example.test")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://web.example.test"));
    }

    @Test
    void wildcardCorsOriginIsRejectedBecauseCredentialsAreEnabled() {
        assertThatThrownBy(() -> new CorsProperties("*").allowedOriginsArray())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("CORS wildcard origins are not allowed when credentials are enabled.");
    }
}
