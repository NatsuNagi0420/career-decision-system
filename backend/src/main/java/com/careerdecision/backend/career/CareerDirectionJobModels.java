package com.careerdecision.backend.career;

import com.careerdecision.backend.job.JobFacetItem;
import com.careerdecision.backend.job.JobSummaryResponse;

import java.time.LocalDateTime;
import java.util.List;

public final class CareerDirectionJobModels {
    private CareerDirectionJobModels() { }

    public record MappingRow(
            Long jobId,
            Double matchScore,
            String matchSource,
            String ruleVersion,
            String reviewStatus,
            String matchReasonsJson
    ) { }

    public record MappingRun(
            Long directionId,
            String ruleVersion,
            Long sourceJobCount,
            Long sourceTagRelationCount,
            LocalDateTime latestJobUpdatedAt,
            LocalDateTime generatedAt
    ) { }

    public record DirectionJobItem(
            JobSummaryResponse job,
            int matchScore,
            String matchSource,
            String reviewStatus,
            List<String> matchReasons
    ) { }

    public record DirectionJobPage(
            List<DirectionJobItem> items,
            int page,
            int size,
            long totalElements,
            int totalPages,
            boolean hasNext,
            boolean hasPrevious,
            String mappingVersion
    ) { }

    public record SalaryInsight(
            Integer minimumMonthly,
            Integer averageMinimumMonthly,
            Integer averageMaximumMonthly,
            Integer maximumMonthly,
            long sampleSize
    ) { }

    public record DirectionInsights(
            long directionId,
            String directionName,
            long sampleSize,
            SalaryInsight salary,
            List<JobFacetItem> cities,
            List<JobFacetItem> educationLevels,
            List<JobFacetItem> experienceLevels,
            List<JobFacetItem> skills,
            List<JobFacetItem> commonRequirements,
            LocalDateTime latestSourceUpdatedAt,
            String mappingVersion
    ) { }

    public record MatchDraft(long jobId, double score, List<String> reasons) { }
}
