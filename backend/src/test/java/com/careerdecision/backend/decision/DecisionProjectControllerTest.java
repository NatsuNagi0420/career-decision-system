package com.careerdecision.backend.decision;

import com.fasterxml.jackson.databind.JsonNode;
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

import java.time.LocalDate;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Sql(statements = {
        "DELETE FROM reports",
        "DELETE FROM weekly_reviews",
        "DELETE FROM task_change_history",
        "DELETE FROM task_results",
        "DELETE FROM path_plan_tasks",
        "DELETE FROM path_plan_milestones",
        "DELETE FROM path_plans",
        "DELETE FROM target_confidence_feedback",
        "DELETE FROM decision_targets",
        "DELETE FROM comparison_results",
        "DELETE FROM comparison_criteria",
        "DELETE FROM decision_evidence",
        "DELETE FROM decision_project_job_samples",
        "DELETE FROM decision_candidates",
        "DELETE FROM decision_projects",
        "DELETE FROM personal_evidence",
        "DELETE FROM user_profiles"
})
class DecisionProjectControllerTest {
    private static final String AUTH = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private DecisionProjectService service;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void completesDecisionFlowAndMirrorsPrimaryTarget() throws Exception {
        JsonNode project = performJson(post("/api/v1/decision-projects")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "title": "Java 后端还是数据分析",
                          "question": "未来三个月优先验证 Java 后端还是数据分析？",
                          "decisionDeadline": "2026-08-01",
                          "background": "目前掌握 Java 和基础 SQL。",
                          "priorities": ["成长空间", "岗位机会"],
                          "mustHaves": ["可以积累作品"],
                          "dealBreakers": ["长期没有反馈"]
                        }
                        """));
        long projectId = project.path("data").path("id").asLong();
        org.assertj.core.api.Assertions.assertThat(project.path("data").path("criteria")).hasSize(7);

        JsonNode withBackend = performJson(post("/api/v1/decision-projects/{id}/candidates", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "directionId": 1,
                          "name": "Java 后端",
                          "recommendationReason": "已有 Java 项目经验",
                          "opposingFactors": "系统基础仍需补齐",
                          "uncertainties": "尚未验证真实岗位要求",
                          "validationActions": ["分析 5 个岗位"],
                          "sourceType": "user"
                        }
                        """));
        long backendCandidateId = withBackend.path("data").path("candidates").get(0).path("id").asLong();

        mockMvc.perform(post("/api/v1/decision-projects/{id}/targets/confirm", projectId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "primaryCandidateId": %d,
                                  "decisionReason": "先验证后端",
                                  "confirmed": true
                                }
                                """.formatted(backendCandidateId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40955)));

        JsonNode withTwo = performJson(post("/api/v1/decision-projects/{id}/candidates", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "directionId": 2,
                          "name": "数据分析",
                          "recommendationReason": "SQL 基础可复用",
                          "opposingFactors": "统计基础较弱",
                          "uncertainties": "不清楚业务分析偏好",
                          "validationActions": ["完成一次数据分析小项目"]
                        }
                        """));
        long dataCandidateId = withTwo.path("data").path("candidates").get(1).path("id").asLong();

        JsonNode withJob = performJson(post("/api/v1/decision-projects/{id}/job-samples", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"candidateId": %d, "jobId": 1002, "note": "后端岗位样本"}
                        """.formatted(backendCandidateId)));
        org.assertj.core.api.Assertions.assertThat(withJob.path("data").path("jobSamples")).hasSize(1);

        performJson(post("/api/v1/decision-projects/{id}/job-samples", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"candidateId": %d, "jobId": 1005, "note": "数据分析岗位样本"}
                        """.formatted(dataCandidateId)));

        JsonNode withEvidence = performJson(post("/api/v1/decision-projects/{id}/evidence", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "candidateId": %d,
                          "title": "完成过 Spring Boot 项目",
                          "detail": "能说明接口、数据库和异常处理。",
                          "sourceType": "user",
                          "credibility": "high",
                          "stance": "support"
                        }
                        """.formatted(backendCandidateId)));
        long evidenceId = withEvidence.path("data").path("evidence").get(0).path("id").asLong();
        long criterionId = withEvidence.path("data").path("criteria").get(1).path("id").asLong();

        JsonNode withBackupEvidence = performJson(post("/api/v1/decision-projects/{id}/evidence", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "candidateId": %d,
                          "title": "完成过 SQL 课程练习",
                          "detail": "可以完成基础查询，但统计分析证据不足。",
                          "sourceType": "user",
                          "credibility": "medium",
                          "stance": "support"
                        }
                        """.formatted(dataCandidateId)));
        long backupEvidenceId = withBackupEvidence.path("data").path("evidence").get(0).path("id").asLong();

        performJson(patch("/api/v1/decision-projects/{id}/stage", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"stage\":\"evidence\"}"));
        performJson(patch("/api/v1/decision-projects/{id}/stage", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"stage\":\"candidates\"}"));
        performJson(patch("/api/v1/decision-projects/{id}/stage", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"stage\":\"compare\"}"));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/decision-projects/{id}/criteria/{criterionId}/results", projectId, criterionId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"candidateId": %d, "score": 4, "assessment": "缺少可追溯依据"}
                                """.formatted(backendCandidateId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(40054)));

        JsonNode compared = performJson(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .put("/api/v1/decision-projects/{id}/criteria/{criterionId}/results", projectId, criterionId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "candidateId": %d,
                          "score": 4,
                          "assessment": "已有可说明的项目证据",
                          "evidenceIds": [%d],
                          "uncertainty": "项目复杂度有限",
                          "validationAction": "再完成一个含并发场景的项目"
                        }
                        """.formatted(backendCandidateId, evidenceId)));
        org.assertj.core.api.Assertions.assertThat(
                compared.path("data").path("criteria").get(1).path("results").get(0).path("score").asInt()
        ).isEqualTo(4);

        performJson(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .put("/api/v1/decision-projects/{id}/criteria/{criterionId}/results", projectId, criterionId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "candidateId": %d,
                          "score": 3,
                          "assessment": "已有 SQL 基础，但实践深度有限",
                          "evidenceIds": [%d],
                          "uncertainty": "统计基础尚未验证",
                          "validationAction": "完成一次真实数据分析"
                        }
                        """.formatted(dataCandidateId, backupEvidenceId)));

        JsonNode decided = performJson(post("/api/v1/decision-projects/{id}/targets/confirm", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "primaryCandidateId": %d,
                          "backupCandidateId": %d,
                          "decisionReason": "已有证据更强，先用四周计划继续验证。",
                          "mainRisks": "系统基础和岗位样本仍不足。",
                          "reviewDate": "2026-08-15",
                          "confirmed": true
                        }
                        """.formatted(backendCandidateId, dataCandidateId)));
        org.assertj.core.api.Assertions.assertThat(decided.path("data").path("status").asText()).isEqualTo("decided");
        org.assertj.core.api.Assertions.assertThat(decided.path("data").path("targets")).hasSize(2);
        org.assertj.core.api.Assertions.assertThat(decided.path("data").path("targets").get(0).path("targetType").asText())
                .isEqualTo("primary");

        long primaryTargetId = decided.path("data").path("targets").get(0).path("id").asLong();
        String confidencePayload = """
                {
                  "requestId": "confidence-test-001",
                  "trend": "increased",
                  "reason": "真实岗位和项目证据让目标更清楚。"
                }
                """;
        JsonNode feedback = performJson(post(
                        "/api/v1/decision-projects/{id}/targets/{targetId}/confidence-feedback",
                        projectId, primaryTargetId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content(confidencePayload));
        JsonNode repeatedFeedback = performJson(post(
                        "/api/v1/decision-projects/{id}/targets/{targetId}/confidence-feedback",
                        projectId, primaryTargetId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content(confidencePayload));
        org.assertj.core.api.Assertions.assertThat(repeatedFeedback.path("data").path("id").asLong())
                .isEqualTo(feedback.path("data").path("id").asLong());
        Integer feedbackCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM target_confidence_feedback WHERE request_id = 'confidence-test-001'",
                Integer.class);
        org.assertj.core.api.Assertions.assertThat(feedbackCount).isEqualTo(1);

        String mirroredTarget = jdbcTemplate.queryForObject(
                "SELECT target_role FROM user_profiles WHERE user_id = 1", String.class);
        org.assertj.core.api.Assertions.assertThat(mirroredTarget).isEqualTo("Java 后端");
    }

    @Test
    void projectsAreIsolatedByUserAndCandidateLimitIsEnforced() throws Exception {
        DecisionProjectModels.ProjectDetail bobProject = service.create(2L, new DecisionProjectModels.ProjectRequest(
                "Bob private choice", "Backend or product?", LocalDate.now().plusDays(14),
                null, null, List.of(), List.of(), List.of(), null
        ));

        mockMvc.perform(get("/api/v1/decision-projects/{id}", bobProject.id())
                        .header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40456)));

        jdbcTemplate.update(
                "INSERT INTO decision_candidates (id, project_id, name, source_type, sort_order) VALUES (9901, ?, 'Private target', 'user', 0)",
                bobProject.id());
        jdbcTemplate.update("""
                INSERT INTO decision_targets
                  (id, user_id, project_id, candidate_id, target_type, target_name, decision_reason)
                VALUES (9902, 2, ?, 9901, 'primary', 'Private target', 'Private reason')
                """, bobProject.id());
        mockMvc.perform(post(
                        "/api/v1/decision-projects/{id}/targets/{targetId}/confidence-feedback",
                        bobProject.id(), 9902)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"requestId":"cross-user-confidence","trend":"stable","reason":"private"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40456)));

        JsonNode project = performJson(post("/api/v1/decision-projects")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"候选限制\",\"question\":\"验证最多五个候选\"}"));
        long projectId = project.path("data").path("id").asLong();
        for (int index = 1; index <= 5; index++) {
            performJson(post("/api/v1/decision-projects/{id}/candidates", projectId)
                    .header(HttpHeaders.AUTHORIZATION, AUTH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"候选%d\"}".formatted(index)));
        }
        mockMvc.perform(post("/api/v1/decision-projects/{id}/candidates", projectId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"第六个候选\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40953)));
    }

    @Test
    void staleProjectVersionCannotOverwriteNewerDecisionData() throws Exception {
        JsonNode project = performJson(post("/api/v1/decision-projects")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"并发决策\",\"question\":\"先验证哪个方向？\"}"));
        long projectId = project.path("data").path("id").asLong();
        int initialVersion = project.path("data").path("version").asInt();

        performJson(post("/api/v1/decision-projects/{id}/candidates", projectId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name":"Java 后端","expectedVersion":%d}
                        """.formatted(initialVersion)));

        mockMvc.perform(post("/api/v1/decision-projects/{id}/candidates", projectId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"数据分析","expectedVersion":%d}
                                """.formatted(initialVersion)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40950)));

        Integer candidateCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM decision_candidates WHERE project_id = ? AND status = 'active'",
                Integer.class,
                projectId
        );
        org.assertj.core.api.Assertions.assertThat(candidateCount).isEqualTo(1);
    }

    @Test
    void listSelectionAndArchiveUseProjectVersions() throws Exception {
        JsonNode first = performJson(post("/api/v1/decision-projects")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"First choice\",\"question\":\"Which first direction?\"}"));
        long firstId = first.path("data").path("id").asLong();
        int firstVersion = first.path("data").path("version").asInt();

        performJson(post("/api/v1/decision-projects")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Second choice\",\"question\":\"Which second direction?\"}"));

        JsonNode listed = performJson(get("/api/v1/decision-projects")
                .header(HttpHeaders.AUTHORIZATION, AUTH));
        JsonNode firstSummary = null;
        for (JsonNode item : listed.path("data")) {
            if (item.path("id").asLong() == firstId) {
                firstSummary = item;
                break;
            }
        }
        org.assertj.core.api.Assertions.assertThat(firstSummary).isNotNull();
        int changedVersion = firstSummary.path("version").asInt();
        org.assertj.core.api.Assertions.assertThat(firstSummary.path("current").asBoolean()).isFalse();
        org.assertj.core.api.Assertions.assertThat(changedVersion).isEqualTo(firstVersion + 1);
        org.assertj.core.api.Assertions.assertThat(firstSummary.path("version").asInt()).isEqualTo(changedVersion);

        mockMvc.perform(post("/api/v1/decision-projects/{id}/current", firstId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":%d}".formatted(firstVersion)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40950)));

        JsonNode current = performJson(post("/api/v1/decision-projects/{id}/current", firstId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":%d}".formatted(changedVersion)));
        int currentVersion = current.path("data").path("version").asInt();
        org.assertj.core.api.Assertions.assertThat(current.path("data").path("current").asBoolean()).isTrue();
        org.assertj.core.api.Assertions.assertThat(currentVersion).isEqualTo(changedVersion + 1);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/v1/decision-projects/{id}", firstId)
                        .queryParam("expectedVersion", String.valueOf(changedVersion))
                        .header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40950)));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/v1/decision-projects/{id}", firstId)
                        .queryParam("expectedVersion", String.valueOf(currentVersion))
                        .header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)));

        mockMvc.perform(get("/api/v1/decision-projects/{id}", firstId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40456)));
    }

    private JsonNode performJson(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
            throws Exception {
        MvcResult result = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data", notNullValue()))
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
