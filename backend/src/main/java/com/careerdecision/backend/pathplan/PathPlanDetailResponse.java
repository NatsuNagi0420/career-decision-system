package com.careerdecision.backend.pathplan;

import java.time.LocalDateTime;
import java.util.List;

public record PathPlanDetailResponse(
        long id,
        Long agentRunId,
        String targetRole,
        String overview,
        String status,
        int taskCount,
        int completedTaskCount,
        int progressPercent,
        List<PathPlanMilestoneResponse> milestones,
        List<String> checkpoints,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
