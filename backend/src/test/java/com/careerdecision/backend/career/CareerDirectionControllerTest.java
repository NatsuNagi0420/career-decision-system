package com.careerdecision.backend.career;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Sql(statements = {
        "DELETE FROM career_direction_job_rel",
        "DELETE FROM career_direction_mapping_runs",
        "DELETE FROM career_direction_favorites",
        "DELETE FROM career_directions WHERE owner_user_id IS NOT NULL"
})
class CareerDirectionControllerTest {
    private static final String AUTH = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void catalogSupportsSearchFavoriteAndCustomDirections() throws Exception {
        mockMvc.perform(get("/api/v1/career-directions").header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", greaterThanOrEqualTo(2)))
                .andExpect(jsonPath("$.data[0].custom", is(false)));

        mockMvc.perform(get("/api/v1/career-directions")
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .queryParam("keyword", "数据分析"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].name", is("数据分析")));

        mockMvc.perform(post("/api/v1/career-directions/1/favorite")
                        .header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.favorite", is(true)));

        mockMvc.perform(post("/api/v1/career-directions")
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "计算社会科学",
                                  "category": "跨学科",
                                  "summary": "使用计算方法研究社会问题。",
                                  "typicalWork": ["分析社会数据"],
                                  "commonSkills": ["统计", "编程"]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id", notNullValue()))
                .andExpect(jsonPath("$.data.custom", is(true)))
                .andExpect(jsonPath("$.data.commonSkills", hasSize(2)));

        mockMvc.perform(put("/api/v1/career-directions/1")
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"不能修改","category":"测试","summary":"系统目录不可修改"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40450)));

        mockMvc.perform(delete("/api/v1/career-directions/1")
                        .header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isNotFound());
    }

    @Test
    void directionJobsUsePersistedVersionedMapping() throws Exception {
        mockMvc.perform(get("/api/v1/career-directions/1/jobs")
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.items[0].job.id", is(1002)))
                .andExpect(jsonPath("$.data.items[0].matchScore", greaterThanOrEqualTo(60)))
                .andExpect(jsonPath("$.data.items[0].matchReasons.length()", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.mappingVersion", is("direction-rule-v1")));

        mockMvc.perform(get("/api/v1/career-directions/1/jobs")
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].job.id", is(1002)))
                .andExpect(jsonPath("$.data.mappingVersion", is("direction-rule-v1")));
    }

    @Test
    void directionInsightsAggregateOnlyMappedRealJobs() throws Exception {
        mockMvc.perform(get("/api/v1/career-directions/2/insights")
                        .header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.directionId", is(2)))
                .andExpect(jsonPath("$.data.directionName", is("数据分析")))
                .andExpect(jsonPath("$.data.sampleSize", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.salary.sampleSize", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data.skills[*].name", org.hamcrest.Matchers.hasItem("SQL")))
                .andExpect(jsonPath("$.data.commonRequirements[*].name",
                        org.hamcrest.Matchers.hasItem("能够独立完成指标分析")))
                .andExpect(jsonPath("$.data.mappingVersion", is("direction-rule-v1")));
    }
}
