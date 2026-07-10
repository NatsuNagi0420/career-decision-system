package com.careerdecision.backend.resume;

import java.time.LocalDateTime;
import java.util.List;

public record ResumeAnalysisDetailResponse(
        long id,
        Long agentRunId,
        String targetRole,
        Integer score,
        Integer atsScore,
        Integer keywordMatch,
        List<String> issues,
        List<String> suggestions,
        List<String> improvedFragments,
        LocalDateTime createdAt
) {
}
