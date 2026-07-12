package com.careerdecision.backend.action;

import com.careerdecision.backend.action.ActionPlanEntities.PlanEntity;
import com.careerdecision.backend.action.ActionPlanEntities.TargetRow;
import com.careerdecision.backend.action.ActionPlanEntities.TaskEntity;
import com.careerdecision.backend.action.ActionPlanEntities.TaskResultRow;
import com.careerdecision.backend.action.ActionPlanEntities.WeekEntity;
import com.careerdecision.backend.action.ActionPlanModels.GenerateRequest;
import com.careerdecision.backend.action.ActionPlanModels.PlanDetail;
import com.careerdecision.backend.action.ActionPlanModels.PlanSummary;
import com.careerdecision.backend.action.ActionPlanModels.PlanUpdateRequest;
import com.careerdecision.backend.action.ActionPlanModels.ReorderRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskResponse;
import com.careerdecision.backend.action.ActionPlanModels.TaskResultRequest;
import com.careerdecision.backend.action.ActionPlanModels.TaskResultResponse;
import com.careerdecision.backend.action.ActionPlanModels.TaskStatusRequest;
import com.careerdecision.backend.action.ActionPlanModels.TodayResponse;
import com.careerdecision.backend.action.ActionPlanModels.WeekResponse;
import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class ActionPlanService {
    private static final Set<String> PLAN_STATUSES = Set.of("active", "paused", "completed");
    private static final Set<String> TASK_STATUSES = Set.of("todo", "in_progress", "completed", "deferred", "skipped");
    private static final Set<String> TASK_TYPES = Set.of(
            "career_research", "skill_learning", "project", "resume",
            "networking", "interview", "application", "custom"
    );

    private final ActionPlanMapper mapper;
    private final ObjectMapper objectMapper;

    public ActionPlanService(ActionPlanMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
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
                plan.getOverview(), plan.getStatus(), value(plan.getDurationWeeks()), value(plan.getVersion()),
                plan.getStartDate(), plan.getEndDate(), taskCount, completed, progress(taskCount, completed),
                weeks, plan.getCreatedAt(), plan.getUpdatedAt()
        );
    }

    public PlanDetail latestForProject(long userId, long projectId) {
        PlanEntity plan = mapper.findLatestProjectPlan(userId, projectId);
        return plan == null ? null : detail(userId, plan.getId());
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
        int weeks = request.durationWeeks() == null ? 4 : request.durationWeeks();
        LocalDate startDate = request.startDate() == null ? LocalDate.now() : request.startDate();
        PlanEntity plan = new PlanEntity();
        plan.setUserId(userId);
        plan.setDecisionProjectId(request.projectId());
        plan.setDecisionTargetId(target.id());
        plan.setTargetRole(target.targetName());
        plan.setOverview("围绕“" + target.targetName() + "”按周验证岗位、能力和成果证据。");
        plan.setDurationWeeks(weeks);
        plan.setGenerationRequestId(request.requestId().trim());
        plan.setStartDate(startDate);
        plan.setEndDate(startDate.plusWeeks(weeks).minusDays(1));
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
        requirePlan(userId, planId);
        requireTask(userId, planId, taskId);
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
                weekNo, 0, 0, List.of(), LocalDateTime.now()
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
                weekNo, completed, all.size(), actionable, LocalDateTime.now()
        );
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

    private PlanSummary summary(PlanEntity plan) {
        int total = value(plan.getTaskCount());
        int completed = value(plan.getCompletedTaskCount());
        return new PlanSummary(
                plan.getId(), plan.getDecisionProjectId(), plan.getDecisionTargetId(), plan.getTargetRole(),
                plan.getStatus(), value(plan.getDurationWeeks()), total, completed, progress(total, completed),
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
}
