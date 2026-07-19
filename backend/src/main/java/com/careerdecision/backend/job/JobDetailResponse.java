package com.careerdecision.backend.job;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public record JobDetailResponse(
        long id,
        String title,
        String company,
        String location,
        String direction,
        String salaryRange,
        String experienceLevel,
        String education,
        List<String> tags,
        String summary,
        List<String> responsibilities,
        List<String> requirements,
        List<String> growthPath,
        List<String> interviewFocus,
        String sourcePlatform,
        String sourceUrl,
        String sourceUpdatedText,
        LocalDateTime sourceUpdatedAt
) {
    static JobDetailResponse from(
            JobRecord job,
            List<String> tags,
            List<JobRequirementItem> items,
            String displaySummary
    ) {
        List<String> immutableTags = displayTags(job, tags);
        return new JobDetailResponse(
                job.getId(),
                job.getTitle(),
                job.getCompany(),
                location(job),
                job.getDirection(),
                job.getSalaryText(),
                job.getExperienceLevel(),
                job.getEducation(),
                immutableTags,
                displaySummary,
                texts(items, "responsibility"),
                texts(items, "requirement", "skill", "education", "experience", "certificate"),
                texts(items, "growth_path"),
                texts(items, "interview_focus"),
                job.getSourcePlatform(),
                job.getSourceUrl(),
                job.getSourceUpdatedText(),
                job.getSourceUpdatedAt()
        );
    }

    private static List<String> texts(List<JobRequirementItem> items, String... types) {
        List<String> accepted = List.of(types);
        return items.stream()
                .filter(item -> accepted.contains(item.itemType()))
                .map(JobRequirementItem::originalText)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .toList();
    }

    private static String location(JobRecord job) {
        if (job.getLocationText() != null && !job.getLocationText().isBlank()) {
            return job.getLocationText();
        }
        return job.getCity();
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
