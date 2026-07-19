package com.careerdecision.backend.coaching;

import com.careerdecision.backend.action.ActionPlanModels.PlanDetail;
import com.careerdecision.backend.decision.DecisionProjectModels.JobSampleResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectDetail;
import com.careerdecision.backend.decision.DecisionProjectModels.TargetResponse;
import com.careerdecision.backend.evidence.PersonalEvidenceService;
import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.job.JobDetailResponse;
import com.careerdecision.backend.job.JobService;
import com.careerdecision.backend.profile.UserProfileService;
import com.careerdecision.backend.review.WeeklyReviewModels.ReviewResponse;
import com.careerdecision.backend.user.UserInfo;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Assembles the trusted, user-scoped evidence used by all specialised coaches.
 * Resource ids are resolved by backend services before anything is sent to the
 * agent server; the browser never supplies profile, evidence or JD facts.
 */
@Service
public class DecisionContextAssembler {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() { };
    private static final int MAX_PERSONAL_EVIDENCE = 24;
    private static final int MAX_JOB_DETAILS = 12;
    private static final int MAX_ITEMS = 40;
    private static final int MAX_TEXT = 1600;
    private static final int MAX_JOB_TEXT = 1600;

    private final UserProfileService userProfileService;
    private final PersonalEvidenceService personalEvidenceService;
    private final JobService jobService;
    private final ObjectMapper objectMapper;

    public DecisionContextAssembler(
            UserProfileService userProfileService,
            PersonalEvidenceService personalEvidenceService,
            JobService jobService,
            ObjectMapper objectMapper
    ) {
        this.userProfileService = userProfileService;
        this.personalEvidenceService = personalEvidenceService;
        this.jobService = jobService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> assemble(
            UserInfo user,
            ProjectDetail project,
            PlanDetail plan,
            ReviewResponse review
    ) {
        Map<String, Object> context = new LinkedHashMap<>();
        Map<String, Object> profile = map(userProfileService.get(user));
        profile.remove("userId");
        profile.remove("externalAiConsent");
        context.put("profile", compact(profile, 0, MAX_TEXT));
        context.put("personalEvidence", personalEvidenceService.list(user.id(), null).stream()
                .limit(MAX_PERSONAL_EVIDENCE)
                .map(this::map)
                .map(value -> compact(value, 0, MAX_TEXT))
                .toList());
        context.put("project", compact(map(project), 0, MAX_TEXT));

        TargetResponse target = primaryTarget(project, plan);
        if (target != null) {
            context.put("target", compact(map(target), 0, MAX_TEXT));
        }
        context.put("jobDetails", jobDetails(project));
        if (plan != null) {
            context.put("plan", compact(map(plan), 0, MAX_TEXT));
        }
        if (review != null) {
            context.put("review", compact(map(review), 0, MAX_TEXT));
        }
        context.put("sourcePolicy", Map.of(
                "trusted", true,
                "sourceRefs", "profile, personal-evidence:{id}, decision-project:{id}, job:{id}, action-plan:{id}, weekly-review:{id}",
                "instruction", "只能引用这些已解析的用户资源；缺失信息必须标为不确定，不能补写事实。"
        ));
        return context;
    }

    private TargetResponse primaryTarget(ProjectDetail project, PlanDetail plan) {
        if (plan != null) {
            return project.targets().stream().filter(item -> item.id() == plan.targetId()).findFirst().orElse(null);
        }
        return project.targets().stream().filter(item -> "primary".equals(item.targetType())).findFirst().orElse(null);
    }

    private List<Map<String, Object>> jobDetails(ProjectDetail project) {
        Map<Long, JobSampleResponse> samples = new LinkedHashMap<>();
        for (JobSampleResponse sample : project.jobSamples()) {
            samples.putIfAbsent(sample.jobId(), sample);
            if (samples.size() >= MAX_JOB_DETAILS) break;
        }
        return samples.values().stream().map(sample -> jobDetail(sample, project)).toList();
    }

    private Map<String, Object> jobDetail(JobSampleResponse sample, ProjectDetail project) {
        Map<String, Object> value = new LinkedHashMap<>();
        try {
            JobDetailResponse detail = jobService.detail(sample.jobId());
            value.putAll(map(detail));
        } catch (BusinessException ignored) {
            // A saved sample can outlive an active listing. Keep its trusted snapshot in context.
            value.put("id", sample.jobId());
            value.put("title", sample.title());
            value.put("company", sample.company());
            value.put("location", sample.city());
            value.put("salaryRange", sample.salaryText());
            value.put("requirements", List.of());
            value.put("responsibilities", List.of());
            value.put("inactive", true);
        }
        value.put("candidateId", sample.candidateId());
        value.put("sampleId", sample.id());
        value.put("sampleNote", truncate(sample.note(), MAX_TEXT));
        project.candidates().stream()
                .filter(candidate -> candidate.id() == sample.candidateId())
                .findFirst()
                .ifPresent(candidate -> value.put("candidateName", candidate.name()));
        @SuppressWarnings("unchecked")
        Map<String, Object> compacted = (Map<String, Object>) compact(value, 0, MAX_JOB_TEXT);
        return compacted;
    }

    private Map<String, Object> map(Object value) {
        return objectMapper.convertValue(value, MAP_TYPE);
    }

    private Object compact(Object value, int depth, int maxText) {
        if (value instanceof String string) {
            return truncate(string, maxText);
        }
        if (value instanceof Map<?, ?> values) {
            Map<String, Object> result = new LinkedHashMap<>();
            values.entrySet().stream().limit(MAX_ITEMS).forEach(entry -> {
                if (entry.getKey() != null && entry.getValue() != null) {
                    Object compacted = compact(entry.getValue(), depth + 1, maxText);
                    if (compacted != null) {
                        result.put(String.valueOf(entry.getKey()), compacted);
                    }
                }
            });
            return result;
        }
        if (value instanceof Collection<?> values) {
            Set<Object> result = new LinkedHashSet<>();
            values.stream().filter(java.util.Objects::nonNull)
                    .map(item -> compact(item, depth + 1, maxText))
                    .filter(java.util.Objects::nonNull)
                    .limit(MAX_ITEMS)
                    .forEach(result::add);
            return List.copyOf(result);
        }
        return value;
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength) + "...";
    }
}
