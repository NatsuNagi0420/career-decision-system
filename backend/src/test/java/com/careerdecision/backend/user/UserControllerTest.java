package com.careerdecision.backend.user;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class UserControllerTest {
    private static final String AUTHORIZATION = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void logoutRevokesCurrentToken() throws Exception {
        mockMvc.perform(get("/api/v1/users/me")
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username", is("alice")));

        mockMvc.perform(post("/api/v1/auth/logout")
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)));

        mockMvc.perform(get("/api/v1/users/me")
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void loginReturnsTooManyRequestsAfterRepeatedFailures() throws Exception {
        String payload = """
                {
                  "username": "rate-limit-user",
                  "password": "wrong-password"
                }
                """;

        for (int i = 0; i < 5; i += 1) {
            mockMvc.perform(post("/api/v1/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(payload)
                            .with(request -> {
                                request.setRemoteAddr("203.0.113.20");
                                return request;
                            }))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code", is(401)));
        }

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload)
                        .with(request -> {
                            request.setRemoteAddr("203.0.113.20");
                            return request;
                        }))
                .andExpect(status().is(429))
                .andExpect(jsonPath("$.code", is(42901)))
                .andExpect(jsonPath("$.message", is("Too many login attempts. Please try again later.")));
    }

    @Test
    void refreshRotatesRefreshTokenAndLogoutRevokesRefreshTokens() throws Exception {
        String username = "refresh_user";
        String password = "secret123";
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "%s",
                                  "email": "%s@example.test",
                                  "password": "%s",
                                  "confirmPassword": "%s"
                                }
                                """.formatted(username, username, password, password)))
                .andExpect(status().isOk());

        String loginPayload = """
                {
                  "username": "%s",
                  "password": "%s"
                }
                """.formatted(username, password);

        String loginResponse = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token", notNullValue()))
                .andExpect(jsonPath("$.data.refreshToken", notNullValue()))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String accessToken = JsonTestSupport.stringAt(loginResponse, "data.token");
        String refreshToken = JsonTestSupport.stringAt(loginResponse, "data.refreshToken");

        String refreshPayload = """
                {
                  "refreshToken": "%s"
                }
                """.formatted(refreshToken);
        String refreshResponse = mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token", not(accessToken)))
                .andExpect(jsonPath("$.data.refreshToken", not(refreshToken)))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String rotatedAccessToken = JsonTestSupport.stringAt(refreshResponse, "data.token");
        String rotatedRefreshToken = JsonTestSupport.stringAt(refreshResponse, "data.refreshToken");

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshPayload))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));

        mockMvc.perform(get("/api/v1/users/me")
                        .header("Authorization", "Bearer " + rotatedAccessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username", is(username)));

        mockMvc.perform(post("/api/v1/auth/logout")
                        .header("Authorization", "Bearer " + rotatedAccessToken))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "refreshToken": "%s"
                                }
                                """.formatted(rotatedRefreshToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }
}
