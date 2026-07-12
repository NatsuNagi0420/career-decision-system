package com.careerdecision.backend.decision;

import com.careerdecision.backend.decision.DecisionProjectModels.CandidateRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.CandidateResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.ComparisonRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ComparisonResultResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.ConfidenceFeedbackRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ConfidenceFeedbackResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.CriterionRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.CriterionResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.EvidenceRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.EvidenceResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.JobSampleRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.JobSampleResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectDetail;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectSummary;
import com.careerdecision.backend.decision.DecisionProjectModels.TargetConfirmationRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.TargetResponse;
import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class DecisionProjectService {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };
    private static final TypeReference<List<Long>> LONG_LIST = new TypeReference<>() { };
    private static final List<String> STAGES = List.of("clarify", "evidence", "candidates", "compare", "target");
    private static final Map<String, String> STAGE_STATUS = Map.of(
            "clarify", "clarifying",
            "evidence", "collecting_evidence",
            "candidates", "collecting_candidates",
            "compare", "comparing",
            "target", "ready_to_decide"
    );
    private static final Set<String> SOURCE_TYPES = Set.of("user", "ai", "catalog", "profile", "assessment", "resume", "task_result");
    private static final Set<String> CREDIBILITY = Set.of("low", "medium", "high");
    private static final Set<String> STANCES = Set.of("support", "oppose", "neutral");
    private static final List<DefaultCriterion> DEFAULT_CRITERIA = List.of(
            new DefaultCriterion("interest_values", "兴趣与价值", "兴趣、价值观与工作方式是否契合"),
            new DefaultCriterion("existing_evidence", "已有证据", "现有技能和经历是否提供可验证支持"),
            new DefaultCriterion("learning_cost", "学习成本", "达到入门要求所需时间和资源"),
            new DefaultCriterion("job_demand", "岗位需求", "真实招聘样本体现的需求强度"),
            new DefaultCriterion("regional_opportunity", "地域机会", "目标地区可获得的岗位和发展机会"),
            new DefaultCriterion("income_expectation", "收入预期", "薪资区间与个人预期的匹配程度"),
            new DefaultCriterion("risk", "风险", "不确定性、机会成本和退出难度")
    );

    private final DecisionProjectMapper mapper;
    private final ObjectMapper objectMapper;

    public DecisionProjectService(DecisionProjectMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public List<ProjectSummary> list(long userId) {
        return mapper.listProjects(userId).stream().map(this::summary).toList();
    }

    public ProjectDetail detail(long userId, long projectId) {
        DecisionProjectEntity project = requireProject(userId, projectId);
        List<CriterionResponse> criteria = mapper.findCriteria(projectId).stream()
                .map(row -> new CriterionResponse(
                        row.id(), row.code(), row.name(), row.description(), row.importance(), row.sortOrder(),
                        mapper.findComparisonResults(row.id()).stream().map(this::comparisonResponse).toList()
                )).toList();
        return new ProjectDetail(
                project.getId(), project.getTitle(), project.getQuestion(), project.getDecisionDeadline(),
                project.getBackground(), project.getTriggerReason(), strings(project.getPrioritiesJson()),
                strings(project.getMustHavesJson()), strings(project.getDealBreakersJson()),
                project.getStatus(), project.getCurrentStage(), project.getIsCurrent() != null && project.getIsCurrent() == 1,
                project.getVersion(), mapper.findCandidates(projectId).stream().map(this::candidateResponse).toList(),
                mapper.findJobSamples(projectId).stream().map(this::jobSampleResponse).toList(),
                mapper.findEvidence(projectId).stream().map(this::evidenceResponse).toList(), criteria,
                mapper.findTargets(projectId).stream().map(this::targetResponse).toList(),
                project.getDecidedAt(), project.getCreatedAt(), project.getUpdatedAt()
        );
    }

    @Transactional
    public ProjectDetail create(long userId, ProjectRequest request) {
        mapper.clearCurrent(userId);
        DecisionProjectEntity project = projectEntity(null, userId, request);
        mapper.insertProject(project);
        int sortOrder = 0;
        for (DefaultCriterion criterion : DEFAULT_CRITERIA) {
            mapper.insertCriterion(project.getId(), criterion.code(), criterion.name(), criterion.description(), 3, sortOrder++);
        }
        return detail(userId, project.getId());
    }

    @Transactional
    public ProjectDetail update(long userId, long projectId, ProjectRequest request) {
        requireProject(userId, projectId);
        DecisionProjectEntity project = projectEntity(projectId, userId, request);
        if (mapper.updateProject(project) == 0) projectConflictOrNotFound(userId, projectId);
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail makeCurrent(long userId, long projectId, int expectedVersion) {
        reserveProjectVersion(userId, projectId, expectedVersion);
        mapper.clearCurrentExcept(userId, projectId);
        mapper.markCurrent(userId, projectId);
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail moveStage(long userId, long projectId, String requestedStage, Integer expectedVersion) {
        DecisionProjectEntity project = requireProject(userId, projectId);
        String stage = normalize(requestedStage);
        if (!STAGES.contains(stage)) {
            throw new BusinessException(40051, "Unknown decision project stage: " + requestedStage);
        }
        int current = STAGES.indexOf(project.getCurrentStage());
        int target = STAGES.indexOf(stage);
        if (Math.abs(target - current) > 1) {
            throw new BusinessException(40951, "Decision project stages must be completed in order.");
        }
        if (target >= STAGES.indexOf("compare") && mapper.countCandidates(projectId) < 2) {
            throw new BusinessException(40952, "At least 2 candidates are required before comparison.");
        }
        reserveProjectVersion(userId, projectId, expectedVersion);
        mapper.updateStage(userId, projectId, stage, STAGE_STATUS.get(stage));
        return detail(userId, projectId);
    }

    @Transactional
    public void archive(long userId, long projectId, int expectedVersion) {
        if (mapper.archiveProject(userId, projectId, expectedVersion) == 0) {
            projectConflictOrNotFound(userId, projectId);
        }
    }

    @Transactional
    public ProjectDetail addCandidate(long userId, long projectId, CandidateRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        if (mapper.countCandidates(projectId) >= 5) {
            throw new BusinessException(40953, "A decision project can contain at most 5 candidates.");
        }
        validateDirection(userId, request.directionId());
        DecisionCandidateEntity entity = candidateEntity(null, projectId, request);
        entity.setSortOrder(mapper.nextCandidateSort(projectId));
        try {
            mapper.insertCandidate(entity);
        } catch (DuplicateKeyException ex) {
            throw new BusinessException(40954, "This candidate already exists in the project.");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail updateCandidate(long userId, long projectId, long candidateId, CandidateRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        validateDirection(userId, request.directionId());
        DecisionCandidateEntity entity = candidateEntity(candidateId, projectId, request);
        if (mapper.updateCandidate(entity) == 0) {
            throw new BusinessException(40451, "Decision candidate not found: " + candidateId);
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail removeCandidate(
            long userId, long projectId, long candidateId, Integer expectedVersion
    ) {
        reserveProjectVersion(userId, projectId, expectedVersion);
        if (mapper.excludeCandidate(projectId, candidateId) == 0) {
            throw new BusinessException(40451, "Decision candidate not found or already selected as a target: " + candidateId);
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail addJobSample(long userId, long projectId, JobSampleRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        requireCandidate(projectId, request.candidateId());
        if (mapper.countActiveJob(request.jobId()) == 0) {
            throw new BusinessException(40401, "Job not found: " + request.jobId());
        }
        if (mapper.countJobSample(projectId, request.jobId()) == 0) {
            mapper.insertJobSample(projectId, request.candidateId(), request.jobId(), trim(request.note()));
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail removeJobSample(
            long userId, long projectId, long sampleId, Integer expectedVersion
    ) {
        reserveProjectVersion(userId, projectId, expectedVersion);
        if (mapper.deleteJobSample(projectId, sampleId) == 0) {
            throw new BusinessException(40452, "Project job sample not found: " + sampleId);
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail addEvidence(long userId, long projectId, EvidenceRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        validateEvidenceLinks(userId, projectId, request);
        DecisionEvidenceEntity entity = evidenceEntity(null, projectId, request);
        mapper.insertEvidence(entity);
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail updateEvidence(long userId, long projectId, long evidenceId, EvidenceRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        validateEvidenceLinks(userId, projectId, request);
        DecisionEvidenceEntity entity = evidenceEntity(evidenceId, projectId, request);
        if (mapper.updateEvidence(entity) == 0) {
            throw new BusinessException(40453, "Decision evidence not found: " + evidenceId);
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail hideEvidence(
            long userId, long projectId, long evidenceId, Integer expectedVersion
    ) {
        reserveProjectVersion(userId, projectId, expectedVersion);
        if (mapper.hideEvidence(projectId, evidenceId) == 0) {
            throw new BusinessException(40453, "Decision evidence not found: " + evidenceId);
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail addCriterion(long userId, long projectId, CriterionRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        String code = "custom_" + (mapper.nextCriterionSort(projectId) + 1);
        mapper.insertCriterion(projectId, code, request.name().trim(), trim(request.description()),
                request.importance() == null ? 3 : request.importance(), mapper.nextCriterionSort(projectId));
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail updateCriterion(long userId, long projectId, long criterionId, CriterionRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        if (mapper.updateCriterion(projectId, criterionId, request.name().trim(), trim(request.description()),
                request.importance() == null ? 3 : request.importance()) == 0) {
            throw new BusinessException(40454, "Comparison criterion not found: " + criterionId);
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail removeCriterion(
            long userId, long projectId, long criterionId, Integer expectedVersion
    ) {
        reserveProjectVersion(userId, projectId, expectedVersion);
        if (mapper.deleteCriterion(projectId, criterionId) == 0) {
            throw new BusinessException(40454, "Comparison criterion not found: " + criterionId);
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail saveComparison(long userId, long projectId, long criterionId, ComparisonRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        requireCandidate(projectId, request.candidateId());
        if (mapper.countCriterion(projectId, criterionId) == 0) {
            throw new BusinessException(40454, "Comparison criterion not found: " + criterionId);
        }
        List<Long> evidenceIds = sanitizeIds(request.evidenceIds());
        if (evidenceIds.isEmpty() && isBlank(request.uncertainty()) && isBlank(request.validationAction())) {
            throw new BusinessException(40054,
                    "A comparison must reference evidence or record an uncertainty or validation action.");
        }
        for (Long evidenceId : evidenceIds) {
            if (mapper.countEvidence(projectId, evidenceId) == 0) {
                throw new BusinessException(40453, "Decision evidence not found: " + evidenceId);
            }
        }
        ComparisonResultEntity entity = mapper.findComparisonResult(criterionId, request.candidateId());
        boolean insert = entity == null;
        if (insert) entity = new ComparisonResultEntity();
        entity.setCriterionId(criterionId);
        entity.setCandidateId(request.candidateId());
        entity.setScore(request.score());
        entity.setAssessment(trim(request.assessment()));
        entity.setEvidenceRefsJson(json(evidenceIds));
        entity.setUncertainty(trim(request.uncertainty()));
        entity.setValidationAction(trim(request.validationAction()));
        if (insert) mapper.insertComparisonResult(entity); else mapper.updateComparisonResult(entity);
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail confirmTargets(long userId, long projectId, TargetConfirmationRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        if (!Boolean.TRUE.equals(request.confirmed())) {
            throw new BusinessException(40052, "Target confirmation must be explicitly accepted.");
        }
        int candidateCount = mapper.countCandidates(projectId);
        if (candidateCount < 2 || candidateCount > 5) {
            throw new BusinessException(40955, "Confirming a target requires 2 to 5 active candidates.");
        }
        if (request.backupCandidateId() != null && request.backupCandidateId().equals(request.primaryCandidateId())) {
            throw new BusinessException(40053, "Primary and backup targets must be different.");
        }
        validateDecisionReadiness(projectId);
        DecisionCandidateEntity primary = requireCandidate(projectId, request.primaryCandidateId());
        DecisionCandidateEntity backup = request.backupCandidateId() == null
                ? null : requireCandidate(projectId, request.backupCandidateId());
        mapper.deleteTargets(projectId);
        mapper.insertTarget(targetEntity(userId, projectId, primary, "primary", request));
        if (backup != null) mapper.insertTarget(targetEntity(userId, projectId, backup, "backup", request));
        mapper.markDecided(userId, projectId);
        if (mapper.updateLegacyTarget(userId, primary.getName()) == 0) {
            mapper.insertLegacyTarget(userId, primary.getName());
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ConfidenceFeedbackResponse recordConfidence(
            long userId,
            long projectId,
            long targetId,
            ConfidenceFeedbackRequest request
    ) {
        requireProject(userId, projectId);
        if (mapper.countTarget(userId, projectId, targetId) == 0) {
            throw new BusinessException(40457, "Decision target not found: " + targetId);
        }
        String requestId = request.requestId().trim();
        ConfidenceFeedbackResponse existing = mapper.findConfidenceFeedback(userId, requestId);
        if (existing != null) return existing;
        try {
            mapper.insertConfidenceFeedback(
                    userId, projectId, targetId, normalize(request.trend()), request.reason().trim(), requestId);
        } catch (DuplicateKeyException ex) {
            existing = mapper.findConfidenceFeedback(userId, requestId);
            if (existing == null) {
                throw new BusinessException(40959, "Confidence feedback requestId is already in use.");
            }
            return existing;
        }
        return mapper.findConfidenceFeedback(userId, requestId);
    }

    private void validateDecisionReadiness(long projectId) {
        for (DecisionCandidateEntity candidate : mapper.findCandidates(projectId)) {
            if (mapper.countCandidateEvidence(projectId, candidate.getId()) == 0) {
                throw new BusinessException(40956,
                        "Candidate requires at least one personal or project evidence item: " + candidate.getName());
            }
            if (mapper.countCandidateJobSamples(projectId, candidate.getId()) == 0) {
                throw new BusinessException(40957,
                        "Candidate requires at least one real job sample: " + candidate.getName());
            }
            if (mapper.countCandidateComparisons(projectId, candidate.getId()) == 0) {
                throw new BusinessException(40958,
                        "Candidate requires at least one saved comparison: " + candidate.getName());
            }
        }
    }

    private DecisionProjectEntity requireProject(long userId, long projectId) {
        DecisionProjectEntity project = mapper.findProject(userId, projectId);
        if (project == null) notFound(projectId);
        return project;
    }

    private void reserveProjectVersion(long userId, long projectId, Integer expectedVersion) {
        if (mapper.touchProject(userId, projectId, expectedVersion) == 0) {
            projectConflictOrNotFound(userId, projectId);
        }
    }

    private void projectConflictOrNotFound(long userId, long projectId) {
        if (mapper.findProject(userId, projectId) == null) notFound(projectId);
        throw new BusinessException(40950, "决策项目已在其他设备更新，请刷新后重试：" + projectId);
    }

    private DecisionCandidateEntity requireCandidate(long projectId, long candidateId) {
        DecisionCandidateEntity candidate = mapper.findCandidate(projectId, candidateId);
        if (candidate == null) throw new BusinessException(40451, "Decision candidate not found: " + candidateId);
        return candidate;
    }

    private void validateDirection(long userId, Long directionId) {
        if (directionId != null && mapper.countDirection(userId, directionId) == 0) {
            throw new BusinessException(40450, "Career direction not found: " + directionId);
        }
    }

    private void validateEvidenceLinks(long userId, long projectId, EvidenceRequest request) {
        if (request.candidateId() != null) requireCandidate(projectId, request.candidateId());
        if (request.personalEvidenceId() != null
                && mapper.countPersonalEvidence(userId, request.personalEvidenceId()) == 0) {
            throw new BusinessException(40455, "Personal evidence not found: " + request.personalEvidenceId());
        }
    }

    private DecisionProjectEntity projectEntity(Long id, long userId, ProjectRequest request) {
        DecisionProjectEntity entity = new DecisionProjectEntity();
        entity.setId(id);
        entity.setUserId(userId);
        entity.setTitle(request.title().trim());
        entity.setQuestion(request.question().trim());
        entity.setDecisionDeadline(request.decisionDeadline());
        entity.setBackground(trim(request.background()));
        entity.setTriggerReason(trim(request.triggerReason()));
        entity.setPrioritiesJson(json(sanitize(request.priorities())));
        entity.setMustHavesJson(json(sanitize(request.mustHaves())));
        entity.setDealBreakersJson(json(sanitize(request.dealBreakers())));
        entity.setVersion(request.expectedVersion());
        return entity;
    }

    private DecisionCandidateEntity candidateEntity(Long id, long projectId, CandidateRequest request) {
        DecisionCandidateEntity entity = new DecisionCandidateEntity();
        entity.setId(id);
        entity.setProjectId(projectId);
        entity.setDirectionId(request.directionId());
        entity.setName(request.name().trim());
        String sourceType = normalize(request.sourceType());
        entity.setSourceType(SOURCE_TYPES.contains(sourceType) ? sourceType : "user");
        entity.setRecommendationReason(trim(request.recommendationReason()));
        entity.setOpposingFactors(trim(request.opposingFactors()));
        entity.setUncertainties(trim(request.uncertainties()));
        entity.setValidationActionsJson(json(sanitize(request.validationActions())));
        return entity;
    }

    private DecisionEvidenceEntity evidenceEntity(Long id, long projectId, EvidenceRequest request) {
        DecisionEvidenceEntity entity = new DecisionEvidenceEntity();
        entity.setId(id);
        entity.setProjectId(projectId);
        entity.setCandidateId(request.candidateId());
        entity.setPersonalEvidenceId(request.personalEvidenceId());
        entity.setTitle(request.title().trim());
        entity.setDetail(trim(request.detail()));
        String sourceType = normalize(request.sourceType());
        entity.setSourceType(SOURCE_TYPES.contains(sourceType) ? sourceType : "user");
        entity.setSourceRef(trim(request.sourceRef()));
        String credibility = normalize(request.credibility());
        entity.setCredibility(CREDIBILITY.contains(credibility) ? credibility : "medium");
        String stance = normalize(request.stance());
        entity.setStance(STANCES.contains(stance) ? stance : "neutral");
        return entity;
    }

    private DecisionTargetEntity targetEntity(
            long userId, long projectId, DecisionCandidateEntity candidate,
            String type, TargetConfirmationRequest request
    ) {
        DecisionTargetEntity entity = new DecisionTargetEntity();
        entity.setUserId(userId);
        entity.setProjectId(projectId);
        entity.setCandidateId(candidate.getId());
        entity.setTargetType(type);
        entity.setTargetName(candidate.getName());
        entity.setDecisionReason(request.decisionReason().trim());
        entity.setMainRisks(trim(request.mainRisks()));
        entity.setReviewDate(request.reviewDate());
        return entity;
    }

    private ProjectSummary summary(DecisionProjectEntity entity) {
        return new ProjectSummary(
                entity.getId(), entity.getTitle(), entity.getQuestion(), entity.getStatus(), entity.getCurrentStage(),
                entity.getIsCurrent() != null && entity.getIsCurrent() == 1,
                entity.getVersion(),
                value(entity.getCandidateCount()), value(entity.getJobSampleCount()), entity.getPrimaryTarget(),
                entity.getDecisionDeadline(), entity.getCreatedAt(), entity.getUpdatedAt()
        );
    }

    private CandidateResponse candidateResponse(DecisionCandidateEntity entity) {
        return new CandidateResponse(
                entity.getId(), entity.getDirectionId(), entity.getName(), entity.getSourceType(),
                entity.getRecommendationReason(), entity.getOpposingFactors(), entity.getUncertainties(),
                strings(entity.getValidationActionsJson()), entity.getSortOrder(), entity.getUpdatedAt()
        );
    }

    private JobSampleResponse jobSampleResponse(DecisionJobSampleRow row) {
        return new JobSampleResponse(
                row.id(), row.candidateId(), row.jobId(), row.title(), row.company(), row.city(),
                row.salaryText(), row.note(), row.createdAt()
        );
    }

    private EvidenceResponse evidenceResponse(DecisionEvidenceEntity entity) {
        return new EvidenceResponse(
                entity.getId(), entity.getCandidateId(), entity.getPersonalEvidenceId(), entity.getTitle(),
                entity.getDetail(), entity.getSourceType(), entity.getSourceRef(), entity.getCredibility(),
                entity.getStance(), entity.getUpdatedAt()
        );
    }

    private ComparisonResultResponse comparisonResponse(ComparisonResultEntity entity) {
        return new ComparisonResultResponse(
                entity.getId(), entity.getCandidateId(), entity.getScore(), entity.getAssessment(),
                longs(entity.getEvidenceRefsJson()), entity.getUncertainty(), entity.getValidationAction(),
                entity.getUpdatedAt()
        );
    }

    private TargetResponse targetResponse(DecisionTargetEntity entity) {
        return new TargetResponse(
                entity.getId(), entity.getCandidateId(), entity.getTargetType(), entity.getTargetName(),
                entity.getDecisionReason(), entity.getMainRisks(), entity.getReviewDate(), entity.getConfirmedAt()
        );
    }

    private List<String> sanitize(Collection<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && !value.isBlank())
                .map(String::trim).distinct().toList();
    }

    private List<Long> sanitizeIds(Collection<Long> values) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && value > 0).distinct().toList();
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50051, "Failed to serialize decision project data.");
        }
    }

    private List<String> strings(String value) {
        return readList(value, STRING_LIST);
    }

    private List<Long> longs(String value) {
        return readList(value, LONG_LIST);
    }

    private <T> List<T> readList(String value, TypeReference<List<T>> type) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }

    private int value(Integer value) { return value == null ? 0 : value; }
    private String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private boolean isBlank(String value) { return value == null || value.isBlank(); }
    private String normalize(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }
    private void notFound(long projectId) { throw new BusinessException(40456, "Decision project not found: " + projectId); }

    private record DefaultCriterion(String code, String name, String description) { }
}
