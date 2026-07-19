package com.careerdecision.backend.action;

import com.careerdecision.backend.action.ActionPlanEntities.PlanEntity;
import com.careerdecision.backend.action.ActionPlanEntities.TargetRow;
import com.careerdecision.backend.action.ActionPlanEntities.TaskEntity;
import com.careerdecision.backend.action.ActionPlanEntities.TaskResultRow;
import com.careerdecision.backend.action.ActionPlanEntities.WeekEntity;
import com.careerdecision.backend.action.ActionPlanModels.GenerateRequest;
import com.careerdecision.backend.action.ActionPlanModels.ConfirmPreviewRequest;
import com.careerdecision.backend.action.ActionPlanModels.PlanDetail;
import com.careerdecision.backend.action.ActionPlanModels.PlanEvidenceBasis;
import com.careerdecision.backend.action.ActionPlanModels.PlanPreview;
import com.careerdecision.backend.action.ActionPlanModels.PlanSummary;
import com.careerdecision.backend.action.ActionPlanModels.PlanUpdateRequest;
import com.careerdecision.backend.action.ActionPlanModels.PreviewRequest;
import com.careerdecision.backend.action.ActionPlanModels.PreviewTask;
import com.careerdecision.backend.action.ActionPlanModels.PreviewWeek;
import com.careerdecision.backend.action.ActionPlanModels.ReorderRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskResponse;
import com.careerdecision.backend.action.ActionPlanModels.TaskResultRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskResultResponse;
import com.careerdecision.backend.action.ActionPlanModels.TaskStatusRequest;
import com.careerdecision.backend.action.ActionPlanModels.TodayResponse;
import com.careerdecision.backend.action.ActionPlanModels.WeekResponse;
import com.careerdecision.backend.coaching.DecisionContextAssembler;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectDetail;
import com.careerdecision.backend.decision.DecisionProjectService;
import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.evidence.PersonalEvidenceModels.EvidenceResponse;
import com.careerdecision.backend.evidence.PersonalEvidenceService;
import com.careerdecision.backend.profile.UserProfileService;
import com.careerdecision.backend.service.AgentServerClient;
import com.careerdecision.backend.user.UserInfo;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class ActionPlanService {
    private static final Logger log = LoggerFactory.getLogger(ActionPlanService.class);
    private static final TypeReference<List<PreviewWeek>> PREVIEW_WEEKS = new TypeReference<>() { };
    private static final TypeReference<List<PlanEvidenceBasis>> PLAN_EVIDENCE = new TypeReference<>() { };
    private static final Set<String> PLAN_STATUSES = Set.of("active", "paused", "completed");
    private static final Set<String> PLAN_TYPES = Set.of("validation", "action");
    private static final Set<String> TASK_STATUSES = Set.of("todo", "in_progress", "completed", "deferred", "skipped");
    private static final Set<String> TASK_TYPES = Set.of(
            "career_research", "skill_learning", "project", "resume",
            "networking", "interview", "application", "custom"
    );

    private final ActionPlanMapper mapper;
    private final ObjectMapper objectMapper;
    private final DecisionProjectService decisionProjectService;
    private final DecisionContextAssembler decisionContextAssembler;
    private final AgentServerClient agentServerClient;
    private final UserProfileService userProfileService;
    private final PersonalEvidenceService personalEvidenceService;

    public ActionPlanService(
            ActionPlanMapper mapper,
            ObjectMapper objectMapper,
            DecisionProjectService decisionProjectService,
            DecisionContextAssembler decisionContextAssembler,
            AgentServerClient agentServerClient,
            UserProfileService userProfileService,
            PersonalEvidenceService personalEvidenceService
    ) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.decisionProjectService = decisionProjectService;
        this.decisionContextAssembler = decisionContextAssembler;
        this.agentServerClient = agentServerClient;
        this.userProfileService = userProfileService;
        this.personalEvidenceService = personalEvidenceService;
    }

    public List<PlanSummary> list(long userId) {
        return mapper.listPlans(userId).stream().map(this::summary).toList();
    }

    public PlanDetail detail(long userId, long planId) {
        PlanEntity plan = requirePlan(userId, planId);
        List<WeekResponse> weeks = mapper.findWeeks(planId).stream().map(week -> new WeekResponse(
                week.getId(), value(week.getWeekNo()), week.getTitle(), week.getWeekGoal(),
                mapper.findWeekTasks(week.getId()).stream().map(this::taskResponse).toList()
        )).toList();
        int taskCount = value(plan.getTaskCount());
        int completed = value(plan.getCompletedTaskCount());
        return new PlanDetail(
                plan.getId(), plan.getDecisionProjectId(), plan.getDecisionTargetId(), plan.getTargetRole(),
                plan.getPlanType(), plan.getOverview(), plan.getStatus(), value(plan.getDurationWeeks()), value(plan.getVersion()),
                plan.getStartDate(), plan.getEndDate(), taskCount, completed, progress(taskCount, completed),
                weeks, plan.getCreatedAt(), plan.getUpdatedAt()
        );
    }

    public PlanDetail latestForProject(long userId, long projectId) {
        PlanEntity plan = mapper.findLatestProjectPlan(userId, projectId);
        return plan == null ? null : detail(userId, plan.getId());
    }

    public PlanPreview preview(UserInfo user, PreviewRequest request) {
        TargetRow target = resolveTarget(user.id(), request.projectId(), request.targetId());
        String planType = resolvePlanType(request.planType(), target);
        int weeks = request.durationWeeks() == null ? 4 : request.durationWeeks();
        validatePlanDuration(planType, weeks);
        LocalDate startDate = request.startDate() == null ? LocalDate.now() : request.startDate();
        ProjectDetail project = decisionProjectService.detail(user.id(), request.projectId());
        Map<String, Object> context = decisionContextAssembler.assemble(user, project, null, null);
        PlanPreview fallback = baselinePreview(request.requestId().trim(), target, planType, weeks, startDate, context);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("request_id", request.requestId().trim());
        payload.put("user_id", String.valueOf(user.id()));
        payload.put("allow_external_model", userProfileService.allowsExternalAi(user.id()));
        payload.put("target_role", target.targetName());
        payload.put("plan_type", planType);
        payload.put("duration_weeks", weeks);
        payload.put("start_date", startDate);
        payload.put("decision_context", context);
        payload.put("baseline", map(fallback));
        if (request.focus() != null && !request.focus().isBlank()) {
            payload.put("focus", request.focus().trim());
        }
        try {
            return mergeAgentPreview(fallback, agentServerClient.previewActionPlan(payload));
        } catch (RuntimeException ex) {
            log.warn("Action plan preview fell back to trusted rules for request {}: {}",
                    request.requestId(), ex.getClass().getSimpleName());
            return fallback;
        }
    }

    @Transactional
    public PlanDetail generateConfirmed(UserInfo user, ConfirmPreviewRequest request) {
        PlanEntity existing = mapper.findByRequestId(user.id(), request.requestId().trim());
        if (existing != null) {
            if (!existing.getDecisionProjectId().equals(request.projectId())) {
                throw new BusinessException(40960, "requestId has already been used for another action plan.");
            }
            return detail(user.id(), existing.getId());
        }
        TargetRow target = resolveTarget(user.id(), request.projectId(), request.targetId());
        String planType = resolvePlanType(request.planType(), target);
        validatePlanDuration(planType, request.durationWeeks());
        validateConfirmedWeeks(request.durationWeeks(), request.weeks());
        ProjectDetail project = decisionProjectService.detail(user.id(), request.projectId());
        Map<String, Object> context = decisionContextAssembler.assemble(user, project, null, null);
        Set<String> allowedSourceRefs = trustedSourceRefs(project, context);
        validateConfirmedSourceRefs(request.weeks(), allowedSourceRefs);
        return persistConfirmed(user.id(), request, target, planType, allowedSourceRefs);
    }

    @Transactional
    public PlanDetail generate(long userId, GenerateRequest request) {
        PlanEntity existing = mapper.findByRequestId(userId, request.requestId().trim());
        if (existing != null) {
            if (!existing.getDecisionProjectId().equals(request.projectId())) {
                throw new BusinessException(40960, "requestId has already been used for another action plan.");
            }
            return detail(userId, existing.getId());
        }
        TargetRow target = request.targetId() == null
                ? mapper.findProjectPrimaryTarget(userId, request.projectId())
                : mapper.findPrimaryTarget(userId, request.projectId(), request.targetId());
        if (target == null) {
            throw new BusinessException(40961, "Confirm a primary decision target before generating an action plan.");
        }
        String planType = resolvePlanType(request.planType(), target);
        int weeks = request.durationWeeks() == null ? 4 : request.durationWeeks();
        validatePlanDuration(planType, weeks);
        LocalDate startDate = request.startDate() == null ? LocalDate.now() : request.startDate();
        PlanEntity plan = new PlanEntity();
        plan.setUserId(userId);
        plan.setDecisionProjectId(request.projectId());
        plan.setDecisionTargetId(target.id());
        plan.setTargetRole(target.targetName());
        plan.setPlanType(planType);
        plan.setOverview("validation".equals(planType)
                ? "先用几周时间多了解“" + target.targetName() + "”，再决定是否继续投入。"
                : "围绕“" + target.targetName() + "”按周推进岗位准备、能力提升和成果积累。");
        plan.setDurationWeeks(weeks);
        plan.setGenerationRequestId(request.requestId().trim());
        plan.setStartDate(startDate);
        plan.setEndDate(startDate.plusWeeks(weeks).minusDays(1));
        mapper.archiveActiveProjectPlans(userId, request.projectId());
        try {
            mapper.insertPlan(plan);
        } catch (DuplicateKeyException ex) {
            PlanEntity raced = mapper.findByRequestId(userId, request.requestId().trim());
            if (raced != null) return detail(userId, raced.getId());
            throw ex;
        }
        for (int weekNo = 1; weekNo <= weeks; weekNo++) {
            WeekTemplate template = weekTemplate(weekNo, weeks, target.targetName());
            WeekEntity week = new WeekEntity();
            week.setPlanId(plan.getId());
            week.setWeekNo(weekNo);
            week.setTitle("第 " + weekNo + " 周");
            week.setWeekGoal(template.goal());
            week.setSortOrder(weekNo - 1);
            mapper.insertWeekEntity(week);
            int taskOrder = 0;
            for (TaskTemplate task : template.tasks()) {
                TaskEntity entity = new TaskEntity();
                entity.setMilestoneId(week.getId());
                entity.setWeekNo(weekNo);
                entity.setTitle(task.title());
                entity.setTaskType(task.type());
                entity.setContent(task.content());
                entity.setDueAt(startDate.plusWeeks(weekNo - 1L).plusDays(taskOrder + 2L).atTime(20, 0));
                entity.setEstimatedMinutes(task.minutes());
                entity.setAcceptanceCriteria(task.acceptance());
                entity.setSortOrder(taskOrder++);
                mapper.insertTask(entity);
            }
        }
        return detail(userId, plan.getId());
    }

    @Transactional
    public PlanDetail update(long userId, long planId, PlanUpdateRequest request) {
        PlanEntity plan = requirePlan(userId, planId);
        String status = normalize(request.status());
        if (status.isEmpty()) status = plan.getStatus();
        if (!PLAN_STATUSES.contains(status)) {
            throw new BusinessException(40060, "Action plan status must be active, paused or completed.");
        }
        if (mapper.updatePlan(userId, planId, trim(request.overview()), status) == 0) notFound(planId);
        return detail(userId, planId);
    }

    @Transactional
    public void archive(long userId, long planId) {
        if (mapper.archivePlan(userId, planId) == 0) notFound(planId);
    }

    @Transactional
    public PlanDetail addTask(long userId, long planId, TaskRequest request) {
        requirePlan(userId, planId);
        Long weekId = mapper.findWeekId(planId, request.weekNo());
        if (weekId == null) throw new BusinessException(40461, "Action plan week not found: " + request.weekNo());
        TaskEntity entity = taskEntity(null, weekId, request);
        mapper.insertTask(entity);
        mapper.insertHistory(entity.getId(), userId, "created", null, "todo", null, json(entity), null, null);
        mapper.touchPlan(planId);
        return detail(userId, planId);
    }

    @Transactional
    public PlanDetail updateTask(long userId, long planId, long taskId, TaskRequest request) {
        requirePlan(userId, planId);
        TaskEntity before = requireTask(userId, planId, taskId);
        if (request.expectedVersion() == null) {
            throw new BusinessException(40066, "expectedVersion is required when updating a task.");
        }
        Long weekId = mapper.findWeekId(planId, request.weekNo());
        if (weekId == null) throw new BusinessException(40461, "Action plan week not found: " + request.weekNo());
        TaskEntity after = taskEntity(taskId, weekId, request);
        if (mapper.updateTask(after) == 0) taskConflict(taskId);
        mapper.insertHistory(taskId, userId, "edited", before.getStatus(), before.getStatus(),
                json(before), json(after), null, null);
        mapper.touchPlan(planId);
        return detail(userId, planId);
    }

    @Transactional
    public PlanDetail updateStatus(long userId, long planId, long taskId, TaskStatusRequest request) {
        requirePlan(userId, planId);
        String status = normalize(request.status());
        if (!TASK_STATUSES.contains(status)) {
            throw new BusinessException(40061, "Unsupported task status: " + request.status());
        }
        if ("deferred".equals(status) && request.deferredTo() == null) {
            throw new BusinessException(40062, "deferredTo is required when deferring a task.");
        }
        if (("deferred".equals(status) || "skipped".equals(status)) && trim(request.reason()) == null) {
            throw new BusinessException(40063, "A reason is required when deferring or skipping a task.");
        }
        String requestId = trim(request.requestId());
        Long repeatedTaskId = mapper.findHistoryTaskId(userId, requestId);
        if (repeatedTaskId != null) {
            verifyRequestTask(repeatedTaskId, taskId, requestId);
            return detail(userId, planId);
        }
        TaskEntity task = requireTask(userId, planId, taskId);
        try {
            mapper.insertHistory(taskId, userId, "status_changed", task.getStatus(), status,
                    json(task), null, trim(request.reason()), requestId);
        } catch (DuplicateKeyException ex) {
            repeatedTaskId = mapper.findHistoryTaskId(userId, requestId);
            if (repeatedTaskId == null) {
                throw new BusinessException(40964, "Task requestId is already in use: " + requestId);
            }
            verifyRequestTask(repeatedTaskId, taskId, requestId);
            return detail(userId, planId);
        }
        if (mapper.updateTaskStatus(
                taskId, status, trim(request.reason()), request.deferredTo(), request.expectedVersion()
        ) == 0) {
            taskConflict(taskId);
        }
        mapper.touchPlan(planId);
        return detail(userId, planId);
    }

    @Transactional
    public PlanDetail reorder(long userId, long planId, ReorderRequest request) {
        requirePlan(userId, planId);
        Set<Long> unique = new HashSet<>(request.taskIds());
        if (unique.size() != request.taskIds().size()) {
            throw new BusinessException(40064, "Task reorder list contains duplicates.");
        }
        int order = 0;
        for (Long taskId : request.taskIds()) {
            requireTask(userId, planId, taskId);
            Integer expectedVersion = request.expectedVersions().get(taskId);
            if (expectedVersion == null || mapper.updateTaskOrder(taskId, order++, expectedVersion) == 0) {
                taskConflict(taskId);
            }
        }
        mapper.touchPlan(planId);
        return detail(userId, planId);
    }

    @Transactional
    public PlanDetail deleteTask(long userId, long planId, long taskId, int expectedVersion) {
        requirePlan(userId, planId);
        TaskEntity task = requireTask(userId, planId, taskId);
        if (mapper.deleteTask(taskId, expectedVersion) == 0) taskConflict(taskId);
        mapper.insertHistory(taskId, userId, "deleted", task.getStatus(), null, json(task), null, null, null);
        mapper.touchPlan(planId);
        return detail(userId, planId);
    }

    @Transactional
    public PlanDetail addResult(long userId, long planId, long taskId, TaskResultRequest request) {
        PlanEntity plan = requirePlan(userId, planId);
        TaskEntity task = requireTask(userId, planId, taskId);
        String requestId = trim(request.requestId());
        if (requestId != null) {
            Long repeatedTaskId = mapper.findResultTaskId(userId, requestId);
            if (repeatedTaskId != null) {
                verifyRequestTask(repeatedTaskId, taskId, requestId);
                return detail(userId, planId);
            }
        }
        ActionPlanResultRecord record = resultRecord(null, taskId, userId, request);
        try {
            mapper.insertResult(record);
        } catch (DuplicateKeyException ex) {
            Long repeatedTaskId = mapper.findResultTaskId(userId, requestId);
            if (repeatedTaskId == null) {
                throw new BusinessException(40964, "Task requestId is already in use: " + requestId);
            }
            verifyRequestTask(repeatedTaskId, taskId, requestId);
            return detail(userId, planId);
        }
        if (Boolean.TRUE.equals(request.saveAsEvidence())) {
            saveResultAsEvidence(userId, plan, task, record, request);
        }
        mapper.touchPlan(planId);
        return detail(userId, planId);
    }

    @Transactional
    public PlanDetail updateResult(
            long userId, long planId, long taskId, long resultId, TaskResultRequest request
    ) {
        requirePlan(userId, planId);
        requireTask(userId, planId, taskId);
        ActionPlanResultRecord record = resultRecord(resultId, taskId, userId, request);
        if (mapper.updateResult(record) == 0) resultNotFound(resultId);
        mapper.touchPlan(planId);
        return detail(userId, planId);
    }

    @Transactional
    public PlanDetail deleteResult(long userId, long planId, long taskId, long resultId) {
        requirePlan(userId, planId);
        requireTask(userId, planId, taskId);
        if (mapper.deleteResult(userId, taskId, resultId) == 0) resultNotFound(resultId);
        mapper.touchPlan(planId);
        return detail(userId, planId);
    }

    public TodayResponse today(long userId) {
        PlanEntity plan = mapper.findCurrentPlan(userId);
        if (plan == null) return TodayResponse.empty();
        int weekNo = currentWeek(plan);
        Long weekId = mapper.findWeekId(plan.getId(), weekNo);
        if (weekId == null) return new TodayResponse(
                plan.getId(), plan.getDecisionProjectId(), plan.getDecisionTargetId(), plan.getTargetRole(),
                plan.getPlanType(), weekNo, 0, 0, List.of(), LocalDateTime.now()
        );
        List<TaskResponse> all = mapper.findWeekTasks(weekId).stream().map(this::taskResponse).toList();
        int completed = (int) all.stream().filter(task -> "completed".equals(task.status())).count();
        List<TaskResponse> actionable = all.stream()
                .filter(task -> Set.of("todo", "in_progress", "deferred").contains(task.status()))
                .sorted((left, right) -> {
                    if ("in_progress".equals(left.status()) != "in_progress".equals(right.status())) {
                        return "in_progress".equals(left.status()) ? -1 : 1;
                    }
                    if (left.dueAt() == null && right.dueAt() == null) return Integer.compare(left.sortOrder(), right.sortOrder());
                    if (left.dueAt() == null) return 1;
                    if (right.dueAt() == null) return -1;
                    return left.dueAt().compareTo(right.dueAt());
                })
                .limit(3)
                .toList();
        return new TodayResponse(
                plan.getId(), plan.getDecisionProjectId(), plan.getDecisionTargetId(), plan.getTargetRole(),
                plan.getPlanType(), weekNo, completed, all.size(), actionable, LocalDateTime.now()
        );
    }

    private TargetRow resolveTarget(long userId, long projectId, Long targetId) {
        TargetRow target = targetId == null
                ? mapper.findProjectPrimaryTarget(userId, projectId)
                : mapper.findPrimaryTarget(userId, projectId, targetId);
        if (target == null) {
            throw new BusinessException(40961, "Confirm a primary decision target before generating an action plan.");
        }
        return target;
    }

    private String resolvePlanType(String requestedType, TargetRow target) {
        String targetStatus = normalize(target.verificationStatus());
        if (targetStatus.isBlank()) targetStatus = "verified";
        String planType = normalize(requestedType);
        if (planType.isBlank()) planType = "verified".equals(targetStatus) ? "action" : "validation";
        if (!PLAN_TYPES.contains(planType)) {
            throw new BusinessException(40067, "计划类型暂时无法识别，请重新选择。");
        }
        if ("action".equals(planType) && !"verified".equals(targetStatus)) {
            throw new BusinessException(40961, "这个方向还需要多了解一些，请先生成短期了解计划。");
        }
        return planType;
    }

    private void validatePlanDuration(String planType, int weeks) {
        if ("validation".equals(planType) && (weeks < 2 || weeks > 4)) {
            throw new BusinessException(40067, "短期了解计划可以安排 2 至 4 周。");
        }
        if ("action".equals(planType) && (weeks < 2 || weeks > 12)) {
            throw new BusinessException(40067, "行动计划可以安排 2 至 12 周。");
        }
    }

    private PlanPreview baselinePreview(
            String requestId,
            TargetRow target,
            String planType,
            int durationWeeks,
            LocalDate startDate,
            Map<String, Object> context
    ) {
        Map<String, Object> profile = objectMap(context.get("profile"));
        List<Map<String, Object>> jobs = objectMaps(context.get("jobDetails"));
        List<Map<String, Object>> personalEvidence = objectMaps(context.get("personalEvidence"));
        List<RequirementRef> requirements = requirementRefs(jobs);
        List<String> evidenceTerms = evidenceTerms(profile, personalEvidence);
        List<RequirementRef> gaps = requirements.stream()
                .filter(requirement -> !supported(requirement.text(), evidenceTerms))
                .toList();
        List<RequirementRef> taskRequirements = gaps.isEmpty() ? requirements : gaps;
        boolean requirementsNeedEvidence = requirements.isEmpty() || !gaps.isEmpty();
        int weeklyMinutes = intValue(profile.get("weeklyAvailableMinutes"), 360);
        weeklyMinutes = Math.max(90, Math.min(weeklyMinutes, 1200));

        List<String> jobRefs = jobs.stream()
                .map(job -> "job:" + job.get("id"))
                .filter(ref -> !ref.endsWith("null"))
                .distinct()
                .limit(8)
                .toList();
        List<PreviewWeek> weeks = new ArrayList<>();
        for (int weekNo = 1; weekNo <= durationWeeks; weekNo++) {
            if (weekNo == 1) {
                weeks.add(researchWeek(target, jobs.size(), weeklyMinutes, jobRefs));
            } else if (weekNo == durationWeeks) {
                weeks.add(finalWeek(target, weekNo, weeklyMinutes, jobRefs));
            } else {
                RequirementRef requirement = taskRequirements.isEmpty()
                        ? new RequirementRef("目标岗位的关键入门能力", "decision-project:" + target.projectId())
                        : taskRequirements.get((weekNo - 2) % taskRequirements.size());
                weeks.add(capabilityWeek(target, weekNo, weeklyMinutes, requirement, requirementsNeedEvidence));
            }
        }

        List<PlanEvidenceBasis> basis = new ArrayList<>();
        basis.add(new PlanEvidenceBasis(
                "已确认主目标：“" + target.targetName() + "”。",
                List.of("decision-project:" + target.projectId())
        ));
        if (!jobs.isEmpty()) {
            basis.add(new PlanEvidenceBasis(
                    "计划参考了 " + jobs.size() + " 个已保存岗位及其结构化职责和要求。",
                    jobRefs
            ));
        }
        if (!personalEvidence.isEmpty()) {
            basis.add(new PlanEvidenceBasis(
                    "计划对照了 " + personalEvidence.size() + " 条个人证据。",
                    personalEvidence.stream().map(item -> "personal-evidence:" + item.get("id"))
                            .filter(ref -> !ref.endsWith("null")).limit(8).toList()
            ));
        } else {
            basis.add(new PlanEvidenceBasis("当前没有独立个人证据，第一周会先建立证据与缺口清单。", List.of("profile")));
        }

        List<String> uncertainties = new ArrayList<>();
        if (jobs.isEmpty()) uncertainties.add("当前目标没有已保存的岗位样本，计划中的岗位要求需要在第一周补充验证。");
        else if (requirements.isEmpty()) uncertainties.add("已保存岗位尚未提取出足够的结构化要求，计划暂时使用岗位标签和通用验证任务。");
        if (personalEvidence.isEmpty()) uncertainties.add("个人证据不足，能力缺口仅能作为待验证假设，不能视为最终判断。");
        if (uncertainties.isEmpty()) uncertainties.add("岗位样本会随时间变化，应在复盘时重新检查要求和目标可信度。");

        double confidence = Math.min(0.82, 0.42 + Math.min(jobs.size(), 8) * 0.025
                + Math.min(requirements.size(), 12) * 0.012 + Math.min(personalEvidence.size(), 8) * 0.02);
        String overview = "validation".equals(planType)
                ? "先用真实岗位、个人经历和小任务多了解“" + target.targetName()
                    + "”，不需要现在就做长期承诺。每周预计投入不超过 " + weeklyMinutes + " 分钟。"
                : "围绕“" + target.targetName() + "”，用真实岗位要求与个人经历安排可检查的成长任务。"
                    + "每周预计投入不超过 " + weeklyMinutes + " 分钟。";
        return new PlanPreview(
                requestId, target.projectId(), target.id(), target.targetName(), planType, overview,
                durationWeeks, startDate, startDate.plusWeeks(durationWeeks).minusDays(1),
                "fallback", "rule-personalized-plan-v2", Math.round(confidence * 100.0) / 100.0,
                List.copyOf(basis), List.copyOf(uncertainties), List.copyOf(weeks)
        );
    }

    private PreviewWeek researchWeek(TargetRow target, int jobCount, int weeklyMinutes, List<String> jobRefs) {
        int researchMinutes = Math.max(45, Math.round(weeklyMinutes * 0.55f));
        int evidenceMinutes = Math.max(30, weeklyMinutes - researchMinutes);
        String scope = jobCount > 0 ? Math.min(jobCount, 8) + " 个已保存岗位" : "至少 5 个真实岗位";
        List<String> sources = jobRefs.isEmpty()
                ? List.of("decision-project:" + target.projectId())
                : jobRefs;
        return new PreviewWeek(1, "用真实岗位和个人证据校准入门要求", List.of(
                new PreviewTask(
                        "提取" + scope + "的共同要求", "career_research",
                        "逐条核对职责、技能、学历和经验，区分高频要求与单个岗位的特殊要求。",
                        researchMinutes, "形成一份包含岗位来源、共同要求和出现次数的清单。",
                        "先确认市场真正要求什么，避免根据职业名称直接制定学习计划。",
                        "真实岗位要求尚未形成可比较清单", "岗位职责、技能、学历与经验要求", sources
                ),
                new PreviewTask(
                        "建立个人证据与缺口对照", "career_research",
                        "把已有技能、项目、经历和成果逐条对应到岗位要求，并标记已有证据、缺少证据和尚不确定。",
                        evidenceMinutes, "完成三栏对照表，每项判断至少关联一个岗位或个人证据来源。",
                        "只有把要求与个人事实放在同一张表中，后续任务才能真正个性化。",
                        "岗位要求与个人证据尚未逐项关联", "已提取的共同岗位要求", sources
                )
        ));
    }

    private PreviewWeek capabilityWeek(
            TargetRow target,
            int weekNo,
            int weeklyMinutes,
            RequirementRef requirement,
            boolean requirementNeedsEvidence
    ) {
        int learnMinutes = Math.max(45, Math.round(weeklyMinutes * 0.4f));
        int projectMinutes = Math.max(45, weeklyMinutes - learnMinutes);
        String shortRequirement = truncate(requirement.text(), 48);
        return new PreviewWeek(weekNo, "围绕缺口“" + shortRequirement + "”形成可检查成果", List.of(
                new PreviewTask(
                        "补齐基础：" + shortRequirement, "skill_learning",
                        "选择一个边界清楚的知识点完成学习与练习，并记录它在目标岗位中的实际用途。",
                        learnMinutes, "提交练习记录、错误修正和一段能够解释该能力用途的总结。",
                        requirementNeedsEvidence
                                ? "该要求出现在真实岗位中，但当前档案与个人证据尚未提供直接支持。"
                                : "档案中已有相关基础，仍需通过练习确认掌握深度和实际应用能力。",
                        requirementNeedsEvidence ? requirement.text() : "已有基础，但掌握深度仍待验证",
                        requirement.text(), List.of(requirement.sourceRef())
                ),
                new PreviewTask(
                        "产出能力样例：" + shortRequirement, "project",
                        "用本周能力解决一个边界清楚的小问题，保留可运行结果、截图、代码或分析文档。",
                        projectMinutes, "成果可以被打开或演示，并包含问题、行动、结果和反思。",
                        "用成果验证能力，比仅记录学习时长更能回应岗位要求。",
                        "缺少能够证明该能力的可展示成果", requirement.text(), List.of(requirement.sourceRef())
                )
        ));
    }

    private PreviewWeek finalWeek(TargetRow target, int weekNo, int weeklyMinutes, List<String> jobRefs) {
        int resultMinutes = Math.max(45, Math.round(weeklyMinutes * 0.65f));
        int reviewMinutes = Math.max(30, weeklyMinutes - resultMinutes);
        List<String> sources = new ArrayList<>(jobRefs);
        sources.add("decision-project:" + target.projectId());
        return new PreviewWeek(weekNo, "沉淀成果并复查目标可信度", List.of(
                new PreviewTask(
                        "整理可展示的验证成果", "project",
                        "将本轮行动整理为问题、行动、结果、岗位对应关系和反思，补齐访问说明。",
                        resultMinutes, "形成一份他人可以检查的成果说明或链接，并明确它支持了哪项岗位要求。",
                        "把分散结果整理为可展示证据，才能用于后续求职与目标复查。",
                        "分散练习尚未转化为可复用的求职证据。",
                        "岗位要求需要由可检查成果支撑", sources.stream().distinct().limit(12).toList()
                ),
                new PreviewTask(
                        "用新证据复查职业目标", "career_research",
                        "结合岗位样本、个人体验和成果，判断继续、调整或增加验证，并说明反对因素。",
                        reviewMinutes, "完成周复盘，写出结论、三条依据、一个反对因素和下一轮主动作。",
                        "计划最终要回到职业判断，不能只以任务完成数量作为成功标准。",
                        "尚未用本轮新证据重新检验已确认目标。",
                        "岗位样本及其结构化要求", sources.stream().distinct().limit(12).toList()
                )
        ));
    }

    private PlanPreview mergeAgentPreview(PlanPreview fallback, Map<String, Object> response) {
        if (response == null || response.isEmpty()) return fallback;
        Set<String> allowedSourceRefs = new HashSet<>();
        fallback.evidenceBasis().forEach(item -> allowedSourceRefs.addAll(item.sourceRefs()));
        fallback.weeks().forEach(week -> week.tasks().forEach(task -> allowedSourceRefs.addAll(task.sourceRefs())));
        allowedSourceRefs.add("profile");
        List<PreviewWeek> proposed = convertList(response.get("weeks"), PREVIEW_WEEKS);
        Map<Integer, PreviewWeek> fallbackWeeks = fallback.weeks().stream()
                .collect(java.util.stream.Collectors.toMap(PreviewWeek::weekNo, week -> week));
        Map<Integer, PreviewWeek> proposedWeeks = new LinkedHashMap<>();
        for (PreviewWeek week : proposed) {
            if (week != null && week.weekNo() != null && week.weekNo() >= 1
                    && week.weekNo() <= fallback.durationWeeks() && !proposedWeeks.containsKey(week.weekNo())) {
                PreviewWeek normalized = normalizeWeek(week, fallbackWeeks.get(week.weekNo()), allowedSourceRefs);
                if (normalized != null) proposedWeeks.put(week.weekNo(), normalized);
            }
        }
        List<PreviewWeek> weeks = new ArrayList<>();
        for (int weekNo = 1; weekNo <= fallback.durationWeeks(); weekNo++) {
            weeks.add(proposedWeeks.getOrDefault(weekNo, fallbackWeeks.get(weekNo)));
        }
        List<PlanEvidenceBasis> evidence = convertList(response.get("evidenceBasis"), PLAN_EVIDENCE).stream()
                .filter(item -> item != null && item.statement() != null && !item.statement().isBlank())
                .map(item -> new PlanEvidenceBasis(
                        truncate(item.statement(), 1000),
                        item.sourceRefs() == null ? List.of() : item.sourceRefs().stream()
                                .filter(allowedSourceRefs::contains).distinct().limit(12).toList()
                ))
                .filter(item -> !item.sourceRefs().isEmpty())
                .limit(20)
                .toList();
        if (evidence.isEmpty()) evidence = fallback.evidenceBasis();
        List<String> uncertainties = strings(response.get("uncertainties"), 12, 1500);
        if (uncertainties.isEmpty()) uncertainties = fallback.uncertainties();
        String mode = "llm".equals(response.get("generationMode")) ? "llm" : "fallback";
        String modelName = text(response.get("modelName"), 120, fallback.modelName());
        String overview = text(response.get("overview"), 5000, fallback.overview());
        double confidence = response.get("confidence") instanceof Number number
                ? Math.max(0, Math.min(1, number.doubleValue())) : fallback.confidence();
        return new PlanPreview(
                fallback.requestId(), fallback.projectId(), fallback.targetId(), fallback.targetRole(), fallback.planType(), overview,
                fallback.durationWeeks(), fallback.startDate(), fallback.endDate(), mode, modelName, confidence,
                evidence, uncertainties, List.copyOf(weeks)
        );
    }

    private PreviewWeek normalizeWeek(PreviewWeek proposed, PreviewWeek fallback, Set<String> allowedSourceRefs) {
        if (fallback == null || proposed.tasks() == null) return fallback;
        List<PreviewTask> tasks = new ArrayList<>();
        for (int index = 0; index < Math.min(4, proposed.tasks().size()); index++) {
            PreviewTask raw = proposed.tasks().get(index);
            PreviewTask normalized = raw == null ? null : normalizeTask(raw);
            if (normalized == null) continue;
            PreviewTask baselineTask = fallback.tasks().get(Math.min(index, fallback.tasks().size() - 1));
            List<String> refs = normalized.sourceRefs().stream().filter(allowedSourceRefs::contains).toList();
            tasks.add(new PreviewTask(
                    normalized.title(), normalized.taskType(), normalized.content(), normalized.estimatedMinutes(),
                    normalized.acceptanceCriteria(), normalized.rationale(),
                    normalized.capabilityGap() == null ? baselineTask.capabilityGap() : normalized.capabilityGap(),
                    normalized.jobRequirement() == null ? baselineTask.jobRequirement() : normalized.jobRequirement(),
                    refs.isEmpty() ? baselineTask.sourceRefs() : refs
            ));
        }
        if (tasks.isEmpty()) return fallback;
        int budget = fallback.tasks().stream().mapToInt(PreviewTask::estimatedMinutes).sum();
        int proposedMinutes = tasks.stream().mapToInt(PreviewTask::estimatedMinutes).sum();
        if (proposedMinutes > budget && budget > 0) {
            double ratio = (double) budget / proposedMinutes;
            tasks = tasks.stream().map(task -> new PreviewTask(
                    task.title(), task.taskType(), task.content(),
                    Math.max(5, (int) Math.floor(task.estimatedMinutes() * ratio)),
                    task.acceptanceCriteria(), task.rationale(), task.capabilityGap(), task.jobRequirement(), task.sourceRefs()
            )).toList();
        }
        return new PreviewWeek(proposed.weekNo(), text(proposed.goal(), 500, fallback.goal()), tasks);
    }

    private PreviewTask normalizeTask(PreviewTask task) {
        String title = text(task.title(), 200, null);
        String type = normalize(task.taskType());
        String content = text(task.content(), 1000, null);
        String acceptance = text(task.acceptanceCriteria(), 1000, null);
        String rationale = text(task.rationale(), 1000, null);
        if (title == null || content == null || acceptance == null || rationale == null || !TASK_TYPES.contains(type)) {
            return null;
        }
        int minutes = task.estimatedMinutes() == null ? 60 : Math.max(5, Math.min(10080, task.estimatedMinutes()));
        return new PreviewTask(
                title, type, content, minutes, acceptance, rationale,
                text(task.capabilityGap(), 1000, null), text(task.jobRequirement(), 1000, null),
                task.sourceRefs() == null ? List.of() : task.sourceRefs().stream()
                        .filter(java.util.Objects::nonNull).map(String::trim).filter(item -> !item.isBlank())
                        .distinct().limit(12).toList()
        );
    }

    private void validateConfirmedWeeks(int durationWeeks, List<PreviewWeek> weeks) {
        Set<Integer> numbers = new HashSet<>();
        int taskCount = 0;
        for (PreviewWeek week : weeks) {
            if (week.weekNo() == null || week.weekNo() < 1 || week.weekNo() > durationWeeks || !numbers.add(week.weekNo())) {
                throw new BusinessException(40067, "行动计划草稿的周次无效或重复。");
            }
            taskCount += week.tasks() == null ? 0 : week.tasks().size();
        }
        if (numbers.size() != durationWeeks || taskCount < durationWeeks || taskCount > durationWeeks * 4) {
            throw new BusinessException(40067, "行动计划草稿必须完整覆盖每一周，且每周包含 1 至 4 个任务。");
        }
    }

    private void validateConfirmedSourceRefs(List<PreviewWeek> weeks, Set<String> allowedSourceRefs) {
        boolean containsUnknownReference = weeks.stream()
                .flatMap(week -> week.tasks().stream())
                .flatMap(task -> task.sourceRefs() == null ? java.util.stream.Stream.empty() : task.sourceRefs().stream())
                .filter(java.util.Objects::nonNull)
                .map(String::trim)
                .filter(reference -> !reference.isBlank())
                .anyMatch(reference -> !allowedSourceRefs.contains(reference));
        if (containsUnknownReference) {
            throw new BusinessException(40067, "行动计划草稿包含无法验证的证据引用，请重新生成预览。");
        }
    }

    private PlanDetail persistConfirmed(
            long userId,
            ConfirmPreviewRequest request,
            TargetRow target,
            String planType,
            Set<String> allowedSourceRefs
    ) {
        PlanEntity plan = new PlanEntity();
        plan.setUserId(userId);
        plan.setDecisionProjectId(request.projectId());
        plan.setDecisionTargetId(target.id());
        plan.setTargetRole(target.targetName());
        plan.setPlanType(planType);
        plan.setOverview(request.overview().trim());
        plan.setDurationWeeks(request.durationWeeks());
        plan.setGenerationRequestId(request.requestId().trim());
        plan.setStartDate(request.startDate());
        plan.setEndDate(request.startDate().plusWeeks(request.durationWeeks()).minusDays(1));
        mapper.archiveActiveProjectPlans(userId, request.projectId());
        try {
            mapper.insertPlan(plan);
        } catch (DuplicateKeyException ex) {
            PlanEntity raced = mapper.findByRequestId(userId, request.requestId().trim());
            if (raced != null) return detail(userId, raced.getId());
            throw ex;
        }
        request.weeks().stream().sorted(Comparator.comparingInt(PreviewWeek::weekNo)).forEach(draftWeek -> {
            WeekEntity week = new WeekEntity();
            week.setPlanId(plan.getId());
            week.setWeekNo(draftWeek.weekNo());
            week.setTitle("第 " + draftWeek.weekNo() + " 周");
            week.setWeekGoal(draftWeek.goal().trim());
            week.setSortOrder(draftWeek.weekNo() - 1);
            mapper.insertWeekEntity(week);
            int taskOrder = 0;
            for (PreviewTask task : draftWeek.tasks()) {
                PreviewTask normalized = normalizeTask(task);
                if (normalized == null) throw new BusinessException(40067, "行动计划草稿包含无效任务。");
                normalized = new PreviewTask(
                        normalized.title(), normalized.taskType(), normalized.content(), normalized.estimatedMinutes(),
                        normalized.acceptanceCriteria(), normalized.rationale(), normalized.capabilityGap(),
                        normalized.jobRequirement(), normalized.sourceRefs().stream().filter(allowedSourceRefs::contains).toList()
                );
                TaskEntity entity = new TaskEntity();
                entity.setMilestoneId(week.getId());
                entity.setWeekNo(draftWeek.weekNo());
                entity.setTitle(normalized.title());
                entity.setTaskType(normalized.taskType());
                entity.setContent(explainableContent(normalized));
                entity.setDueAt(request.startDate().plusWeeks(draftWeek.weekNo() - 1L)
                        .plusDays(Math.min(6, taskOrder + 2L)).atTime(20, 0));
                entity.setEstimatedMinutes(normalized.estimatedMinutes());
                entity.setAcceptanceCriteria(normalized.acceptanceCriteria());
                entity.setSortOrder(taskOrder++);
                mapper.insertTask(entity);
            }
        });
        return detail(userId, plan.getId());
    }

    private Set<String> trustedSourceRefs(ProjectDetail project, Map<String, Object> context) {
        Set<String> refs = new HashSet<>();
        refs.add("profile");
        refs.add("decision-project:" + project.id());
        project.evidence().forEach(item -> {
            refs.add("project-evidence:" + item.id());
            if (item.sourceRef() != null && !item.sourceRef().isBlank()) refs.add(item.sourceRef());
        });
        objectMaps(context.get("jobDetails")).forEach(item -> {
            if (item.get("id") != null) refs.add("job:" + item.get("id"));
        });
        objectMaps(context.get("personalEvidence")).forEach(item -> {
            if (item.get("id") != null) refs.add("personal-evidence:" + item.get("id"));
        });
        return refs;
    }

    private String explainableContent(PreviewTask task) {
        List<String> parts = new ArrayList<>();
        parts.add(truncate(task.content(), 240));
        if (task.capabilityGap() != null) parts.add("能力缺口：" + truncate(task.capabilityGap(), 80));
        if (task.jobRequirement() != null) parts.add("岗位依据：" + truncate(task.jobRequirement(), 100));
        if (task.sourceRefs() != null && !task.sourceRefs().isEmpty()) {
            parts.add("来源：" + task.sourceRefs().stream().map(this::displaySourceRef)
                    .distinct().collect(java.util.stream.Collectors.joining("、")));
        }
        return truncate(String.join(" ", parts), 500);
    }

    private String displaySourceRef(String sourceRef) {
        if ("profile".equals(sourceRef)) return "个人档案";
        if (sourceRef.startsWith("job:")) return "已保存岗位 #" + sourceRef.substring("job:".length());
        if (sourceRef.startsWith("personal-evidence:")) {
            return "个人证据 #" + sourceRef.substring("personal-evidence:".length());
        }
        if (sourceRef.startsWith("project-evidence:")) {
            return "决策证据 #" + sourceRef.substring("project-evidence:".length());
        }
        if (sourceRef.startsWith("decision-project:")) {
            return "决策项目 #" + sourceRef.substring("decision-project:".length());
        }
        return sourceRef;
    }

    private List<RequirementRef> requirementRefs(List<Map<String, Object>> jobs) {
        Map<String, RequirementRef> result = new LinkedHashMap<>();
        for (Map<String, Object> job : jobs) {
            String sourceRef = "job:" + job.get("id");
            List<String> requirements = strings(job.get("requirements"), 24, 1000);
            if (requirements.isEmpty()) requirements = strings(job.get("tags"), 12, 255);
            for (String requirement : requirements) {
                result.putIfAbsent(requirement.toLowerCase(Locale.ROOT), new RequirementRef(requirement, sourceRef));
            }
        }
        return result.values().stream().limit(32).toList();
    }

    private List<String> evidenceTerms(Map<String, Object> profile, List<Map<String, Object>> evidence) {
        List<String> result = new ArrayList<>();
        for (String key : List.of("skills", "certificates", "experiences")) {
            result.addAll(strings(profile.get(key), 40, 500));
        }
        for (Map<String, Object> item : evidence) {
            for (String key : List.of("title", "description", "resultSummary", "proficiency")) {
                Object value = item.get(key);
                if (value instanceof String text && !text.isBlank()) result.add(text.trim());
            }
        }
        return result.stream().map(value -> value.toLowerCase(Locale.ROOT)).distinct().toList();
    }

    private boolean supported(String requirement, List<String> evidenceTerms) {
        String normalized = requirement.toLowerCase(Locale.ROOT);
        return evidenceTerms.stream().anyMatch(term -> normalized.contains(term) || term.contains(normalized));
    }

    private Map<String, Object> map(Object value) {
        return objectMapper.convertValue(value, new TypeReference<>() { });
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> objectMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> objectMaps(Object value) {
        if (!(value instanceof Collection<?> collection)) return List.of();
        return collection.stream().filter(Map.class::isInstance).map(item -> (Map<String, Object>) item).toList();
    }

    private <T> List<T> convertList(Object value, TypeReference<List<T>> type) {
        if (value == null) return List.of();
        try {
            List<T> converted = objectMapper.convertValue(value, type);
            return converted == null ? List.of() : converted;
        } catch (IllegalArgumentException ignored) {
            return List.of();
        }
    }

    private List<String> strings(Object value, int limit, int maxLength) {
        if (!(value instanceof Collection<?> collection)) return List.of();
        return collection.stream().filter(java.util.Objects::nonNull).map(String::valueOf).map(String::trim)
                .filter(item -> !item.isBlank()).map(item -> truncate(item, maxLength)).distinct().limit(limit).toList();
    }

    private int intValue(Object value, int fallback) {
        return value instanceof Number number ? number.intValue() : fallback;
    }

    private String text(Object value, int maxLength, String fallback) {
        if (value == null || String.valueOf(value).isBlank()) return fallback;
        return truncate(String.valueOf(value), maxLength);
    }

    private PlanEntity requirePlan(long userId, long planId) {
        PlanEntity plan = mapper.findPlan(userId, planId);
        if (plan == null) notFound(planId);
        return plan;
    }

    private TaskEntity requireTask(long userId, long planId, long taskId) {
        TaskEntity task = mapper.findOwnedTask(userId, planId, taskId);
        if (task == null) taskNotFound(taskId);
        return task;
    }

    private TaskEntity taskEntity(Long id, long weekId, TaskRequest request) {
        String taskType = normalize(request.taskType());
        if (!TASK_TYPES.contains(taskType)) {
            throw new BusinessException(40065, "Unsupported task type: " + request.taskType());
        }
        TaskEntity entity = new TaskEntity();
        entity.setId(id);
        entity.setMilestoneId(weekId);
        entity.setWeekNo(request.weekNo());
        entity.setTitle(request.title().trim());
        entity.setTaskType(taskType);
        entity.setContent(trim(request.content()) == null ? request.title().trim() : request.content().trim());
        entity.setDueAt(request.dueAt());
        entity.setEstimatedMinutes(request.estimatedMinutes());
        entity.setAcceptanceCriteria(request.acceptanceCriteria().trim());
        entity.setSortOrder(request.sortOrder() == null ? 1000 : request.sortOrder());
        entity.setVersion(request.expectedVersion());
        return entity;
    }

    private ActionPlanResultRecord resultRecord(
            Long id, long taskId, long userId, TaskResultRequest request
    ) {
        ActionPlanResultRecord record = new ActionPlanResultRecord();
        record.setId(id);
        record.setTaskId(taskId);
        record.setUserId(userId);
        record.setRequestId(trim(request.requestId()));
        record.setDescription(request.description().trim());
        record.setLinkUrl(trim(request.linkUrl()));
        return record;
    }

    private void saveResultAsEvidence(
            long userId,
            PlanEntity plan,
            TaskEntity task,
            ActionPlanResultRecord result,
            TaskResultRequest request
    ) {
        String title = first(task.getTitle(), "一次行动成果");
        EvidenceResponse personal = personalEvidenceService.create(userId,
                new com.careerdecision.backend.evidence.PersonalEvidenceModels.EvidenceRequest(
                        "task_result", title, request.description().trim(), plan.getTargetRole(),
                        request.description().trim(), trim(request.linkUrl()), null, LocalDate.now(),
                        null, "task_result", "task_result", result.getId(), "medium", LocalDate.now()
                ));
        ProjectDetail project = decisionProjectService.detail(userId, plan.getDecisionProjectId());
        TargetRow target = mapper.findPrimaryTarget(
                userId, plan.getDecisionProjectId(), plan.getDecisionTargetId());
        Long candidateId = target == null ? null : target.candidateId();
        decisionProjectService.addEvidence(userId, plan.getDecisionProjectId(),
                new com.careerdecision.backend.decision.DecisionProjectModels.EvidenceRequest(
                        candidateId, personal.id(), title, request.description().trim(),
                        "task_result", "task-result:" + result.getId(), "medium", "support", project.version()
                ));
    }

    private PlanSummary summary(PlanEntity plan) {
        int total = value(plan.getTaskCount());
        int completed = value(plan.getCompletedTaskCount());
        return new PlanSummary(
                plan.getId(), plan.getDecisionProjectId(), plan.getDecisionTargetId(), plan.getTargetRole(),
                plan.getPlanType(), plan.getStatus(), value(plan.getDurationWeeks()), total, completed, progress(total, completed),
                plan.getStartDate(), plan.getEndDate(), plan.getCreatedAt(), plan.getUpdatedAt()
        );
    }

    private TaskResponse taskResponse(TaskEntity task) {
        return new TaskResponse(
                task.getId(), value(task.getWeekNo()), first(task.getTitle(), task.getContent()),
                first(task.getTaskType(), "custom"), task.getContent(), legacyStatus(task.getStatus()), task.getDueAt(),
                task.getEstimatedMinutes(), task.getAcceptanceCriteria(), task.getStartedAt(), task.getCompletedAt(),
                task.getDeferredTo(), task.getSkipReason(), value(task.getSortOrder()), value(task.getVersion()),
                mapper.findTaskResults(task.getId()).stream().map(this::resultResponse).toList(), task.getUpdatedAt()
        );
    }

    private TaskResultResponse resultResponse(TaskResultRow row) {
        return new TaskResultResponse(
                row.id(), row.description(), row.linkUrl(), row.verificationStatus(), row.createdAt(), row.updatedAt()
        );
    }

    private WeekTemplate weekTemplate(int weekNo, int durationWeeks, String targetRole) {
        if (weekNo == 1) {
            return new WeekTemplate(
                    "用真实岗位校准“" + targetRole + "”的入门要求",
                    List.of(
                            new TaskTemplate("分析 5 个真实岗位", "career_research", "提取共同技能、学历、经验和职责关键词。", 90, "保存 5 个岗位并整理不少于 5 条共同要求。"),
                            new TaskTemplate("整理当前证据与缺口", "career_research", "把已有项目和技能对应到岗位要求。", 60, "形成已有证据、缺少证据、尚不确定三栏清单。")
                    )
            );
        }
        if (weekNo == durationWeeks) {
            return new WeekTemplate(
                    "沉淀成果并复查目标可信度",
                    List.of(
                            new TaskTemplate("完成成果说明", "project", "把本轮行动整理成问题、行动、结果和反思。", 90, "提交一份可供他人查看的成果说明或链接。"),
                            new TaskTemplate("复查目标与下一步", "career_research", "结合岗位样本和成果决定继续、调整或补充验证。", 45, "完成本周复盘并明确下一轮的一个主动作。")
                    )
            );
        }
        return new WeekTemplate(
                "围绕关键缺口产出可验证成果",
                List.of(
                        new TaskTemplate("学习一个关键技能点", "skill_learning", "选择岗位样本中重复出现且当前欠缺的技能。", 120, "完成练习，并用自己的话记录技能如何用于目标岗位。"),
                        new TaskTemplate("推进一个微型项目", "project", "用本周技能解决一个边界清楚的小问题。", 180, "产出可运行结果、截图或代码链接，并记录取舍。")
                )
        );
    }

    private int currentWeek(PlanEntity plan) {
        if (plan.getStartDate() == null) return 1;
        long days = ChronoUnit.DAYS.between(plan.getStartDate(), LocalDate.now());
        int week = days < 0 ? 1 : (int) (days / 7) + 1;
        return Math.max(1, Math.min(value(plan.getDurationWeeks()), week));
    }

    private String legacyStatus(String status) {
        if ("done".equals(status)) return "completed";
        if ("doing".equals(status)) return "in_progress";
        return status;
    }

    private int progress(int total, int completed) { return total == 0 ? 0 : Math.round(completed * 100.0f / total); }
    private int value(Integer value) { return value == null ? 0 : value; }
    private String first(String preferred, String fallback) { return preferred == null || preferred.isBlank() ? fallback : preferred; }
    private String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String normalize(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }
    private String truncate(String value, int maxLength) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }
    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException ex) { throw new BusinessException(50060, "Failed to serialize task history."); }
    }
    private void notFound(long id) { throw new BusinessException(40460, "Action plan not found: " + id); }
    private void taskNotFound(long id) { throw new BusinessException(40462, "Action plan task not found: " + id); }
    private void taskConflict(long id) {
        throw new BusinessException(40962, "任务已在其他设备更新，请刷新后重试：" + id);
    }
    private void verifyRequestTask(long recordedTaskId, long requestedTaskId, String requestId) {
        if (recordedTaskId != requestedTaskId) {
            throw new BusinessException(40964, "Task requestId belongs to another task: " + requestId);
        }
    }
    private void resultNotFound(long id) { throw new BusinessException(40463, "Task result not found: " + id); }

    private record WeekTemplate(String goal, List<TaskTemplate> tasks) { }
    private record TaskTemplate(String title, String type, String content, int minutes, String acceptance) { }
    private record RequirementRef(String text, String sourceRef) { }
}
