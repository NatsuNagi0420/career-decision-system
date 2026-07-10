package com.careerdecision.backend.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReportArchiveControllerTest {
    private static final String AUTHORIZATION = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ReportArchiveService reportArchiveService;

    @Test
    void reportsRequireAuthorization() throws Exception {
        mockMvc.perform(get("/api/v1/reports"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void reportListRejectsOversizedPageSize() throws Exception {
        mockMvc.perform(get("/api/v1/reports")
                        .header("Authorization", AUTHORIZATION)
                        .param("size", "51"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(40032)))
                .andExpect(jsonPath("$.message", is("size must be between 1 and 50.")));
    }

    @Test
    void reportArchiveUsesTokenUserInsteadOfClientUserId() throws Exception {
        ReportSnapshot otherUserReport = reportArchiveService.archive(2L, request("career_report", "Bob Report"));

        mockMvc.perform(post("/api/v1/reports/archive")
                        .header("Authorization", AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "userId", "2",
                                "type", "career_report",
                                "title", "Alice Report",
                                "summary", "summary",
                                "content", "content"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId", is("1")))
                .andExpect(jsonPath("$.data.title", is("Alice Report")));

        mockMvc.perform(get("/api/v1/reports")
                        .header("Authorization", AUTHORIZATION)
                        .param("userId", "2")
                        .param("type", "career_report"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total", is(1)))
                .andExpect(jsonPath("$.data.items[0].userId", is("1")));

        mockMvc.perform(get("/api/v1/reports/{id}", otherUserReport.id())
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40401)));
    }

    private ReportArchiveRequest request(String type, String title) {
        return new ReportArchiveRequest(type, title, "summary", "content", null);
    }
}
