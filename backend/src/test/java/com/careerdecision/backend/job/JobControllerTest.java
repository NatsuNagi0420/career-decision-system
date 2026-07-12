package com.careerdecision.backend.job;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class JobControllerTest {
    private static final String AUTHORIZATION = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobFavoriteMapper favoriteMapper;

    @Autowired
    private JobTargetMapper targetMapper;

    @Test
    void searchReturnsPagedJobs() throws Exception {
        mockMvc.perform(get("/api/v1/jobs")
                        .param("page", "0")
                        .param("size", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.items", hasSize(3)))
                .andExpect(jsonPath("$.data.page", is(0)))
                .andExpect(jsonPath("$.data.size", is(3)))
                .andExpect(jsonPath("$.data.totalElements", greaterThanOrEqualTo(8)))
                .andExpect(jsonPath("$.data.hasNext", is(true)))
                .andExpect(jsonPath("$.data.hasPrevious", is(false)));
    }

    @Test
    void searchFiltersByKeywordLocationAndTag() throws Exception {
        mockMvc.perform(get("/api/v1/jobs")
                        .param("keyword", "AI")
                        .param("location", "深圳")
                        .param("tag", "RAG")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements", is(1)))
                .andExpect(jsonPath("$.data.items[0].id", is(1003)))
                .andExpect(jsonPath("$.data.items[0].title", is("AI 应用工程师")))
                .andExpect(jsonPath("$.data.items[0].tags", hasItem("RAG")));
    }

    @Test
    void searchFiltersByDirectionAndSalary() throws Exception {
        mockMvc.perform(get("/api/v1/jobs")
                        .param("keyword", "AI")
                        .param("salaryMin", "21000")
                        .param("salaryMax", "38000")
                        .param("page", "0")
                        .param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.totalElements", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.items[0].id", is(1003)))
                .andExpect(jsonPath("$.data.items[0].salaryMin", is(22000)))
                .andExpect(jsonPath("$.data.items[0].salaryMax", is(36000)))
                .andExpect(jsonPath("$.data.items[0].qualityScore", is(94.0)));
    }

    @Test
    void searchFiltersByExperienceLevel() throws Exception {
        mockMvc.perform(get("/api/v1/jobs")
                        .param("experienceLevel", "不限")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.totalElements", is(1)))
                .andExpect(jsonPath("$.data.items[0].id", is(1006)))
                .andExpect(jsonPath("$.data.items[0].experienceLevel", is("不限")));
    }

    @Test
    void detailReturnsJobDetail() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/{id}", 1002L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.title", is("后端工程师")))
                .andExpect(jsonPath("$.data.summary", is("建设职业决策系统业务后端。")))
                .andExpect(jsonPath("$.data.education", is("本科及以上")))
                .andExpect(jsonPath("$.data.experienceLevel", is("3-5年")))
                .andExpect(jsonPath("$.data.sourcePlatform", is("seed")))
                .andExpect(jsonPath("$.data.responsibilities", hasSize(0)))
                .andExpect(jsonPath("$.data.requirements", hasSize(0)))
                .andExpect(jsonPath("$.data.growthPath", hasSize(0)))
                .andExpect(jsonPath("$.data.interviewFocus", hasSize(0)));
    }

    @Test
    void facetsReturnsCitiesDirectionsAndTags() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/facets"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.cities[*].name", hasItem("上海")))
                .andExpect(jsonPath("$.data.directions[*].name", hasItem("技术研发")))
                .andExpect(jsonPath("$.data.tags[*].name", hasItem("AI产品")));
    }

    @Test
    void recommendationsUseRealJobs() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/recommendations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "profile": {
                                    "target_role": "AI",
                                    "skills": ["Python", "RAG"]
                                  },
                                  "limit": 3
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data", hasSize(3)))
                .andExpect(jsonPath("$.data[0].job.id", is(1003)))
                .andExpect(jsonPath("$.data[0].matchScore", greaterThanOrEqualTo(80)))
                .andExpect(jsonPath("$.data[0].reasons", hasSize(greaterThanOrEqualTo(1))));
    }

    @Test
    void unknownJobReturnsBusinessError() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/{id}", 9999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40401)))
                .andExpect(jsonPath("$.message", is("Job not found: 9999")));
    }

    @Test
    void favoritesRequireAuthorization() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/favorites"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void favoritesCanBeAddedListedAndRemoved() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/favorites/{jobId}", 1003L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id", is(1003)))
                .andExpect(jsonPath("$.data[0].title", is("AI 应用工程师")));

        mockMvc.perform(post("/api/v1/jobs/favorites/{jobId}", 1003L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)));

        mockMvc.perform(get("/api/v1/jobs/favorites")
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id", is(1003)));

        mockMvc.perform(delete("/api/v1/jobs/favorites/{jobId}", 1003L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    @Sql(statements = {
            "DELETE FROM job_favorites",
            "INSERT INTO job_favorites (user_id, job_id) VALUES (2, 1003)"
    })
    void favoritesAreScopedToAuthenticatedUser() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/favorites")
                        .header("Authorization", AUTHORIZATION)
                        .param("userId", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));

        mockMvc.perform(delete("/api/v1/jobs/favorites/{jobId}", 1003L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));

        assertThat(favoriteMapper.countFavorite(2L, 1003L)).isEqualTo(1);
    }

    @Test
    void favoriteUnknownJobReturnsBusinessError() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/favorites/{jobId}", 9999L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40401)))
                .andExpect(jsonPath("$.message", is("Job not found: 9999")));
    }

    @Test
    void targetJobsRequireAuthorization() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/targets"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void targetJobsCanBeAddedListedAndRemoved() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/targets/{jobId}", 1004L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id", is(1004)))
                .andExpect(jsonPath("$.data[0].title", is("产品经理")));

        mockMvc.perform(post("/api/v1/jobs/targets/{jobId}", 1004L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)));

        mockMvc.perform(get("/api/v1/jobs/targets")
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id", is(1004)));

        mockMvc.perform(delete("/api/v1/jobs/targets/{jobId}", 1004L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    @Sql(statements = {
            "DELETE FROM job_targets",
            "INSERT INTO job_targets (user_id, job_id) VALUES (2, 1004)"
    })
    void targetJobsAreScopedToAuthenticatedUser() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/targets")
                        .header("Authorization", AUTHORIZATION)
                        .param("userId", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));

        mockMvc.perform(delete("/api/v1/jobs/targets/{jobId}", 1004L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));

        assertThat(targetMapper.countTarget(2L, 1004L)).isEqualTo(1);
    }

    @Test
    void targetUnknownJobReturnsBusinessError() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/targets/{jobId}", 9999L)
                        .header("Authorization", AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40401)))
                .andExpect(jsonPath("$.message", is("Job not found: 9999")));
    }
}
