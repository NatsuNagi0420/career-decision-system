package com.careerdecision.backend.job;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public record JobSummaryResponse(
        long id,
        String title,
        String company,
        String city,
        String location,
        String direction,
        String industry,
        String companySize,
        String salaryRange,
        Integer salaryMin,
        Integer salaryMax,
        String salaryPeriod,
        Integer salaryMonths,
        String experienceLevel,
        String education,
        List<String> tags,
        String summary,
        Double qualityScore,
        String sourcePlatform,
        String sourceUrl,
        String sourceUpdatedText,
        LocalDateTime sourceUpdatedAt
) {
    public static JobSummaryResponse from(JobRecord job, List<String> tags) {
        List<String> displayTags = displayTags(job, tags);
        return new JobSummaryResponse(
                job.getId(),
                job.getTitle(),
                job.getCompany(),
                job.getCity(),
                location(job),
                job.getDirection(),
                job.getIndustry(),
                job.getCompanySize(),
                job.getSalaryText(),
                job.getSalaryMin(),
                job.getSalaryMax(),
                job.getSalaryPeriod(),
                job.getSalaryMonths(),
                job.getExperienceLevel(),
                job.getEducation(),
                displayTags,
                summary(job.getDescription()),
                job.getQualityScore(),
                job.getSourcePlatform(),
                job.getSourceUrl(),
                job.getSourceUpdatedText(),
                job.getSourceUpdatedAt()
        );
    }

    private static String location(JobRecord job) {
        if (job.getLocationText() != null && !job.getLocationText().isBlank()) {
            return job.getLocationText();
        }
        return job.getCity();
    }

    private static String summary(String description) {
        if (description == null || description.isBlank()) {
            return "";
        }
        String normalized = description.replace("\r", "\n");
        int lineEnd = normalized.indexOf('\n');
        String firstLine = lineEnd >= 0 ? normalized.substring(0, lineEnd) : normalized;
        if (firstLine.length() <= 140) {
            return firstLine;
        }
        return firstLine.substring(0, 140) + "...";
    }

    private static List<String> displayTags(JobRecord job, List<String> tags) {
        if (!tags.isEmpty()) {
            return List.copyOf(tags);
        }
        List<String> fallback = new ArrayList<>();
        addIfPresent(fallback, job.getDirection());
        addIfPresent(fallback, job.getIndustry());
        addIfPresent(fallback, job.getCompanySize());
        addIfPresent(fallback, job.getFinancingStage());
        return List.copyOf(fallback);
    }

    private static void addIfPresent(List<String> values, String value) {
        if (value != null && !value.isBlank() && !values.contains(value)) {
            values.add(value);
        }
    }
}
