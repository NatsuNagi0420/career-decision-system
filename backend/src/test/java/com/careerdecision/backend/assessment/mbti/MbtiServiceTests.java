package com.careerdecision.backend.assessment.mbti;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class MbtiServiceTests {
    @Autowired
    private MbtiService service;

    @Test
    void questionsAreLoadedFromDatabase() {
        assertThat(service.questions())
                .hasSize(8)
                .first()
                .satisfies(question -> {
                    assertThat(question.id()).isEqualTo(1);
                    assertThat(question.options()).hasSize(2);
                });
    }

    @Test
    void submitCalculatesResultAndPersistsForUser() {
        MbtiResult result = service.submit(1L, new MbtiSubmitRequest(
                Map.of(
                        1, "A",
                        2, "A",
                        3, "A",
                        4, "A",
                        5, "A",
                        6, "A",
                        7, "A",
                        8, "A"
                ),
                1L
        ));

        assertThat(result.type()).isEqualTo("ESTJ");
        assertThat(result.scores()).containsEntry("E", 2);
        assertThat(result.description()).contains("组织");
    }
}
