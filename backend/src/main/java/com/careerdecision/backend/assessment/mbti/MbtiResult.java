package com.careerdecision.backend.assessment.mbti;

import java.util.Map;

public record MbtiResult(
        String type,
        Map<String, Integer> scores,
        String description
) {
}
