package com.careerdecision.backend.assessment.mbti;

public record MbtiOption(
        String code,
        String text,
        String dimension,
        String direction
) {
}
