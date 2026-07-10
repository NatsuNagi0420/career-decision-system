package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.TraceContext;
import com.careerdecision.backend.config.AgentServerProperties;
import com.careerdecision.backend.job.JobMatchResponse;
import com.careerdecision.backend.job.JobRecommendationRequest;
import com.careerdecision.backend.job.JobService;
import com.careerdecision.backend.job.JobSummaryResponse;
import com.careerdecision.backend.service.AgentServerClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CareerReportControllerTest {
    private FakeAgentServerClient agentServerClient;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        agentServerClient = new FakeAgentServerClient();
        mockMvc = MockMvcBuilders
                .standaloneSetup(new CareerReportController(agentServerClient, new FakeJobService()))
                .build();
    }

    @AfterEach
    void tearDown() {
        TraceContext.clear();
    }

    @Test
    void generateEchoesRequestIdAsTraceIdAndInjectsJobCandidates() throws Exception {
        mockMvc.perform(post("/api/v1/career-reports/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "requestId": "report-trace-001",
                                  "userId": "1",
                                  "profile": {
                                    "target_role": "AI application engineer",
                                    "skills": ["Java", "Vue 3"]
                                  },
                                  "assessment": {
                                    "mbti_type": "INTJ"
                                  }
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.traceId", is("report-trace-001")))
                .andExpect(jsonPath("$.data.summary", is("Generated smoke report.")));

        assertThat(agentServerClient.capturedPayload).containsEntry("request_id", "report-trace-001");
        Object jobCandidates = agentServerClient.capturedPayload.get("job_candidates");
        assertThat(jobCandidates).isInstanceOf(List.class);
        assertThat((List<?>) jobCandidates).hasSize(1);
    }

    private static final class FakeAgentServerClient extends AgentServerClient {
        private Map<String, Object> capturedPayload;

        private FakeAgentServerClient() {
            super(
                    new AgentServerProperties("http://127.0.0.1:1", "test-token", 30),
                    new ObjectMapper(),
                    null
            );
        }

        @Override
        public Map<String, Object> generateCareerReport(Map<String, Object> payload) {
            capturedPayload = payload;
            return Map.of(
                    "summary", "Generated smoke report.",
                    "recommended_careers", List.of(Map.of("title", "AI application engineer"))
            );
        }
    }

    private static final class FakeJobService extends JobService {
        private FakeJobService() {
            super(null);
        }

        @Override
        public List<JobMatchResponse> recommend(JobRecommendationRequest request) {
            JobSummaryResponse job = new JobSummaryResponse(
                    1001L,
                    "AI application engineer",
                    "Career AI Lab",
                    "Shanghai",
                    "Shanghai",
                    "AI application",
                    "Artificial intelligence",
                    "100-299",
                    "20k-30k",
                    20000,
                    30000,
                    "month",
                    12,
                    "1-3 years",
                    List.of("Java", "Vue 3", "LLM"),
                    "Build AI career planning features.",
                    90.0
            );
            return List.of(new JobMatchResponse(job, 92, List.of("Matches target skills.")));
        }
    }
}
