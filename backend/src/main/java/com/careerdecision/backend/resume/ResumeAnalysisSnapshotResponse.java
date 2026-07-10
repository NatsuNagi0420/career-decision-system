package com.careerdecision.backend.resume;

import java.time.LocalDateTime;

public record ResumeAnalysisSnapshotResponse(
        long id,
        Long agentRunId,
        String targetRole,
        Integer score,
        Integer atsScore,
        Integer keywordMatch,
        int issueCount,
        int suggestionCount,
        LocalDateTime createdAt
) {
}
