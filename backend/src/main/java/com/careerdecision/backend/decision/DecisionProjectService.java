package com.careerdecision.backend.decision;

import com.careerdecision.backend.decision.DecisionProjectModels.CandidateRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.CandidateJourney;
import com.careerdecision.backend.decision.DecisionProjectModels.CandidateResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.BatchComparisonItemRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.BatchComparisonRequest;
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
import com.careerdecision.backend.decision.DecisionProjectModels.JourneyResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.JourneyStage;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectDetail;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectSummary;
import com.careerdecision.backend.decision.DecisionProjectModels.TargetConfirmationRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.TargetResponse;
import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.evidence.PersonalEvidenceEntity;
import com.careerdecision.backend.evidence.PersonalEvidenceMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
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
    private static final List<String> JOURNEY_STAGES = List.of("brief", "candidates", "validate", "compare", "commit");
    private static final Map<String, String> JOURNEY_STAGE_STATUS = Map.of(
            "brief", "draft",
            "candidates", "exploring",
            "validate", "exploring",
            "compare", "exploring",
            "commit", "exploring"
    );
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
    private final PersonalEvidenceMapper personalEvidenceMapper;
    private final ObjectMapper objectMapper;

    public DecisionProjectService(
            DecisionProjectMapper mapper,
            PersonalEvidenceMapper personalEvidenceMapper,
            ObjectMapper objectMapper
    ) {
        this.mapper = mapper;
        this.personalEvidenceMapper = personalEvidenceMapper;
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
                        row.criterionKind(), row.sourceType(),
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
                value(project.getFlowVersion()), project.getComparisonReviewedAt(),
                project.getDecidedAt(), project.getCreatedAt(), project.getUpdatedAt()
        );
    }

    @Transactional
    public ProjectDetail create(long userId, ProjectRequest request) {
        mapper.clearCurrent(userId);
        DecisionProjectEntity project = projectEntity(null, userId, request);
        mapper.insertProject(project);
        replaceCriteria(project.getId(), request);
        Set<String> initialNames = new HashSet<>();
        if (request.initialCandidates() != null) {
            for (DecisionProjectModels.InitialCandidateRequest initial : request.initialCandidates()) {
                String name = initial.name().trim();
                if (!initialNames.add(name.toLowerCase(Locale.ROOT))) continue;
                Long directionId = initial.directionId() == null
                        ? mapper.findDirectionIdByName(userId, name) : initial.directionId();
                validateDirection(userId, directionId);
                DecisionCandidateEntity candidate = new DecisionCandidateEntity();
                candidate.setProjectId(project.getId());
                candidate.setDirectionId(directionId);
                candidate.setName(name);
                String sourceType = normalize(initial.sourceType());
                candidate.setSourceType(SOURCE_TYPES.contains(sourceType) ? sourceType : "user");
                candidate.setValidationActionsJson("[]");
                candidate.setSortOrder(mapper.nextCandidateSort(project.getId()));
                mapper.insertCandidate(candidate);
            }
        }
        return detail(userId, project.getId());
    }

    @Transactional
    public ProjectDetail update(long userId, long projectId, ProjectRequest request) {
        DecisionProjectEntity existing = requireProject(userId, projectId);
        boolean criteriaChanged = !strings(existing.getPrioritiesJson()).equals(sanitize(request.priorities()))
                || !strings(existing.getMustHavesJson()).equals(sanitize(request.mustHaves()))
                || !strings(existing.getDealBreakersJson()).equals(sanitize(request.dealBreakers()));
        DecisionProjectEntity project = projectEntity(projectId, userId, request);
        if (mapper.updateProject(project) == 0) projectConflictOrNotFound(userId, projectId);
        if (criteriaChanged && existing.getComparisonReviewedAt() == null) {
            replaceCriteria(projectId, request);
        }
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
        if (JOURNEY_STAGES.contains(stage)) {
            int current = JOURNEY_STAGES.indexOf(journeyStage(project.getCurrentStage()));
            int target = JOURNEY_STAGES.indexOf(stage);
            if (Math.abs(target - current) > 1) {
                throw new BusinessException(40951, "请先完成当前这一步，再继续往下看看。");
            }
            if (target >= JOURNEY_STAGES.indexOf("candidates") && !briefComplete(project)) {
                throw new BusinessException(40968, "先补充想弄清楚的问题、时间和至少一件在意的事情。");
            }
            if (target >= JOURNEY_STAGES.indexOf("validate") && mapper.countCandidates(projectId) < 2) {
                throw new BusinessException(40952, "先选择两个正在考虑的方向，再继续了解。");
            }
            if (target >= JOURNEY_STAGES.indexOf("commit") && project.getComparisonReviewedAt() == null) {
                throw new BusinessException(40965, "请先看完方向之间的比较，再决定下一步先试什么。");
            }
            reserveProjectVersion(userId, projectId, expectedVersion);
            mapper.updateStage(userId, projectId, stage, JOURNEY_STAGE_STATUS.get(stage));
            return detail(userId, projectId);
        }
        if (!STAGES.contains(stage) || value(project.getFlowVersion()) >= 2) {
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
            throw new BusinessException(40953, "一次最多放入 5 个方向，可以先移除一个再添加。");
        }
        validateDirection(userId, request.directionId());
        DecisionCandidateEntity entity = candidateEntity(null, projectId, request);
        entity.setSortOrder(mapper.nextCandidateSort(projectId));
        try {
            mapper.insertCandidate(entity);
        } catch (DuplicateKeyException ex) {
            throw new BusinessException(40954, "这个方向已经在这次思考里了。");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail updateCandidate(long userId, long projectId, long candidateId, CandidateRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        validateDirection(userId, request.directionId());
        DecisionCandidateEntity entity = candidateEntity(candidateId, projectId, request);
        if (mapper.updateCandidate(entity) == 0) {
            throw new BusinessException(40451, "没有找到这个方向，请重新加载后再试一次。");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail removeCandidate(
            long userId, long projectId, long candidateId, String reason, Integer expectedVersion
    ) {
        reserveProjectVersion(userId, projectId, expectedVersion);
        String exclusionReason = isBlank(reason) ? "暂时不再考虑这个方向" : reason.trim();
        if (mapper.excludeCandidate(projectId, candidateId, exclusionReason) == 0) {
            throw new BusinessException(40451, "这个方向已经不在列表中，或者正在作为当前选择使用。");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail addJobSample(long userId, long projectId, JobSampleRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        requireCandidate(projectId, request.candidateId());
        if (mapper.countActiveJob(request.jobId()) == 0) {
            throw new BusinessException(40401, "这份岗位已经找不到了，可以换一份再看看。");
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
            throw new BusinessException(40452, "这份岗位已经不在当前页面，请重新加载后再试一次。");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail addEvidence(long userId, long projectId, EvidenceRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        validateEvidenceLinks(userId, projectId, request);
        DecisionEvidenceEntity entity = evidenceEntity(null, projectId, request);
        if (Boolean.TRUE.equals(request.syncToProfile()) && request.personalEvidenceId() == null) {
            PersonalEvidenceEntity personal = new PersonalEvidenceEntity();
            personal.setUserId(userId);
            personal.setEvidenceType("project");
            personal.setTitle(request.title().trim());
            personal.setDescription(trim(request.detail()));
            personal.setRoleName(request.candidateId() == null
                    ? null : requireCandidate(projectId, request.candidateId()).getName());
            personal.setSourceType("user");
            personal.setSourceRefType("decision_project");
            personal.setSourceRefId(projectId);
            String credibility = normalize(request.credibility());
            personal.setCredibility(CREDIBILITY.contains(credibility) ? credibility : "medium");
            personalEvidenceMapper.insert(personal);
            entity.setPersonalEvidenceId(personal.getId());
        }
        mapper.insertEvidence(entity);
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail updateEvidence(long userId, long projectId, long evidenceId, EvidenceRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        validateEvidenceLinks(userId, projectId, request);
        DecisionEvidenceEntity entity = evidenceEntity(evidenceId, projectId, request);
        if (mapper.updateEvidence(entity) == 0) {
            throw new BusinessException(40453, "这段经历或信息已经不在当前页面，请重新加载后再试一次。");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail hideEvidence(
            long userId, long projectId, long evidenceId, Integer expectedVersion
    ) {
        reserveProjectVersion(userId, projectId, expectedVersion);
        if (mapper.hideEvidence(projectId, evidenceId) == 0) {
            throw new BusinessException(40453, "这段经历或信息已经不在当前页面，请重新加载后再试一次。");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail addCriterion(long userId, long projectId, CriterionRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        String code = "custom_" + (mapper.nextCriterionSort(projectId) + 1);
        mapper.insertCriterion(projectId, code, request.name().trim(), trim(request.description()),
                "priority", "user", request.importance() == null ? 3 : request.importance(),
                mapper.nextCriterionSort(projectId));
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail updateCriterion(long userId, long projectId, long criterionId, CriterionRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        if (mapper.updateCriterion(projectId, criterionId, request.name().trim(), trim(request.description()),
                request.importance() == null ? 3 : request.importance()) == 0) {
            throw new BusinessException(40454, "这项对照内容已经发生变化，请重新加载后再试一次。");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail removeCriterion(
            long userId, long projectId, long criterionId, Integer expectedVersion
    ) {
        reserveProjectVersion(userId, projectId, expectedVersion);
        if (mapper.deleteCriterion(projectId, criterionId) == 0) {
            throw new BusinessException(40454, "这项对照内容已经发生变化，请重新加载后再试一次。");
        }
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail saveComparison(long userId, long projectId, long criterionId, ComparisonRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        requireCandidate(projectId, request.candidateId());
        if (mapper.countCriterion(projectId, criterionId) == 0) {
            throw new BusinessException(40454, "这项对照内容已经发生变化，请重新加载后再试一次。");
        }
        List<Long> evidenceIds = sanitizeIds(request.evidenceIds());
        if (evidenceIds.isEmpty() && isBlank(request.uncertainty()) && isBlank(request.validationAction())) {
            throw new BusinessException(40054,
                    "A comparison must reference evidence or record an uncertainty or validation action.");
        }
        for (Long evidenceId : evidenceIds) {
            if (mapper.countEvidence(projectId, evidenceId) == 0) {
                throw new BusinessException(40453, "你引用的一段经历已经发生变化，请重新选择。");
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
        entity.setVerdict(verdictFromScore(request.score()));
        entity.setConfirmedAt(LocalDateTime.now());
        if (insert) mapper.insertComparisonResult(entity); else mapper.updateComparisonResult(entity);
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail saveComparisons(long userId, long projectId, BatchComparisonRequest request) {
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        List<ComparisonResultEntity> entities = new ArrayList<>();
        Set<String> pairs = new HashSet<>();
        Map<Long, ComparisonCriterionRow> criteria = mapper.findCriteria(projectId).stream()
                .collect(java.util.stream.Collectors.toMap(ComparisonCriterionRow::id, item -> item));
        for (BatchComparisonItemRequest item : request.results()) {
            requireCandidate(projectId, item.candidateId());
            ComparisonCriterionRow criterion = criteria.get(item.criterionId());
            if (criterion == null) {
                throw new BusinessException(40454, "这项对照内容已经发生变化，请重新加载后再试一次。");
            }
            String pair = item.criterionId() + ":" + item.candidateId();
            if (!pairs.add(pair)) {
                throw new BusinessException(40055, "同一个方向的同一项内容出现了两次，请重新加载后再保存。");
            }
            List<Long> evidenceIds = sanitizeIds(item.evidenceIds());
            if (evidenceIds.isEmpty() && isBlank(item.assessment())
                    && isBlank(item.uncertainty()) && isBlank(item.validationAction())) {
                throw new BusinessException(40054,
                        "请补充一条参考信息，或记录目前还不清楚的地方。");
            }
            for (Long evidenceId : evidenceIds) {
                if (mapper.countEvidence(projectId, evidenceId) == 0) {
                    throw new BusinessException(40453, "你引用的一段经历已经发生变化，请重新选择。");
                }
            }
            ComparisonResultEntity entity = mapper.findComparisonResult(item.criterionId(), item.candidateId());
            if (entity == null) entity = new ComparisonResultEntity();
            entity.setCriterionId(item.criterionId());
            entity.setCandidateId(item.candidateId());
            entity.setScore(null);
            String verdict = normalize(item.verdict());
            if (!verdictAllowed(criterion.criterionKind(), verdict)) {
                throw new BusinessException(40056, "“" + criterion.name() + "”的选择不适用于这类内容，请重新选择。");
            }
            entity.setVerdict(verdict);
            entity.setAssessment(trim(item.assessment()));
            entity.setEvidenceRefsJson(json(evidenceIds));
            entity.setUncertainty(trim(item.uncertainty()));
            entity.setValidationAction(trim(item.validationAction()));
            entity.setConfirmedAt(Boolean.FALSE.equals(item.confirmed()) ? null : LocalDateTime.now());
            entities.add(entity);
        }
        for (ComparisonResultEntity entity : entities) {
            if (entity.getId() == null) mapper.insertComparisonResult(entity);
            else mapper.updateComparisonResult(entity);
        }
        mapper.markComparisonsReviewed(projectId);
        return detail(userId, projectId);
    }

    @Transactional
    public ProjectDetail confirmTargets(long userId, long projectId, TargetConfirmationRequest request) {
        DecisionProjectEntity project = requireProject(userId, projectId);
        reserveProjectVersion(userId, projectId, request.expectedVersion());
        if (!Boolean.TRUE.equals(request.confirmed())) {
            throw new BusinessException(40052, "请先确认这是你目前愿意尝试的方向。");
        }
        if (value(project.getFlowVersion()) >= 2 && !briefComplete(project)) {
            throw new BusinessException(40968, "先补充想弄清楚的问题、时间和至少一件在意的事情。");
        }
        int candidateCount = mapper.countCandidates(projectId);
        if (candidateCount < 2 || candidateCount > 5) {
            throw new BusinessException(40955, "先放入 2～5 个方向，再决定下一步想试什么。");
        }
        if (request.backupCandidateId() != null && request.backupCandidateId().equals(request.primaryCandidateId())) {
            throw new BusinessException(40053, "目前想先试的方向和备选方向需要不同。");
        }
        List<DecisionTargetEntity> existingTargets = mapper.findTargets(projectId);
        DecisionTargetEntity existingPrimary = existingTargets.stream()
                .filter(target -> "primary".equals(target.getTargetType()))
                .findFirst().orElse(null);
        DecisionTargetEntity existingBackup = existingTargets.stream()
                .filter(target -> "backup".equals(target.getTargetType()))
                .findFirst().orElse(null);
        boolean primaryChanged = existingPrimary != null
                && !existingPrimary.getCandidateId().equals(request.primaryCandidateId());
        String verificationStatus = normalize(request.verificationStatus());
        boolean legacyConfirmation = verificationStatus.isEmpty();
        if (legacyConfirmation && value(project.getFlowVersion()) >= 2) {
            throw new BusinessException(40057, "请选择“目前想先试试”或“已经比较了解”，再确认这次选择。");
        }
        if (legacyConfirmation) {
            validateDecisionReadiness(projectId);
            verificationStatus = "provisional";
        } else {
            if (request.reviewDate() == null) {
                throw new BusinessException(40056, "请设置一个之后回来看看结果的日期。");
            }
            if (project.getComparisonReviewedAt() == null) {
                throw new BusinessException(40965, "请先看完方向之间的比较，再决定下一步先试什么。");
            }
            if (primaryChanged) {
                verificationStatus = "provisional";
            } else if ("verified".equals(verificationStatus)) {
                if (request.backupCandidateId() == null) {
                    throw new BusinessException(40966, "想保存为已经比较了解，还需要选择一个备选方向。");
                }
                validateVerifiedTarget(projectId, request.primaryCandidateId(), request.backupCandidateId());
            }
        }
        DecisionCandidateEntity primary = requireCandidate(projectId, request.primaryCandidateId());
        DecisionCandidateEntity backup = request.backupCandidateId() == null
                ? null : requireCandidate(projectId, request.backupCandidateId());
        if (primaryChanged) {
            mapper.archiveAndDetachProjectPlans(projectId);
            mapper.deleteTargets(projectId);
            existingPrimary = null;
            existingBackup = null;
        }
        saveTarget(existingPrimary, targetEntity(userId, projectId, primary, "primary", verificationStatus, request));
        if (backup == null && existingBackup != null) mapper.deleteTarget(projectId, existingBackup.getId());
        else if (backup != null) {
            saveTarget(existingBackup, targetEntity(userId, projectId, backup, "backup", verificationStatus, request));
        }
        if (legacyConfirmation) mapper.markDecided(userId, projectId);
        else mapper.markOutcome(userId, projectId, verificationStatus);
        if (mapper.updateLegacyTarget(userId, primary.getName()) == 0) {
            mapper.insertLegacyTarget(userId, primary.getName());
        }
        return detail(userId, projectId);
    }

    private void saveTarget(DecisionTargetEntity existing, DecisionTargetEntity target) {
        if (existing == null) {
            mapper.insertTarget(target);
            return;
        }
        target.setId(existing.getId());
        if (mapper.updateTarget(target) == 0) {
            throw new BusinessException(40967, "这次选择已经发生变化，请重新加载后再试一次。");
        }
    }

    public JourneyResponse journey(long userId, long projectId) {
        DecisionProjectEntity project = requireProject(userId, projectId);
        List<DecisionCandidateEntity> candidateEntities = mapper.findCandidates(projectId);
        List<CandidateJourney> candidates = candidateEntities.stream().map(candidate -> {
            int evidence = mapper.countCandidateEvidence(projectId, candidate.getId());
            int jobs = mapper.countCandidateJobSamples(projectId, candidate.getId());
            int comparisons = mapper.countCandidateComparisons(projectId, candidate.getId());
            boolean hasOpenQuestion = !isBlank(candidate.getUncertainties())
                    && !strings(candidate.getValidationActionsJson()).isEmpty();
            List<String> remaining = new ArrayList<>();
            if (evidence == 0 && !hasOpenQuestion) {
                remaining.add("可以补充一条相关经历，或记下还不清楚的地方和了解方法");
            }
            if (jobs == 0) remaining.add("还可以看看一个真实岗位");
            String state = remaining.isEmpty() ? "validated"
                    : (evidence + jobs > 0 || hasOpenQuestion ? "partial" : "unverified");
            return new CandidateJourney(candidate.getId(), state, evidence, jobs, comparisons, remaining);
        }).toList();

        boolean briefComplete = briefComplete(project);
        boolean candidatesComplete = candidateEntities.size() >= 2;
        boolean validateComplete = candidatesComplete && candidates.stream()
                .allMatch(candidate -> "validated".equals(candidate.state()));
        boolean compareComplete = project.getComparisonReviewedAt() != null;
        boolean commitComplete = !mapper.findTargets(projectId).isEmpty();
        long verifiedCandidateCount = candidateEntities.stream().filter(candidate ->
                candidateReadyForVerification(projectId, candidate.getId())
        ).count();
        boolean canSaveProvisional = briefComplete && candidatesComplete && compareComplete;
        boolean canVerify = canSaveProvisional && verifiedCandidateCount >= 2;

        List<JourneyStage> stages = List.of(
                stage("brief", true, briefComplete,
                        briefComplete ? List.of() : List.of("说说你想弄清楚什么、时间和最在意的事情")),
                stage("candidates", briefComplete, candidatesComplete,
                        candidatesComplete ? List.of() : List.of("先选择两个正在考虑的方向")),
                stage("validate", candidatesComplete, validateComplete,
                        validateComplete ? List.of() : List.of("为每个方向看看经历和真实岗位")),
                stage("compare", candidatesComplete, compareComplete,
                        compareComplete ? List.of() : List.of("把几个方向放在一起看一遍")),
                stage("commit", compareComplete, commitComplete,
                        commitComplete ? List.of() : List.of("选择目前更想先试试的方向"))
        );
        List<String> nextSteps = stages.stream().filter(item -> !item.complete() && item.ready())
                .findFirst().map(JourneyStage::remainingItems).orElse(List.of());
        return new JourneyResponse(projectId, journeyStage(project.getCurrentStage()), project.getStatus(),
                canSaveProvisional, canVerify, stages, candidates, nextSteps);
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

    private void validateVerifiedTarget(long projectId, long primaryCandidateId, long backupCandidateId) {
        for (long candidateId : List.of(primaryCandidateId, backupCandidateId)) {
            DecisionCandidateEntity candidate = requireCandidate(projectId, candidateId);
            if (mapper.countCredibleCandidateEvidence(projectId, candidateId) == 0) {
                throw new BusinessException(40956,
                        "“" + candidate.getName() + "”还可以补充一条比较可靠的相关经历。");
            }
            if (mapper.countCandidateJobSamples(projectId, candidateId) == 0) {
                throw new BusinessException(40957,
                        "“" + candidate.getName() + "”还可以先看看一个真实岗位。");
            }
            if (!criteriaReadyForVerification(projectId, candidateId)) {
                throw new BusinessException(40958,
                        "“" + candidate.getName() + "”还有几项重要内容没有看清楚。");
            }
        }
    }

    private boolean candidateReadyForVerification(long projectId, long candidateId) {
        return mapper.countCredibleCandidateEvidence(projectId, candidateId) > 0
                && mapper.countCandidateJobSamples(projectId, candidateId) > 0
                && criteriaReadyForVerification(projectId, candidateId);
    }

    private boolean criteriaReadyForVerification(long projectId, long candidateId) {
        List<ComparisonCriterionRow> criteria = mapper.findCriteria(projectId);
        for (ComparisonCriterionRow criterion : criteria) {
            String kind = normalize(criterion.criterionKind());
            if (!"must_have".equals(kind) && !"deal_breaker".equals(kind)) continue;
            ComparisonResultEntity result = mapper.findComparisonResult(criterion.id(), candidateId);
            if (!confirmed(result)) return false;
            if ("must_have".equals(kind) && !"meets".equals(result.getVerdict())) return false;
            if ("deal_breaker".equals(kind) && !"not_found".equals(result.getVerdict())) return false;
        }
        List<ComparisonCriterionRow> priorities = criteria.stream()
                .filter(criterion -> {
                    String kind = normalize(criterion.criterionKind());
                    return "priority".equals(kind) && "brief".equals(normalize(criterion.sourceType()));
                })
                .sorted(java.util.Comparator
                        .comparingInt((ComparisonCriterionRow criterion) -> value(criterion.importance())).reversed()
                        .thenComparingInt(criterion -> value(criterion.sortOrder())))
                .limit(3)
                .toList();
        if (priorities.isEmpty()) return false;
        return priorities.stream().allMatch(criterion -> {
            ComparisonResultEntity result = mapper.findComparisonResult(criterion.id(), candidateId);
            return confirmed(result) && !"unknown".equals(result.getVerdict());
        });
    }

    private boolean confirmed(ComparisonResultEntity result) {
        return result != null && result.getConfirmedAt() != null && !isBlank(result.getVerdict());
    }

    private boolean verdictAllowed(String criterionKind, String verdict) {
        return switch (normalize(criterionKind)) {
            case "must_have" -> Set.of("meets", "partial", "does_not_meet", "unknown").contains(verdict);
            case "deal_breaker" -> Set.of("not_found", "needs_attention", "present", "unknown").contains(verdict);
            default -> Set.of("good_fit", "trade_off", "poor_fit", "unknown").contains(verdict);
        };
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
        throw new BusinessException(40950, "这次思考已在其他设备更新。你填写的内容仍然保留着，请重新加载后再试一次。");
    }

    private DecisionCandidateEntity requireCandidate(long projectId, long candidateId) {
        DecisionCandidateEntity candidate = mapper.findCandidate(projectId, candidateId);
        if (candidate == null) throw new BusinessException(40451, "没有找到这个方向，请重新加载后再试一次。");
        return candidate;
    }

    private void validateDirection(long userId, Long directionId) {
        if (directionId != null && mapper.countDirection(userId, directionId) == 0) {
            throw new BusinessException(40450, "这个职业方向暂时找不到，可以把它作为自己的方向继续添加。");
        }
    }

    private void validateEvidenceLinks(long userId, long projectId, EvidenceRequest request) {
        if (request.candidateId() != null) requireCandidate(projectId, request.candidateId());
        if (request.personalEvidenceId() != null
                && mapper.countPersonalEvidence(userId, request.personalEvidenceId()) == 0) {
            throw new BusinessException(40455, "这段个人经历已经找不到了，请重新选择。");
        }
    }

    private DecisionProjectEntity projectEntity(Long id, long userId, ProjectRequest request) {
        DecisionProjectEntity entity = new DecisionProjectEntity();
        entity.setId(id);
        entity.setUserId(userId);
        String question = request.question().trim();
        entity.setTitle(isBlank(request.title()) ? suggestedTitle(question) : request.title().trim());
        entity.setQuestion(question);
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
            String type, String verificationStatus, TargetConfirmationRequest request
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
        entity.setVerificationStatus(verificationStatus);
        entity.setVerifiedAt("verified".equals(verificationStatus) ? LocalDateTime.now() : null);
        entity.setOverrideReason(trim(request.overrideReason()));
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
                row.salaryText(), row.note(), row.reviewedAt(), row.createdAt()
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
                entity.getVerdict(), entity.getConfirmedAt(),
                entity.getUpdatedAt()
        );
    }

    private TargetResponse targetResponse(DecisionTargetEntity entity) {
        return new TargetResponse(
                entity.getId(), entity.getCandidateId(), entity.getTargetType(), entity.getTargetName(),
                entity.getDecisionReason(), entity.getMainRisks(), entity.getReviewDate(),
                entity.getVerificationStatus(), entity.getVerifiedAt(), entity.getOverrideReason(),
                entity.getConfirmedAt()
        );
    }

    private JourneyStage stage(String code, boolean ready, boolean complete, List<String> remainingItems) {
        return new JourneyStage(code, ready, complete, remainingItems);
    }

    private boolean briefComplete(DecisionProjectEntity project) {
        return !isBlank(project.getQuestion())
                && project.getDecisionDeadline() != null
                && !strings(project.getPrioritiesJson()).isEmpty();
    }

    private String journeyStage(String stage) {
        return switch (stage == null ? "" : stage) {
            case "clarify", "brief" -> "brief";
            case "candidates" -> "candidates";
            case "evidence", "validate" -> "validate";
            case "compare" -> "compare";
            case "target", "commit" -> "commit";
            default -> "brief";
        };
    }

    private String verdictFromScore(Integer score) {
        if (score == null) return "unknown";
        if (score >= 4) return "meets";
        if (score == 3) return "partial";
        return "does_not_meet";
    }

    private String suggestedTitle(String question) {
        String title = question.replaceAll("[？?。！!]+$", "").trim();
        if (title.length() <= 36) return title;
        return title.substring(0, 36) + "…";
    }

    private List<CriterionSeed> initialCriteria(ProjectRequest request) {
        List<CriterionSeed> criteria = new ArrayList<>();
        criteria.add(new CriterionSeed("overall_assessment", "整体感受",
                "把现在知道的内容放在一起，记录你对这个方向的整体感觉。",
                "priority", "system", 5));
        int index = 1;
        for (String value : sanitize(request.mustHaves())) {
            criteria.add(new CriterionSeed("must_have_" + index++, value,
                    "这是你希望每个方向都能满足的事情。", "must_have", "brief", 5));
        }
        index = 1;
        for (String value : sanitize(request.dealBreakers())) {
            criteria.add(new CriterionSeed("deal_breaker_" + index++, value,
                    "这是你希望提前留意、尽量避开的情况。", "deal_breaker", "brief", 5));
        }
        index = 1;
        for (String value : sanitize(request.priorities())) {
            criteria.add(new CriterionSeed("priority_" + index, value,
                    "这是你选择方向时比较在意的事情。", "priority", "brief", Math.max(2, 6 - index)));
            index++;
        }
        Set<String> names = criteria.stream().map(item -> item.name().toLowerCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toSet());
        for (DefaultCriterion fallback : DEFAULT_CRITERIA) {
            if (criteria.size() >= 7) break;
            if (!names.add(fallback.name().toLowerCase(Locale.ROOT))) continue;
            criteria.add(new CriterionSeed(fallback.code(), fallback.name(), fallback.description(),
                    "priority", "system", 3));
        }
        return List.copyOf(criteria);
    }

    private void replaceCriteria(long projectId, ProjectRequest request) {
        mapper.deleteCriteria(projectId);
        int sortOrder = 0;
        for (CriterionSeed criterion : initialCriteria(request)) {
            mapper.insertCriterion(projectId, criterion.code(), criterion.name(), criterion.description(),
                    criterion.kind(), criterion.sourceType(), criterion.importance(), sortOrder++);
        }
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
    private void notFound(long projectId) { throw new BusinessException(40456, "没有找到这次思考，它可能已经被收起了。"); }

    private record DefaultCriterion(String code, String name, String description) { }
    private record CriterionSeed(
            String code,
            String name,
            String description,
            String kind,
            String sourceType,
            int importance
    ) { }
}
