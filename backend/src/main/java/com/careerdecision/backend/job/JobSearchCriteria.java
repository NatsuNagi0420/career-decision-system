package com.careerdecision.backend.job;

public record JobSearchCriteria(
        String keyword,
        String city,
        String direction,
        String tag,
        Integer salaryMin,
        Integer salaryMax,
        String experienceLevel,
        int page,
        int size
) {
}
