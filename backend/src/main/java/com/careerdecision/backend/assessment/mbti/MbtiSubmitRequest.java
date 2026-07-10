package com.careerdecision.backend.assessment.mbti;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record MbtiSubmitRequest(
        @NotEmpty @Size(max = 120) Map<Integer, @Size(max = 8) String> answers,
        @Positive Long userId
) {
}
