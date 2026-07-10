package com.careerdecision.backend.pathplan;

import java.time.LocalDateTime;

public record PathPlanSnapshotResponse(
        long id,
        Long agentRunId,
        String targetRole,
        String overview,
        String status,
        int milestoneCount,
        int taskCount,
        int completedTaskCount,
        int progressPercent,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
