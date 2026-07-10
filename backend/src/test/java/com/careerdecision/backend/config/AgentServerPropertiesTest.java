package com.careerdecision.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "AGENT_SERVER_BASE_URL=http://agent.internal.test:9001",
        "INTERNAL_API_TOKEN=shared-agent-token",
        "AGENT_SERVER_TIMEOUT_SECONDS=12"
})
class AgentServerPropertiesTest {
    @Autowired
    private AgentServerProperties properties;

    @Test
    void agentServerConnectionSettingsCanBeOverriddenFromEnvironment() {
        assertThat(properties.baseUrl()).isEqualTo("http://agent.internal.test:9001");
        assertThat(properties.internalToken()).isEqualTo("shared-agent-token");
        assertThat(properties.normalizedInternalToken()).isEqualTo("shared-agent-token");
        assertThat(properties.normalizedTimeoutSeconds()).isEqualTo(12);
    }

    @Test
    void agentServerTimeoutMustStayInSupportedRange() {
        assertThatThrownBy(() -> new AgentServerProperties(null, null, 0).normalizedTimeoutSeconds())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Agent server timeout seconds must be between 1 and 300.");

        assertThatThrownBy(() -> new AgentServerProperties(null, null, 301).normalizedTimeoutSeconds())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Agent server timeout seconds must be between 1 and 300.");
    }

    @Test
    void agentServerInternalTokenMustBePresent() {
        assertThat(new AgentServerProperties(null, "  shared-token  ", null).normalizedInternalToken())
                .isEqualTo("shared-token");

        assertThatThrownBy(() -> new AgentServerProperties(null, "  ", null).normalizedInternalToken())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Agent server internal token is required.");

        assertThatThrownBy(() -> new AgentServerProperties(null, null, null).normalizedInternalToken())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Agent server internal token is required.");
    }
}
