package com.careerdecision.backend.assessment.mbti;

import java.time.LocalDateTime;
import java.util.Map;

public record MbtiHistoryItem(
        long id,
        String type,
        Map<String, Integer> scores,
        String description,
        LocalDateTime submittedAt
) {
}
