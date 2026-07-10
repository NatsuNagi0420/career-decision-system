package com.careerdecision.backend.job;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record JobMatchResponse(
        JobSummaryResponse job,
        int matchScore,
        List<String> reasons
) {
    public Map<String, Object> toAgentPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", job.id());
        payload.put("title", job.title());
        payload.put("company", job.company());
        payload.put("location", job.location());
        payload.put("direction", job.direction());
        payload.put("salary_range", job.salaryRange());
        payload.put("industry", job.industry());
        payload.put("match_score", matchScore);
        payload.put("reasons", reasons);
        payload.put("core_skills", job.tags());
        return payload;
    }
}
