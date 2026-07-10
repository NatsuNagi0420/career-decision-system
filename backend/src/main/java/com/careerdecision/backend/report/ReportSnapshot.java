package com.careerdecision.backend.report;

import java.time.Instant;

public record ReportSnapshot(
        String id,
        String userId,
        Long agentRunId,
        String type,
        String title,
        String summary,
        String content,
        Instant createdAt,
        Instant updatedAt
) {
}
