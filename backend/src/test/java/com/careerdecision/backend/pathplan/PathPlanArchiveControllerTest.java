package com.careerdecision.backend.pathplan;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Sql(statements = {
        "DELETE FROM path_plan_tasks",
        "DELETE FROM path_plan_milestones",
        "DELETE FROM path_plans",
        "DELETE FROM agent_runs",
        "INSERT INTO agent_runs (id, request_id, user_id, agent_type, status) VALUES (9201, 'path-archive-run', 1, 'path_plan', 'success')"
})
class PathPlanArchiveControllerTest {
    private static final String AUTHORIZATION = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PathPlanArchiveService archiveService;

    @Test
    void pathPlansRequireAuthorization() throws Exception {
        mockMvc.perform(get("/api/v1/path-plans"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void pathPlanCanBeArchivedListedReadAndDeleted() throws Exception {
        MvcResult archiveResult = mockMvc.perform(post("/api/v1/path-plans/archive")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "targetRole": "AI 应用工程师",
                                  "overview": "12 周求职准备计划",
                                  "agentRunId": 9201,
                                  "milestones": [
                                    {
                                      "title": "定位验证",
                                      "duration": "2 周",
                                      "tasks": ["拆解 10 条 JD", "整理技能差距"],
                                      "acceptance": ["完成技能差距清单"]
                                    },
                                    {
                                      "title": "作品集冲刺",
                                      "duration": "6 周",
                                      "tasks": ["完成作品集", "准备项目演示"],
                                      "acceptance": ["作品可 3 分钟讲清"]
                                    }
                                  ],
                                  "checkpoints": ["第 2 周复盘", "第 8 周复盘"]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.id", notNullValue()))
                .andExpect(jsonPath("$.data.agentRunId", is(9201)))
                .andExpect(jsonPath("$.data.targetRole", is("AI 应用工程师")))
                .andExpect(jsonPath("$.data.taskCount", is(4)))
                .andExpect(jsonPath("$.data.completedTaskCount", is(0)))
                .andExpect(jsonPath("$.data.progressPercent", is(0)))
                .andExpect(jsonPath("$.data.milestones", hasSize(2)))
                .andExpect(jsonPath("$.data.milestones[0].tasks", hasSize(2)))
                .andExpect(jsonPath("$.data.milestones[0].tasks[0].id", notNullValue()))
                .andExpect(jsonPath("$.data.milestones[0].tasks[0].status", is("todo")))
                .andExpect(jsonPath("$.data.checkpoints", hasItem("第 2 周复盘")))
                .andReturn();

        long planId = objectMapper.readTree(archiveResult.getResponse().getContentAsString())
                .path("data")
                .path("id")
                .asLong();
        long taskId = objectMapper.readTree(archiveResult.getResponse().getContentAsString())
                .path("data")
                .path("milestones")
                .path(0)
                .path("tasks")
                .path(0)
                .path("id")
                .asLong();

        mockMvc.perform(get("/api/v1/path-plans")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id", is((int) planId)))
                .andExpect(jsonPath("$.data[0].agentRunId", is(9201)))
                .andExpect(jsonPath("$.data[0].milestoneCount", is(2)))
                .andExpect(jsonPath("$.data[0].taskCount", is(4)))
                .andExpect(jsonPath("$.data[0].completedTaskCount", is(0)))
                .andExpect(jsonPath("$.data[0].progressPercent", is(0)));

        mockMvc.perform(get("/api/v1/path-plans/{planId}", planId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id", is((int) planId)))
                .andExpect(jsonPath("$.data.agentRunId", is(9201)))
                .andExpect(jsonPath("$.data.taskCount", is(4)))
                .andExpect(jsonPath("$.data.completedTaskCount", is(0)))
                .andExpect(jsonPath("$.data.progressPercent", is(0)))
                .andExpect(jsonPath("$.data.milestones[1].acceptance[0]", is("作品可 3 分钟讲清")));

        mockMvc.perform(patch("/api/v1/path-plans/{planId}/tasks/{taskId}", planId, taskId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status": "done"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.completedTaskCount", is(1)))
                .andExpect(jsonPath("$.data.progressPercent", is(25)))
                .andExpect(jsonPath("$.data.milestones[0].tasks[0].status", is("done")))
                .andExpect(jsonPath("$.data.milestones[0].tasks[0].completedAt", notNullValue()));

        mockMvc.perform(get("/api/v1/path-plans")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].completedTaskCount", is(1)))
                .andExpect(jsonPath("$.data[0].progressPercent", is(25)));

        mockMvc.perform(patch("/api/v1/path-plans/{planId}/tasks/{taskId}", planId, taskId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status": "blocked"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(40043)));

        mockMvc.perform(delete("/api/v1/path-plans/{planId}", planId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)));

        mockMvc.perform(get("/api/v1/path-plans/{planId}", planId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40420)));
    }

    @Test
    void pathPlanEndpointsDoNotExposeOrMutateOtherUsersData() throws Exception {
        PathPlanDetailResponse bobPlan = archiveService.archive(2L, new PathPlanArchiveRequest(
                "Backend Engineer",
                "Bob private 8-week plan",
                null,
                List.of(new PathPlanMilestonePayload(
                        "Build portfolio",
                        "2 weeks",
                        List.of("Write private case study"),
                        List.of("Portfolio reviewed")
                )),
                List.of("Weekly review")
        ));
        long taskId = bobPlan.milestones().getFirst().tasks().getFirst().id();

        mockMvc.perform(get("/api/v1/path-plans")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));

        mockMvc.perform(get("/api/v1/path-plans/{planId}", bobPlan.id())
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40420)));

        mockMvc.perform(patch("/api/v1/path-plans/{planId}/tasks/{taskId}", bobPlan.id(), taskId)
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status": "done"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40421)));

        mockMvc.perform(delete("/api/v1/path-plans/{planId}", bobPlan.id())
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40420)));

        PathPlanDetailResponse stillOwnedByBob = archiveService.detail(2L, bobPlan.id());
        org.assertj.core.api.Assertions.assertThat(stillOwnedByBob.completedTaskCount()).isZero();
        org.assertj.core.api.Assertions.assertThat(stillOwnedByBob.milestones().getFirst().tasks().getFirst().status())
                .isEqualTo("todo");
    }
}
