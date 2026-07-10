package com.careerdecision.backend.pathplan;

import java.util.List;

public record PathPlanMilestoneResponse(
        long id,
        String title,
        String duration,
        List<PathPlanTaskResponse> tasks,
        List<String> acceptance
) {
}
