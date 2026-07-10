package com.careerdecision.backend.pathplan;

import com.careerdecision.backend.agent.AgentRunService;
import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

@Service
public class PathPlanArchiveService {
    private static final int MAX_PAGE_SIZE = 50;
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };

    private final PathPlanMapper pathPlanMapper;
    private final ObjectMapper objectMapper;
    private final AgentRunService agentRunService;

    public PathPlanArchiveService(
            PathPlanMapper pathPlanMapper,
            ObjectMapper objectMapper,
            AgentRunService agentRunService
    ) {
        this.pathPlanMapper = pathPlanMapper;
        this.objectMapper = objectMapper;
        this.agentRunService = agentRunService;
    }

    @Transactional
    public PathPlanDetailResponse archive(long userId, PathPlanArchiveRequest request) {
        PathPlanRecord plan = new PathPlanRecord();
        plan.setUserId(userId);
        plan.setAgentRunId(agentRunService.verifyLinkableRunId(request.agentRunId(), userId, "path_plan"));
        plan.setTargetRole(trimToNull(request.targetRole()));
        plan.setOverview(trimToNull(request.overview()));
        pathPlanMapper.insertPlan(plan);

        int sortOrder = 0;
        for (PathPlanMilestonePayload payload : request.milestones()) {
            List<String> acceptance = sortOrder == 0
                    ? mergeAcceptance(payload.acceptance(), request.checkpoints())
                    : sanitize(payload.acceptance());
            PathPlanMilestoneRecord milestone = new PathPlanMilestoneRecord();
            milestone.setPlanId(plan.getId());
            milestone.setTitle(trimToNull(payload.title()));
            milestone.setDuration(trimToNull(payload.duration()));
            milestone.setSortOrder(sortOrder++);
            milestone.setAcceptanceJson(toJson(acceptance));
            pathPlanMapper.insertMilestone(milestone);

            int taskOrder = 0;
            for (String task : sanitize(payload.tasks())) {
                PathPlanTaskRecord taskRecord = new PathPlanTaskRecord();
                taskRecord.setMilestoneId(milestone.getId());
                taskRecord.setContent(task);
                taskRecord.setSortOrder(taskOrder++);
                pathPlanMapper.insertTask(taskRecord);
            }
        }
        return detail(userId, plan.getId());
    }

    public List<PathPlanSnapshotResponse> list(long userId, int page, int size) {
        validatePage(page, size);
        return pathPlanMapper.listPlans(userId, page * size, size).stream()
                .map(this::toSnapshot)
                .toList();
    }

    public PathPlanDetailResponse detail(long userId, long planId) {
        PathPlanRecord plan = pathPlanMapper.findPlan(userId, planId);
        if (plan == null) {
            throw new BusinessException(40420, "Path plan not found: " + planId);
        }
        List<PathPlanMilestoneResponse> milestones = new ArrayList<>();
        List<String> checkpoints = new ArrayList<>();
        int taskCount = 0;
        int completedTaskCount = 0;
        for (PathPlanMilestoneRecord milestone : pathPlanMapper.findMilestones(planId)) {
            List<String> acceptance = fromJson(milestone.getAcceptanceJson());
            checkpoints.addAll(acceptance);
            List<PathPlanTaskRecord> tasks = pathPlanMapper.findTasks(milestone.getId());
            taskCount += tasks.size();
            completedTaskCount += (int) tasks.stream()
                    .filter(task -> "done".equals(task.getStatus()))
                    .count();
            milestones.add(new PathPlanMilestoneResponse(
                    milestone.getId(),
                    milestone.getTitle(),
                    milestone.getDuration(),
                    tasks.stream()
                            .map(task -> new PathPlanTaskResponse(
                                    task.getId(),
                                    task.getContent(),
                                    task.getStatus(),
                                    task.getCompletedAt()
                            ))
                            .toList(),
                    acceptance
            ));
        }
        return new PathPlanDetailResponse(
                plan.getId(),
                plan.getAgentRunId(),
                plan.getTargetRole(),
                plan.getOverview(),
                plan.getStatus(),
                taskCount,
                completedTaskCount,
                progressPercent(taskCount, completedTaskCount),
                milestones,
                checkpoints.stream().distinct().toList(),
                plan.getCreatedAt(),
                plan.getUpdatedAt()
        );
    }

    @Transactional
    public PathPlanDetailResponse updateTaskStatus(long userId, long planId, long taskId, PathPlanTaskStatusRequest request) {
        String status = normalizeTaskStatus(request.status());
        if (pathPlanMapper.updateTaskStatus(userId, planId, taskId, status) == 0) {
            throw new BusinessException(40421, "Path plan task not found: " + taskId);
        }
        pathPlanMapper.touchPlan(userId, planId);
        return detail(userId, planId);
    }

    public void archiveStatus(long userId, long planId) {
        if (pathPlanMapper.archivePlan(userId, planId) == 0) {
            throw new BusinessException(40420, "Path plan not found: " + planId);
        }
    }

    private PathPlanSnapshotResponse toSnapshot(PathPlanRecord record) {
        int taskCount = record.getTaskCount() == null ? 0 : record.getTaskCount();
        int completedTaskCount = record.getCompletedTaskCount() == null ? 0 : record.getCompletedTaskCount();
        return new PathPlanSnapshotResponse(
                record.getId(),
                record.getAgentRunId(),
                record.getTargetRole(),
                record.getOverview(),
                record.getStatus(),
                record.getMilestoneCount() == null ? 0 : record.getMilestoneCount(),
                taskCount,
                completedTaskCount,
                progressPercent(taskCount, completedTaskCount),
                record.getCreatedAt(),
                record.getUpdatedAt()
        );
    }

    private List<String> mergeAcceptance(Collection<String> acceptance, Collection<String> checkpoints) {
        List<String> merged = new ArrayList<>(sanitize(acceptance));
        for (String checkpoint : sanitize(checkpoints)) {
            if (!merged.contains(checkpoint)) {
                merged.add(checkpoint);
            }
        }
        return merged;
    }

    private List<String> sanitize(Collection<String> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }

    private void validatePage(int page, int size) {
        if (page < 0) {
            throw new BusinessException(40040, "Page must be greater than or equal to 0.");
        }
        if (size <= 0 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(40041, "Size must be between 1 and " + MAX_PAGE_SIZE + ".");
        }
    }

    private String normalizeTaskStatus(String value) {
        String status = trimToNull(value);
        if (status == null) {
            throw new BusinessException(40042, "Task status is required.");
        }
        status = status.toLowerCase();
        if ("completed".equals(status)) {
            return "done";
        }
        if ("done".equals(status) || "todo".equals(status)) {
            return status;
        }
        throw new BusinessException(40043, "Task status must be todo or done.");
    }

    private int progressPercent(int taskCount, int completedTaskCount) {
        if (taskCount <= 0) {
            return 0;
        }
        return Math.round((completedTaskCount * 100.0f) / taskCount);
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50040, "Failed to serialize path plan.");
        }
    }

    private List<String> fromJson(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }
}
