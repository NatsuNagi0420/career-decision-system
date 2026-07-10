package com.careerdecision.backend.resume;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Sql(statements = {
        "DELETE FROM resume_analyses",
        "DELETE FROM resumes",
        "DELETE FROM agent_runs",
        "INSERT INTO agent_runs (id, request_id, user_id, agent_type, status) VALUES (9101, 'resume-archive-run', 1, 'resume', 'success')"
})
class ResumeAnalysisArchiveControllerTest {
    private static final String AUTHORIZATION = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ResumeAnalysisArchiveService archiveService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void resumeAnalysesRequireAuthorization() throws Exception {
        mockMvc.perform(get("/api/v1/resumes/analyses"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void resumeAnalysisCanBeArchivedListedReadAndDeleted() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/resumes/analyses/archive")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "targetRole": "AI 应用工程师",
                                  "resumeText": "AI 职业规划系统项目，使用 Vue 和 Spring Boot，提升报告生成效率 30%。",
                                  "agentRunId": 9101,
                                  "analysis": {
                                    "score": 86,
                                    "atsScore": 82,
                                    "keywordMatch": 78,
                                    "issues": ["量化结果还可以更具体"],
                                    "suggestions": ["用 STAR 结构重写项目"],
                                    "improvedFragments": ["负责 AI 报告模块，提升生成效率 30%。"]
                                  }
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.id", notNullValue()))
                .andExpect(jsonPath("$.data.agentRunId", is(9101)))
                .andExpect(jsonPath("$.data.score", is(86)))
                .andExpect(jsonPath("$.data.atsScore", is(82)))
                .andExpect(jsonPath("$.data.keywordMatch", is(78)))
                .andExpect(jsonPath("$.data.issues", hasItem("量化结果还可以更具体")))
                .andExpect(jsonPath("$.data.improvedFragments", hasSize(1)))
                .andReturn();

        long analysisId = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data")
                .path("id")
                .asLong();

        String storedResumeText = jdbcTemplate.queryForObject("""
                SELECT r.resume_text
                FROM resumes r
                JOIN resume_analyses a ON a.resume_id = r.id
                WHERE a.id = ?
                """, String.class, analysisId);
        String contentHash = jdbcTemplate.queryForObject("""
                SELECT r.content_hash
                FROM resumes r
                JOIN resume_analyses a ON a.resume_id = r.id
                WHERE a.id = ?
                """, String.class, analysisId);
        String parsedJson = jdbcTemplate.queryForObject("""
                SELECT r.parsed_json
                FROM resumes r
                JOIN resume_analyses a ON a.resume_id = r.id
                WHERE a.id = ?
                """, String.class, analysisId);

        assertThat(storedResumeText).isNull();
        assertThat(contentHash).hasSize(64).matches("[0-9a-f]{64}");
        assertThat(parsedJson)
                .contains("负责 AI 报告模块")
                .doesNotContain("AI 职业规划系统项目");

        mockMvc.perform(get("/api/v1/resumes/analyses")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id", is((int) analysisId)))
                .andExpect(jsonPath("$.data[0].agentRunId", is(9101)))
                .andExpect(jsonPath("$.data[0].issueCount", is(1)))
                .andExpect(jsonPath("$.data[0].suggestionCount", is(1)));

        mockMvc.perform(get("/api/v1/resumes/analyses/{analysisId}", analysisId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.agentRunId", is(9101)))
                .andExpect(jsonPath("$.data.targetRole", is("AI 应用工程师")))
                .andExpect(jsonPath("$.data.suggestions[0]", is("用 STAR 结构重写项目")));

        mockMvc.perform(delete("/api/v1/resumes/analyses/{analysisId}", analysisId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)));

        mockMvc.perform(get("/api/v1/resumes/analyses/{analysisId}", analysisId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40430)));
    }

    @Test
    void resumeAnalysisEndpointsDoNotExposeOtherUsersData() throws Exception {
        ResumeAnalysisDetailResponse bobAnalysis = archiveService.archive(2L, new ResumeAnalysisArchiveRequest(
                "Backend Engineer",
                "Bob private resume text",
                null,
                new ResumeAnalysisPayload(
                        77,
                        70,
                        68,
                        List.of("Needs clearer metrics"),
                        List.of("Add project outcomes"),
                        List.of("Improved private fragment")
                )
        ));

        mockMvc.perform(get("/api/v1/resumes/analyses")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));

        mockMvc.perform(get("/api/v1/resumes/analyses/{analysisId}", bobAnalysis.id())
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40430)));

        mockMvc.perform(delete("/api/v1/resumes/analyses/{analysisId}", bobAnalysis.id())
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40430)));

        ResumeAnalysisDetailResponse stillOwnedByBob = archiveService.detail(2L, bobAnalysis.id());
        assertThat(stillOwnedByBob.id()).isEqualTo(bobAnalysis.id());
    }
}
