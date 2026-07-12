package com.careerdecision.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class BackendRequestValidationTest {
    private static final String AUTHORIZATION = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void loginRejectsOversizedCredentialsBeforeAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "username", "a".repeat(33),
                                "password", "b".repeat(65)
                        ))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.message", containsString("size must be between")));
    }

    @Test
    void malformedJsonReturnsEnvelope() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{broken-json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.message", is("Malformed JSON request.")));
    }

    @Test
    void jobSearchRejectsOversizedQueryParameter() throws Exception {
        mockMvc.perform(get("/api/v1/jobs")
                        .param("keyword", "a".repeat(81)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.message", containsString("keyword")))
                .andExpect(jsonPath("$.message", containsString("size must be between")));
    }

    @Test
    void jobSearchRejectsInvalidNumericQueryParameter() throws Exception {
        mockMvc.perform(get("/api/v1/jobs")
                        .param("salaryMin", "not-a-number"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.message", is("salaryMin has an invalid value.")));
    }

    @Test
    void chatRejectsOversizedMessageBeforeAgentCall() throws Exception {
        mockMvc.perform(post("/api/v1/chat/messages")
                        .header("Authorization", AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "requestId", "chat-validation-001",
                                "message", "a".repeat(4001)
                        ))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.message", containsString("message size must be between")));
    }

    @Test
    void resumeAnalyzeRejectsOversizedResumeBeforeAgentCall() throws Exception {
        mockMvc.perform(post("/api/v1/resumes/analyze")
                        .header("Authorization", AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "requestId", "resume-validation-001",
                                "resumeText", "a".repeat(20001)
                        ))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.message", containsString("resumeText size must be between")));
    }

    @Test
    void careerReportRejectsOversizedProfileBeforeAgentCall() throws Exception {
        Map<String, Object> profile = new LinkedHashMap<>();
        for (int i = 0; i < 41; i += 1) {
            profile.put("field" + i, "value" + i);
        }

        mockMvc.perform(post("/api/v1/career-reports/generate")
                        .header("Authorization", AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "requestId", "report-validation-001",
                                "profile", profile
                        ))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.message", containsString("profile size must be between")));
    }

    @Test
    void jobRecommendationsRejectOutOfRangeLimit() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/recommendations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "profile", Map.of("target_role", "AI"),
                                "limit", 21
                        ))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.message", containsString("limit must be less than or equal to 20")));
    }

    @Test
    void pathTaskStatusRejectsUnknownStatus() throws Exception {
        mockMvc.perform(patch("/api/v1/path-plans/{planId}/tasks/{taskId}", 1L, 1L)
                        .header("Authorization", AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "blocked"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(40043)))
                .andExpect(jsonPath("$.message", is("Task status must be todo or done.")));
    }

    private String json(Object payload) throws Exception {
        return objectMapper.writeValueAsString(payload);
    }
}
