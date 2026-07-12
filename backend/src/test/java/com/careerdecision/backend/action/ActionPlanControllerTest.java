package com.careerdecision.backend.action;

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

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
        "DELETE FROM user_profiles",
        "INSERT INTO user_profiles (user_id, display_name, target_cities, skills, certificates, experiences, values_json, raw_profile, onboarding_completed_at) VALUES (1, 'Alice', '[]', '[]', '[]', '[]', '[]', '{}', CURRENT_TIMESTAMP)",
        "INSERT INTO decision_projects (id, user_id, title, question, status, current_stage, is_current, decided_at) VALUES (8001, 1, 'Java backend or data analysis', 'Which direction should be validated first?', 'decided', 'target', 1, CURRENT_TIMESTAMP)",
        "INSERT INTO decision_candidates (id, project_id, direction_id, name, source_type, sort_order) VALUES (8011, 8001, 1, 'Java Backend', 'user', 0)",
        "INSERT INTO decision_candidates (id, project_id, direction_id, name, source_type, sort_order) VALUES (8012, 8001, 2, 'Data Analysis', 'user', 1)",
        "INSERT INTO decision_targets (id, user_id, project_id, candidate_id, target_type, target_name, decision_reason) VALUES (8101, 1, 8001, 8011, 'primary', 'Java Backend', 'Existing project evidence is stronger')"
})
class ActionPlanControllerTest {
    private static final String AUTH = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void actionPlanTaskResultAndWeeklyReviewFormAPersistentLoop() throws Exception {
        JsonNode generated = json(post("/api/v1/action-plans/generate")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "requestId": "action-plan-main-1",
                          "projectId": 8001,
                          "targetId": 8101,
                          "durationWeeks": 4,
                          "startDate": "2026-07-06"
                        }
                        """));
        long planId = generated.path("data").path("id").asLong();
        long taskId = generated.path("data").path("weeks").get(0).path("tasks").get(0).path("id").asLong();
        int taskVersion = generated.path("data").path("weeks").get(0).path("tasks").get(0).path("version").asInt();
        org.assertj.core.api.Assertions.assertThat(generated.path("data").path("weeks")).hasSize(4);
        org.assertj.core.api.Assertions.assertThat(generated.path("data").path("taskCount").asInt()).isEqualTo(8);
        org.assertj.core.api.Assertions.assertThat(
                generated.path("data").path("weeks").get(0).path("tasks").get(0).path("acceptanceCriteria").asText()
        ).isNotBlank();

        JsonNode repeated = json(post("/api/v1/action-plans/generate")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"requestId":"action-plan-main-1","projectId":8001,"targetId":8101,"durationWeeks":4}
                        """));
        org.assertj.core.api.Assertions.assertThat(repeated.path("data").path("id").asLong()).isEqualTo(planId);
        Integer planCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM path_plans WHERE generation_request_id = 'action-plan-main-1'",
                Integer.class
        );
        org.assertj.core.api.Assertions.assertThat(planCount).isEqualTo(1);

        json(patch("/api/v1/action-plans/{planId}/tasks/{taskId}/status", planId, taskId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"in_progress\",\"requestId\":\"task-start-1\",\"expectedVersion\":%d}"
                        .formatted(taskVersion)));

        JsonNode withResult = json(post("/api/v1/action-plans/{planId}/tasks/{taskId}/results", planId, taskId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "description": "Compared five backend job descriptions and extracted common requirements.",
                          "linkUrl": "https://example.com/job-analysis",
                          "requestId": "task-result-1"
                        }
                        """));
        org.assertj.core.api.Assertions.assertThat(
                withResult.path("data").path("weeks").get(0).path("tasks").get(0).path("results")
        ).hasSize(1);

        json(post("/api/v1/action-plans/{planId}/tasks/{taskId}/results", planId, taskId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "description": "The same offline result retry.",
                          "linkUrl": "https://example.com/job-analysis",
                          "requestId": "task-result-1"
                        }
                        """));
        Integer resultCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM task_results WHERE request_id = 'task-result-1'",
                Integer.class
        );
        org.assertj.core.api.Assertions.assertThat(resultCount).isEqualTo(1);

        JsonNode completed = json(patch("/api/v1/action-plans/{planId}/tasks/{taskId}/status", planId, taskId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"completed\",\"requestId\":\"task-complete-1\",\"expectedVersion\":%d}"
                        .formatted(taskVersion + 1)));
        org.assertj.core.api.Assertions.assertThat(completed.path("data").path("completedTaskCount").asInt()).isEqualTo(1);

        json(patch("/api/v1/action-plans/{planId}/tasks/{taskId}/status", planId, taskId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"completed\",\"requestId\":\"task-complete-1\",\"expectedVersion\":%d}"
                        .formatted(taskVersion + 1)));
        Integer completionChanges = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM task_change_history WHERE request_id = 'task-complete-1'",
                Integer.class
        );
        org.assertj.core.api.Assertions.assertThat(completionChanges).isEqualTo(1);

        mockMvc.perform(patch("/api/v1/action-plans/{planId}/tasks/{taskId}/status", planId, taskId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"todo\",\"requestId\":\"task-stale-1\",\"expectedVersion\":0}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40962)));

        JsonNode today = json(get("/api/v1/action-plans/current/today")
                .header(HttpHeaders.AUTHORIZATION, AUTH));
        org.assertj.core.api.Assertions.assertThat(today.path("data").path("planId").asLong()).isEqualTo(planId);
        org.assertj.core.api.Assertions.assertThat(today.path("data").path("tasks").size()).isLessThanOrEqualTo(3);

        JsonNode review = json(put("/api/v1/weekly-reviews")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "requestId": "weekly-review-main-1",
                          "planId": %d,
                          "weekNo": 1,
                          "completedSummary": "Completed job requirement analysis.",
                          "evidenceSummary": "A structured comparison sheet is available.",
                          "difficulties": "System design requirements are still unclear.",
                          "nextWeekMinutes": 360,
                          "confidenceTrend": "increased",
                          "confidenceReason": "The real job samples match current experience.",
                          "adjustmentProposal": "Defer one low-priority task by two days."
                        }
                        """.formatted(planId)));
        long reviewId = review.path("data").path("id").asLong();
        org.assertj.core.api.Assertions.assertThat(review.path("data").path("status").asText()).isEqualTo("draft");

        JsonNode submitted = json(post("/api/v1/weekly-reviews/{reviewId}/submit", reviewId)
                .header(HttpHeaders.AUTHORIZATION, AUTH));
        org.assertj.core.api.Assertions.assertThat(submitted.path("data").path("status").asText()).isEqualTo("submitted");

        JsonNode repeatedReview = json(put("/api/v1/weekly-reviews")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "requestId": "weekly-review-main-1",
                          "planId": %d,
                          "weekNo": 1,
                          "completedSummary": "Retry after an uncertain mobile response."
                        }
                        """.formatted(planId)));
        org.assertj.core.api.Assertions.assertThat(repeatedReview.path("data").path("id").asLong()).isEqualTo(reviewId);
        org.assertj.core.api.Assertions.assertThat(repeatedReview.path("data").path("status").asText())
                .isEqualTo("submitted");
        mockMvc.perform(put("/api/v1/weekly-reviews")
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "requestId": "weekly-review-main-1",
                                  "planId": %d,
                                  "weekNo": 2,
                                  "completedSummary": "This key belongs to week one."
                                }
                                """.formatted(planId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40972)));
        json(post("/api/v1/weekly-reviews/{reviewId}/submit", reviewId)
                .header(HttpHeaders.AUTHORIZATION, AUTH));
        Integer reviewCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM weekly_reviews WHERE request_id = 'weekly-review-main-1'", Integer.class);
        org.assertj.core.api.Assertions.assertThat(reviewCount).isEqualTo(1);

        JsonNode reviewList = json(get("/api/v1/weekly-reviews?planId=" + planId)
                .header(HttpHeaders.AUTHORIZATION, AUTH));
        org.assertj.core.api.Assertions.assertThat(reviewList.path("data")).hasSize(1);

        long deferredTaskId = generated.path("data").path("weeks").get(0).path("tasks").get(1).path("id").asLong();
        int deferredTaskVersion = generated.path("data").path("weeks").get(0).path("tasks").get(1)
                .path("version").asInt();
        mockMvc.perform(post("/api/v1/weekly-reviews/{reviewId}/adjustments/apply", reviewId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "confirmed": false,
                                  "requestId": "review-adjust-1",
                                  "adjustments": [{
                                    "taskId": %d,
                                    "status": "deferred",
                                    "reason": "Move to next study block",
                                    "deferredTo": "2026-07-15T20:00:00",
                                    "expectedVersion": %d
                                  }]
                                }
                                """.formatted(deferredTaskId, deferredTaskVersion)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(40071)));

        JsonNode applied = json(post("/api/v1/weekly-reviews/{reviewId}/adjustments/apply", reviewId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "confirmed": true,
                          "requestId": "review-adjust-1",
                          "adjustments": [{
                            "taskId": %d,
                            "status": "deferred",
                            "reason": "Move to next study block",
                            "deferredTo": "2026-07-15T20:00:00",
                            "expectedVersion": %d
                          }]
                        }
                        """.formatted(deferredTaskId, deferredTaskVersion)));
        org.assertj.core.api.Assertions.assertThat(applied.path("data").path("status").asText())
                .isEqualTo("adjustments_applied");

        JsonNode dashboard = json(get("/api/v1/dashboard").header(HttpHeaders.AUTHORIZATION, AUTH));
        org.assertj.core.api.Assertions.assertThat(dashboard.path("data").path("state").asText()).isEqualTo("executing");
        org.assertj.core.api.Assertions.assertThat(dashboard.path("data").path("primaryAction").asText())
                .isEqualTo("continue_task");
    }

    @Test
    void actionResourcesAreIsolatedAndGenerationRequiresConfirmedTarget() throws Exception {
        mockMvc.perform(post("/api/v1/action-plans/generate")
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"missing-project\",\"projectId\":9999}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40961)));

        ActionPlanModels.PlanDetail bobPlan = createBobPlan();
        mockMvc.perform(get("/api/v1/action-plans/{id}", bobPlan.id())
                        .header(HttpHeaders.AUTHORIZATION, AUTH))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40460)));
    }

    @Test
    void taskRequestIdsCannotBeReusedForAnotherTask() throws Exception {
        JsonNode generated = json(post("/api/v1/action-plans/generate")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"requestId":"action-plan-task-request-scope","projectId":8001,"targetId":8101}
                        """));
        long planId = generated.path("data").path("id").asLong();
        JsonNode first = generated.path("data").path("weeks").get(0).path("tasks").get(0);
        JsonNode second = generated.path("data").path("weeks").get(0).path("tasks").get(1);
        long firstId = first.path("id").asLong();
        long secondId = second.path("id").asLong();

        json(patch("/api/v1/action-plans/{planId}/tasks/{taskId}/status", planId, firstId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"in_progress\",\"requestId\":\"cross-task-status\",\"expectedVersion\":%d}"
                        .formatted(first.path("version").asInt())));

        mockMvc.perform(patch("/api/v1/action-plans/{planId}/tasks/{taskId}/status", planId, secondId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"in_progress\",\"requestId\":\"cross-task-status\",\"expectedVersion\":%d}"
                                .formatted(second.path("version").asInt())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40964)));
        org.assertj.core.api.Assertions.assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM path_plan_tasks WHERE id = ?", String.class, secondId
        )).isEqualTo("todo");

        json(post("/api/v1/action-plans/{planId}/tasks/{taskId}/results", planId, firstId)
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"description":"First task result","requestId":"cross-task-result"}
                        """));

        mockMvc.perform(post("/api/v1/action-plans/{planId}/tasks/{taskId}/results", planId, secondId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"description":"Wrong task result","requestId":"cross-task-result"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40964)));
        org.assertj.core.api.Assertions.assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM task_results WHERE task_id = ?", Integer.class, secondId
        )).isZero();
    }

    @Test
    void staleTaskVersionsCannotPartiallyReorderOrDeleteTasks() throws Exception {
        JsonNode generated = json(post("/api/v1/action-plans/generate")
                .header(HttpHeaders.AUTHORIZATION, AUTH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"requestId":"action-plan-concurrency","projectId":8001,"targetId":8101}
                        """));
        JsonNode first = generated.path("data").path("weeks").get(0).path("tasks").get(0);
        JsonNode second = generated.path("data").path("weeks").get(0).path("tasks").get(1);
        long firstId = first.path("id").asLong();
        long secondId = second.path("id").asLong();
        int firstVersion = first.path("version").asInt();

        mockMvc.perform(put("/api/v1/action-plans/{planId}/tasks/order", generated.path("data").path("id").asLong())
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "taskIds":[%d,%d],
                                  "expectedVersions":{"%d":%d,"%d":0}
                                }
                                """.formatted(secondId, firstId, secondId, second.path("version").asInt(), firstId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40962)));

        Integer versionAfterRollback = jdbcTemplate.queryForObject(
                "SELECT version FROM path_plan_tasks WHERE id = ?", Integer.class, secondId);
        org.assertj.core.api.Assertions.assertThat(versionAfterRollback).isEqualTo(second.path("version").asInt());

        mockMvc.perform(delete("/api/v1/action-plans/{planId}/tasks/{taskId}",
                        generated.path("data").path("id").asLong(), firstId)
                        .header(HttpHeaders.AUTHORIZATION, AUTH)
                        .param("expectedVersion", String.valueOf(firstVersion - 1)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40962)));

        Integer deleted = jdbcTemplate.queryForObject(
                "SELECT deleted FROM path_plan_tasks WHERE id = ?", Integer.class, firstId);
        org.assertj.core.api.Assertions.assertThat(deleted).isZero();
    }

    private ActionPlanModels.PlanDetail createBobPlan() {
        jdbcTemplate.update("INSERT INTO decision_projects (id, user_id, title, question, status, current_stage, is_current) VALUES (8201, 2, 'Private project', 'Private?', 'decided', 'target', 1)");
        jdbcTemplate.update("INSERT INTO decision_candidates (id, project_id, name, source_type, sort_order) VALUES (8211, 8201, 'Private target', 'user', 0)");
        jdbcTemplate.update("INSERT INTO decision_targets (id, user_id, project_id, candidate_id, target_type, target_name, decision_reason) VALUES (8221, 2, 8201, 8211, 'primary', 'Private target', 'Private')");
        return actionPlanService.generate(
                2L, new ActionPlanModels.GenerateRequest("bob-plan", 8201L, 8221L, 4, null)
        );
    }

    @Autowired
    private ActionPlanService actionPlanService;

    private JsonNode json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
            throws Exception {
        MvcResult result = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
