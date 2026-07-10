package com.careerdecision.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "career.auth.token-expire-days=14",
        "career.auth.refresh-token-expire-days=45"
})
class AuthPropertiesTest {
    @Autowired
    private AuthProperties properties;

    @Test
    void authTokenExpirationCanBeOverriddenFromEnvironment() {
        assertThat(properties.normalizedTokenExpireDays()).isEqualTo(14);
        assertThat(properties.normalizedRefreshTokenExpireDays()).isEqualTo(45);
    }

    @Test
    void defaultTokenExpirationsAreSafe() {
        AuthProperties defaults = new AuthProperties(null, null);

        assertThat(defaults.normalizedTokenExpireDays()).isEqualTo(7);
        assertThat(defaults.normalizedRefreshTokenExpireDays()).isEqualTo(30);
    }

    @Test
    void tokenExpirationRejectsUnsafeRanges() {
        assertThatThrownBy(() -> new AuthProperties(0, null).normalizedTokenExpireDays())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Auth token expiration days must be between 1 and 90.");
        assertThatThrownBy(() -> new AuthProperties(91, null).normalizedTokenExpireDays())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Auth token expiration days must be between 1 and 90.");
        assertThatThrownBy(() -> new AuthProperties(null, 0).normalizedRefreshTokenExpireDays())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Auth refresh token expiration days must be between 1 and 180.");
        assertThatThrownBy(() -> new AuthProperties(null, 181).normalizedRefreshTokenExpireDays())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Auth refresh token expiration days must be between 1 and 180.");
    }
}
