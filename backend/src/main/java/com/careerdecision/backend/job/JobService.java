package com.careerdecision.backend.job;

import com.careerdecision.backend.exception.BusinessException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

@Service
public class JobService {
    private static final int MAX_PAGE_SIZE = 50;
    private static final int MAX_RECOMMENDATION_LIMIT = 20;
    private final JobMapper jobMapper;

    public JobService(JobMapper jobMapper) {
        this.jobMapper = jobMapper;
    }

    public JobPageResponse<JobSummaryResponse> search(JobSearchCriteria criteria) {
        validatePage(criteria.page(), criteria.size());

        JobSearchCriteria normalized = normalizeCriteria(criteria);
        long total = jobMapper.countSearch(normalized);
        List<JobSummaryResponse> items = jobMapper.search(
                        normalized,
                        normalized.page() * normalized.size(),
                        normalized.size()
                ).stream()
                .map(job -> JobSummaryResponse.from(job, jobMapper.findTags(job.getId())))
                .toList();
        return JobPageResponse.of(items, normalized.page(), normalized.size(), total);
    }

    public JobDetailResponse detail(long id) {
        JobRecord job = jobMapper.findActiveById(id);
        if (job == null) {
            throw new BusinessException(40401, "Job not found: " + id);
        }
        List<String> tags = jobMapper.findTags(id);
        return JobDetailResponse.from(job, tags);
    }

    public JobFacetsResponse facets() {
        return new JobFacetsResponse(
                toFacetItems(jobMapper.cityFacets()),
                toFacetItems(jobMapper.directionFacets()),
                toFacetItems(jobMapper.tagFacets())
        );
    }

    public List<JobMatchResponse> recommend(JobRecommendationRequest request) {
        Map<String, Object> profile = request == null || request.profile() == null ? Map.of() : request.profile();
        int limit = normalizeRecommendationLimit(request == null ? null : request.limit());
        String targetRole = firstText(profile, "target_role", "targetRole", "role");
        List<String> skills = stringList(profile.get("skills"));
        List<String> cities = stringList(firstPresent(profile, "target_cities", "targetCities", "cities"));
        String keyword = recommendationKeyword(targetRole, skills);

        List<JobRecord> candidates = jobMapper.recommendCandidates(keyword, cities, limit * 5);
        if (candidates.isEmpty() && !cities.isEmpty()) {
            candidates = jobMapper.recommendCandidates(keyword, List.of(), limit * 5);
        }
        if (candidates.isEmpty()) {
            candidates = jobMapper.topActiveJobs(limit * 5);
        }

        return candidates.stream()
                .map(job -> toMatch(job, targetRole, skills, cities))
                .sorted(Comparator.comparingInt(JobMatchResponse::matchScore).reversed())
                .limit(limit)
                .toList();
    }

    private void validatePage(int page, int size) {
        if (page < 0) {
            throw new BusinessException(40030, "Page must be greater than or equal to 0.");
        }
        if (size <= 0 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(40031, "Size must be between 1 and " + MAX_PAGE_SIZE + ".");
        }
    }

    private JobSearchCriteria normalizeCriteria(JobSearchCriteria criteria) {
        if (criteria == null) {
            return new JobSearchCriteria(null, null, null, null, null, null, null, 0, 10);
        }
        return new JobSearchCriteria(
                trimToNull(criteria.keyword()),
                trimToNull(criteria.city()),
                trimToNull(criteria.direction()),
                trimToNull(criteria.tag()),
                criteria.salaryMin(),
                criteria.salaryMax(),
                trimToNull(criteria.experienceLevel()),
                criteria.page(),
                criteria.size()
        );
    }

    private int normalizeRecommendationLimit(Integer limit) {
        if (limit == null) {
            return 8;
        }
        if (limit <= 0) {
            return 1;
        }
        return Math.min(limit, MAX_RECOMMENDATION_LIMIT);
    }

    private JobMatchResponse toMatch(JobRecord job, String targetRole, List<String> skills, List<String> cities) {
        List<String> tags = jobMapper.findTags(job.getId());
        JobSummaryResponse summary = JobSummaryResponse.from(job, tags);
        List<String> reasons = new ArrayList<>();
        int score = 52;

        if (contains(job.getTitle(), targetRole) || contains(job.getDirection(), targetRole)) {
            score += 24;
            reasons.add("岗位名称或方向与目标岗位高度接近");
        }
        if (!cities.isEmpty() && cities.stream().anyMatch(city -> Objects.equals(city, job.getCity()))) {
            score += 10;
            reasons.add("城市符合期望");
        }

        int matchedSkillCount = 0;
        for (String skill : skills) {
            if (contains(job.getTitle(), skill)
                    || contains(job.getDirection(), skill)
                    || contains(job.getIndustry(), skill)
                    || contains(job.getDescription(), skill)) {
                matchedSkillCount++;
            }
        }
        if (matchedSkillCount > 0) {
            score += Math.min(matchedSkillCount * 5, 18);
            reasons.add("技能关键词命中 " + matchedSkillCount + " 项");
        }

        if (job.getSalaryMin() != null || job.getSalaryMax() != null) {
            score += 4;
            reasons.add("薪资信息可用于决策比较");
        }
        if (job.getQualityScore() != null) {
            score += Math.min((int) Math.round(job.getQualityScore() / 20), 5);
        }
        if (reasons.isEmpty()) {
            reasons.add("岗位数据质量较高，可作为探索候选");
        }

        return new JobMatchResponse(summary, Math.min(score, 98), List.copyOf(reasons));
    }

    private String recommendationKeyword(String targetRole, List<String> skills) {
        if (targetRole != null && !targetRole.isBlank()) {
            return targetRole.trim();
        }
        return skills.stream()
                .filter(skill -> skill != null && !skill.isBlank())
                .findFirst()
                .orElse(null);
    }

    private Object firstPresent(Map<String, Object> values, String... keys) {
        for (String key : keys) {
            Object value = values.get(key);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String firstText(Map<String, Object> values, String... keys) {
        Object value = firstPresent(values, keys);
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private List<String> stringList(Object value) {
        if (value == null) {
            return List.of();
        }
        if (value instanceof Collection<?> collection) {
            return collection.stream()
                    .flatMap(item -> item == null ? Stream.empty() : Stream.of(String.valueOf(item).trim()))
                    .filter(item -> !item.isBlank())
                    .distinct()
                    .toList();
        }
        String text = String.valueOf(value);
        if (text.isBlank()) {
            return List.of();
        }
        return Stream.of(text.split("[,，/、]"))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .distinct()
                .toList();
    }

    private boolean contains(String source, String keyword) {
        if (source == null || keyword == null || keyword.isBlank()) {
            return false;
        }
        return source.toLowerCase().contains(keyword.toLowerCase());
    }

    private List<JobFacetItem> toFacetItems(List<JobFacetRow> rows) {
        return rows.stream()
                .map(row -> new JobFacetItem(row.getName(), row.getCount()))
                .toList();
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
