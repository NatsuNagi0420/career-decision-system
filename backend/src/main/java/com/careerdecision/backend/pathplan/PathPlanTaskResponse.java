package com.careerdecision.backend.pathplan;

import java.time.LocalDateTime;

public record PathPlanTaskResponse(
        long id,
        String content,
        String status,
        LocalDateTime completedAt
) {
}
