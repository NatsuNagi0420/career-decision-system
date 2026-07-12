package com.careerdecision.backend.assessment.mbti;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Sql(statements = {
        "DELETE FROM assessment_answers",
        "DELETE FROM assessment_sessions"
})
class MbtiControllerSecurityTest {
    private static final String PAYLOAD = """
            {
              "userId": 2,
              "answers": {
                "1": "A", "2": "A", "3": "A", "4": "A",
                "5": "A", "6": "A", "7": "A", "8": "A"
              }
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void submitRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/assessments/mbti/submit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PAYLOAD))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void historyRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/assessments/mbti/history"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void submittedResultUsesAuthenticatedUserInsteadOfBodyUserId() throws Exception {
        mockMvc.perform(post("/api/v1/assessments/mbti/submit")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer test-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PAYLOAD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.type", is("ESTJ")));

        Integer userOneSessions = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM assessment_sessions WHERE user_id = 1", Integer.class);
        Integer userTwoSessions = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM assessment_sessions WHERE user_id = 2", Integer.class);
        assertThat(userOneSessions).isEqualTo(1);
        assertThat(userTwoSessions).isZero();

        jdbcTemplate.update("""
                INSERT INTO assessment_sessions
                  (user_id, assessment_code, test_no, status, result_code, score_json, result_json, submitted_at)
                VALUES (2, 'MBTI', 'private-result', 'submitted', 'INFP', '{}',
                  '{"type":"INFP","scores":{},"description":"private"}', CURRENT_TIMESTAMP)
                """);

        mockMvc.perform(get("/api/v1/assessments/mbti/history")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.length()", is(1)))
                .andExpect(jsonPath("$.data[0].type", is("ESTJ")))
                .andExpect(jsonPath("$.data[0].submittedAt").exists());
    }
}
