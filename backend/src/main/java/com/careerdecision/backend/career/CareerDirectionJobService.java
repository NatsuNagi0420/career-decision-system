package com.careerdecision.backend.career;

import com.careerdecision.backend.career.CareerDirectionJobModels.DirectionInsights;
import com.careerdecision.backend.career.CareerDirectionJobModels.DirectionJobItem;
import com.careerdecision.backend.career.CareerDirectionJobModels.DirectionJobPage;
import com.careerdecision.backend.career.CareerDirectionJobModels.MappingRow;
import com.careerdecision.backend.career.CareerDirectionJobModels.MatchDraft;
import com.careerdecision.backend.career.CareerDirectionJobModels.MappingRun;
import com.careerdecision.backend.career.CareerDirectionJobModels.SalaryInsight;
import com.careerdecision.backend.career.CareerDirectionModels.DirectionRow;
import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.job.JobFacetItem;
import com.careerdecision.backend.job.JobFacetRow;
import com.careerdecision.backend.job.JobMapper;
import com.careerdecision.backend.job.JobRecord;
import com.careerdecision.backend.job.JobSummaryResponse;
import com.careerdecision.backend.job.JobTagRow;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class CareerDirectionJobService {
    private static final int MAX_PAGE_SIZE = 50;
    private static final int MIN_MATCH_SCORE = 28;
    private static final int MIN_FALLBACK_SAMPLE = 8;
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };
    private final CareerDirectionMapper directionMapper;
    private final CareerDirectionJobMapper mappingMapper;
    private final JobMapper jobMapper;
    private final CareerDirectionMatcher matcher;
    private final ObjectMapper objectMapper;

    public CareerDirectionJobService(
            CareerDirectionMapper directionMapper,
            CareerDirectionJobMapper mappingMapper,
            JobMapper jobMapper,
            CareerDirectionMatcher matcher,
            ObjectMapper objectMapper
    ) {
        this.directionMapper = directionMapper;
        this.mappingMapper = mappingMapper;
        this.jobMapper = jobMapper;
        this.matcher = matcher;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public DirectionJobPage jobs(long userId, long directionId, int page, int size) {
        validatePage(page, size);
        DirectionRow direction = visibleDirection(userId, directionId);
        ensureMapping(direction);
        long total = mappingMapper.count(directionId);
        List<DirectionJobItem> items = mappingMapper.page(directionId, page * size, size).stream()
                .map(this::item)
                .toList();
        int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / size);
        return new DirectionJobPage(
                items, page, size, total, totalPages, page + 1 < totalPages,
                page > 0 && totalPages > 0, CareerDirectionMatcher.RULE_VERSION
        );
    }

    @Transactional
    public DirectionInsights insights(long userId, long directionId) {
        DirectionRow direction = visibleDirection(userId, directionId);
        ensureMapping(direction);
        long samples = mappingMapper.count(directionId);
        return new DirectionInsights(
                directionId,
                direction.name(),
                samples,
                new SalaryInsight(
                        mappingMapper.minimumSalary(directionId),
                        rounded(mappingMapper.averageMinimumSalary(directionId)),
                        rounded(mappingMapper.averageMaximumSalary(directionId)),
                        mappingMapper.maximumSalary(directionId),
                        mappingMapper.salarySampleSize(directionId)
                ),
                facets(mappingMapper.cityFacets(directionId, 8)),
                facets(mappingMapper.educationFacets(directionId, 8)),
                facets(mappingMapper.experienceFacets(directionId, 8)),
                facets(mappingMapper.skillFacets(directionId, 12)),
                facets(mappingMapper.requirementFacets(directionId, 12)),
                mappingMapper.latestSourceUpdatedAt(directionId),
                CareerDirectionMatcher.RULE_VERSION
        );
    }

    private DirectionJobItem item(MappingRow mapping) {
        JobRecord job = jobMapper.findActiveById(mapping.jobId());
        if (job == null) {
            throw new BusinessException(40401, "Job not found: " + mapping.jobId());
        }
        return new DirectionJobItem(
                JobSummaryResponse.from(job, jobMapper.findTags(job.getId())),
                (int) Math.round(mapping.matchScore()), mapping.matchSource(), mapping.reviewStatus(),
                strings(mapping.matchReasonsJson())
        );
    }

    private void ensureMapping(DirectionRow direction) {
        long sourceJobCount = jobMapper.activeJobCount();
        long sourceTagRelationCount = jobMapper.activeJobTagRelationCount();
        LocalDateTime latestJobUpdatedAt = jobMapper.latestActiveJobUpdatedAt();
        MappingRun run = mappingMapper.findRun(direction.id());
        if (run != null
                && CareerDirectionMatcher.RULE_VERSION.equals(run.ruleVersion())
                && run.sourceJobCount() == sourceJobCount
                && run.sourceTagRelationCount() == sourceTagRelationCount
                && java.util.Objects.equals(run.latestJobUpdatedAt(), latestJobUpdatedAt)) {
            return;
        }
        List<String> skills = strings(direction.commonSkillsJson());
        List<String> industries = strings(direction.industryTagsJson());
        Map<Long, List<String>> tagsByJob = jobMapper.allActiveJobTags().stream()
                .collect(Collectors.groupingBy(
                        JobTagRow::jobId,
                        Collectors.mapping(JobTagRow::name, Collectors.toList())
                ));
        List<MatchDraft> candidates = new ArrayList<>();
        for (JobRecord job : jobMapper.allActiveJobs()) {
            candidates.add(matcher.match(direction, skills, industries, job,
                    tagsByJob.getOrDefault(job.getId(), List.of())));
        }
        candidates.sort(Comparator.comparingDouble(MatchDraft::score).reversed().thenComparing(MatchDraft::jobId));
        List<MatchDraft> selected = candidates.stream().filter(match -> match.score() >= MIN_MATCH_SCORE).toList();
        if (selected.size() < MIN_FALLBACK_SAMPLE) {
            selected = candidates.stream().filter(match -> match.score() > 0).limit(MIN_FALLBACK_SAMPLE).toList();
        }

        mappingMapper.deleteRuleMappings(direction.id());
        for (MatchDraft match : selected) {
            mappingMapper.insertRuleMapping(
                    direction.id(), match.jobId(), match.score(), CareerDirectionMatcher.RULE_VERSION,
                    json(match.reasons())
            );
        }
        mappingMapper.deleteRun(direction.id());
        mappingMapper.insertRun(
                direction.id(), CareerDirectionMatcher.RULE_VERSION, sourceJobCount,
                sourceTagRelationCount, latestJobUpdatedAt
        );
    }

    private DirectionRow visibleDirection(long userId, long directionId) {
        DirectionRow direction = directionMapper.findById(userId, directionId);
        if (direction == null) {
            throw new BusinessException(40450, "Career direction not found: " + directionId);
        }
        return direction;
    }

    private void validatePage(int page, int size) {
        if (page < 0) throw new BusinessException(40030, "Page must be greater than or equal to 0.");
        if (size <= 0 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(40031, "Size must be between 1 and " + MAX_PAGE_SIZE + ".");
        }
    }

    private List<JobFacetItem> facets(List<JobFacetRow> rows) {
        return rows.stream().map(row -> new JobFacetItem(row.getName(), row.getCount())).toList();
    }

    private Integer rounded(Double value) {
        return value == null ? null : (int) Math.round(value);
    }

    private List<String> strings(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }

    private String json(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50051, "Failed to serialize direction mapping reasons.");
        }
    }
}
