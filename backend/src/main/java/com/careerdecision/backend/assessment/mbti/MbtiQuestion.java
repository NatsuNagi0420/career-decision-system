package com.careerdecision.backend.assessment.mbti;

import java.util.List;

public record MbtiQuestion(
        int id,
        String text,
        List<MbtiOption> options
) {
}
