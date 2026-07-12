package com.careerdecision.backend.report;

import java.time.Instant;

public record ReportSnapshot(
        String id,
        String userId,
        Long decisionProjectId,
        Long agentRunId,
        Integer snapshotVersion,
        String generationRequestId,
        String type,
        String title,
        String summary,
        String content,
        Instant createdAt,
        Instant updatedAt
) {
}
