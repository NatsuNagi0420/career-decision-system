package com.careerdecision.backend.action;

import com.careerdecision.backend.action.ActionPlanEntities.PlanEntity;
import com.careerdecision.backend.action.ActionPlanEntities.TargetRow;
import com.careerdecision.backend.action.ActionPlanEntities.TaskEntity;
import com.careerdecision.backend.action.ActionPlanEntities.TaskResultRow;
import com.careerdecision.backend.action.ActionPlanEntities.WeekEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface ActionPlanMapper {
    String PLAN_COLUMNS = """
            p.id, p.user_id, p.decision_project_id, p.decision_target_id,
            p.target_role, p.overview, p.status, p.duration_weeks,
            p.generation_request_id, p.version, p.start_date, p.end_date,
            p.created_at, p.updated_at,
            (SELECT COUNT(1) FROM path_plan_milestones m JOIN path_plan_tasks t ON t.milestone_id = m.id
             WHERE m.plan_id = p.id AND t.deleted = 0) AS task_count,
            (SELECT COUNT(1) FROM path_plan_milestones m JOIN path_plan_tasks t ON t.milestone_id = m.id
             WHERE m.plan_id = p.id AND t.status = 'completed' AND t.deleted = 0) AS completed_task_count
            """;

    @Select("""
            SELECT t.id, t.project_id, t.target_name
            FROM decision_targets t
            JOIN decision_projects p ON p.id = t.project_id
            WHERE t.id = #{targetId} AND t.user_id = #{userId} AND t.project_id = #{projectId}
              AND t.target_type = 'primary' AND p.status <> 'archived'
            LIMIT 1
            """)
    TargetRow findPrimaryTarget(
            @Param("userId") long userId,
            @Param("projectId") long projectId,
            @Param("targetId") long targetId
    );

    @Select("""
            SELECT t.id, t.project_id, t.target_name
            FROM decision_targets t
            JOIN decision_projects p ON p.id = t.project_id
            WHERE t.user_id = #{userId} AND t.project_id = #{projectId}
              AND t.target_type = 'primary' AND p.status <> 'archived'
            LIMIT 1
            """)
    TargetRow findProjectPrimaryTarget(@Param("userId") long userId, @Param("projectId") long projectId);

    @Insert("""
            INSERT INTO path_plans (
              user_id, decision_project_id, decision_target_id, target_role, overview,
              status, plan_type, duration_weeks, generation_request_id, start_date, end_date
            ) VALUES (
              #{userId}, #{decisionProjectId}, #{decisionTargetId}, #{targetRole}, #{overview},
              'active', 'action', #{durationWeeks}, #{generationRequestId}, #{startDate}, #{endDate}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertPlan(PlanEntity entity);

    @Insert("""
            INSERT INTO path_plan_milestones (plan_id, week_no, title, week_goal, duration, sort_order, acceptance_json)
            VALUES (#{planId}, #{weekNo}, #{title}, #{weekGoal}, '1 week', #{sortOrder}, '[]')
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertWeekEntity(WeekEntity entity);

    @Insert("""
            INSERT INTO path_plan_tasks (
              milestone_id, week_no, title, task_type, content, status, due_date, due_at,
              estimated_minutes, acceptance_criteria, sort_order
            ) VALUES (
              #{milestoneId}, #{weekNo}, #{title}, #{taskType}, #{content}, 'todo',
              CASE WHEN #{dueAt} IS NULL THEN NULL ELSE CAST(#{dueAt} AS DATE) END,
              #{dueAt}, #{estimatedMinutes}, #{acceptanceCriteria}, #{sortOrder}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertTask(TaskEntity entity);

    @Select("""
            SELECT
            """ + PLAN_COLUMNS + """
            FROM path_plans p
            WHERE p.user_id = #{userId} AND p.plan_type = 'action' AND p.status <> 'archived'
            ORDER BY CASE WHEN p.status = 'active' THEN 0 ELSE 1 END, p.updated_at DESC, p.id DESC
            """)
    List<PlanEntity> listPlans(@Param("userId") long userId);

    @Select("""
            SELECT
            """ + PLAN_COLUMNS + """
            FROM path_plans p
            WHERE p.id = #{planId} AND p.user_id = #{userId}
              AND p.plan_type = 'action' AND p.status <> 'archived'
            LIMIT 1
            """)
    PlanEntity findPlan(@Param("userId") long userId, @Param("planId") long planId);

    @Select("""
            SELECT
            """ + PLAN_COLUMNS + """
            FROM path_plans p
            WHERE p.user_id = #{userId} AND p.plan_type = 'action' AND p.status = 'active'
            ORDER BY p.updated_at DESC, p.id DESC LIMIT 1
            """)
    PlanEntity findCurrentPlan(@Param("userId") long userId);

    @Select("""
            SELECT
            """ + PLAN_COLUMNS + """
            FROM path_plans p
            WHERE p.user_id = #{userId} AND p.decision_project_id = #{projectId}
              AND p.plan_type = 'action' AND p.status <> 'archived'
            ORDER BY CASE WHEN p.status = 'active' THEN 0 ELSE 1 END, p.updated_at DESC, p.id DESC
            LIMIT 1
            """)
    PlanEntity findLatestProjectPlan(
            @Param("userId") long userId,
            @Param("projectId") long projectId
    );

    @Select("""
            SELECT
            """ + PLAN_COLUMNS + """
            FROM path_plans p
            WHERE p.user_id = #{userId} AND p.generation_request_id = #{requestId}
              AND p.plan_type = 'action'
            LIMIT 1
            """)
    PlanEntity findByRequestId(@Param("userId") long userId, @Param("requestId") String requestId);

    @Select("""
            SELECT id, plan_id, week_no, title, week_goal, sort_order
            FROM path_plan_milestones WHERE plan_id = #{planId}
            ORDER BY week_no, sort_order, id
            """)
    List<WeekEntity> findWeeks(@Param("planId") long planId);

    @Select("""
            SELECT t.id, t.milestone_id, t.week_no, t.title, t.task_type, t.content, t.status,
                   t.due_at, t.estimated_minutes, t.acceptance_criteria, t.started_at,
                   t.completed_at, t.deferred_to, t.skip_reason, t.sort_order, t.version, t.updated_at
            FROM path_plan_tasks t
            WHERE t.milestone_id = #{milestoneId} AND t.deleted = 0
            ORDER BY t.sort_order, t.id
            """)
    List<TaskEntity> findWeekTasks(@Param("milestoneId") long milestoneId);

    @Select("""
            SELECT t.id, t.milestone_id, t.week_no, t.title, t.task_type, t.content, t.status,
                   t.due_at, t.estimated_minutes, t.acceptance_criteria, t.started_at,
                   t.completed_at, t.deferred_to, t.skip_reason, t.sort_order, t.version, t.updated_at
            FROM path_plan_tasks t
            JOIN path_plan_milestones m ON m.id = t.milestone_id
            JOIN path_plans p ON p.id = m.plan_id
            WHERE t.id = #{taskId} AND t.deleted = 0 AND p.id = #{planId} AND p.user_id = #{userId}
              AND p.plan_type = 'action' AND p.status <> 'archived'
            LIMIT 1
            """)
    TaskEntity findOwnedTask(
            @Param("userId") long userId,
            @Param("planId") long planId,
            @Param("taskId") long taskId
    );

    @Select("""
            SELECT r.id, r.description, r.link_url, r.verification_status, r.created_at, r.updated_at
            FROM task_results r WHERE r.task_id = #{taskId}
            ORDER BY r.created_at, r.id
            """)
    List<TaskResultRow> findTaskResults(@Param("taskId") long taskId);

    @Update("""
            UPDATE path_plans SET overview = #{overview}, status = #{status},
                version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{planId} AND user_id = #{userId} AND plan_type = 'action' AND status <> 'archived'
            """)
    int updatePlan(
            @Param("userId") long userId,
            @Param("planId") long planId,
            @Param("overview") String overview,
            @Param("status") String status
    );

    @Update("""
            UPDATE path_plans SET status = 'archived', updated_at = CURRENT_TIMESTAMP
            WHERE id = #{planId} AND user_id = #{userId} AND plan_type = 'action' AND status <> 'archived'
            """)
    int archivePlan(@Param("userId") long userId, @Param("planId") long planId);

    @Select("""
            SELECT id FROM path_plan_milestones
            WHERE plan_id = #{planId} AND week_no = #{weekNo} LIMIT 1
            """)
    Long findWeekId(@Param("planId") long planId, @Param("weekNo") int weekNo);

    @Update("""
            UPDATE path_plan_tasks
            SET week_no = #{weekNo}, title = #{title}, task_type = #{taskType}, content = #{content},
                due_date = CASE WHEN #{dueAt} IS NULL THEN NULL ELSE CAST(#{dueAt} AS DATE) END,
                due_at = #{dueAt}, estimated_minutes = #{estimatedMinutes},
                acceptance_criteria = #{acceptanceCriteria}, sort_order = #{sortOrder},
                version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND milestone_id = #{milestoneId} AND version = #{version}
            """)
    int updateTask(TaskEntity entity);

    @Update("""
            UPDATE path_plan_tasks
            SET status = #{status},
                started_at = CASE WHEN #{status} = 'in_progress' AND started_at IS NULL
                                  THEN CURRENT_TIMESTAMP ELSE started_at END,
                completed_at = CASE WHEN #{status} = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
                deferred_to = CASE WHEN #{status} = 'deferred' THEN #{deferredTo} ELSE NULL END,
                skip_reason = CASE WHEN #{status} IN ('deferred', 'skipped') THEN #{reason} ELSE NULL END,
                version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{taskId} AND version = #{expectedVersion}
            """)
    int updateTaskStatus(
            @Param("taskId") long taskId,
            @Param("status") String status,
            @Param("reason") String reason,
            @Param("deferredTo") LocalDateTime deferredTo,
            @Param("expectedVersion") int expectedVersion
    );

    @Update("""
            UPDATE path_plan_tasks SET sort_order = #{sortOrder}, version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{taskId} AND deleted = 0 AND version = #{expectedVersion}
            """)
    int updateTaskOrder(
            @Param("taskId") long taskId,
            @Param("sortOrder") int sortOrder,
            @Param("expectedVersion") int expectedVersion
    );

    @Update("""
            UPDATE path_plan_tasks SET deleted = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{taskId} AND deleted = 0 AND version = #{expectedVersion}
            """)
    int deleteTask(@Param("taskId") long taskId, @Param("expectedVersion") int expectedVersion);

    @Insert("""
            INSERT INTO task_change_history (
              task_id, user_id, change_type, from_status, to_status,
              before_json, after_json, reason, request_id
            ) VALUES (
              #{taskId}, #{userId}, #{changeType}, #{fromStatus}, #{toStatus},
              #{beforeJson}, #{afterJson}, #{reason}, #{requestId}
            )
            """)
    void insertHistory(
            @Param("taskId") long taskId,
            @Param("userId") long userId,
            @Param("changeType") String changeType,
            @Param("fromStatus") String fromStatus,
            @Param("toStatus") String toStatus,
            @Param("beforeJson") String beforeJson,
            @Param("afterJson") String afterJson,
            @Param("reason") String reason,
            @Param("requestId") String requestId
    );

    @Select("""
            SELECT task_id FROM task_change_history
            WHERE request_id = #{requestId} AND user_id = #{userId}
            LIMIT 1
            """)
    Long findHistoryTaskId(@Param("userId") long userId, @Param("requestId") String requestId);

    @Insert("""
            INSERT INTO task_results (task_id, user_id, request_id, description, link_url)
            VALUES (#{taskId}, #{userId}, #{requestId}, #{description}, #{linkUrl})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertResult(ActionPlanResultRecord record);

    @Select("""
            SELECT task_id FROM task_results
            WHERE user_id = #{userId} AND request_id = #{requestId}
            LIMIT 1
            """)
    Long findResultTaskId(@Param("userId") long userId, @Param("requestId") String requestId);

    @Update("""
            UPDATE task_results SET description = #{description}, link_url = #{linkUrl},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND task_id = #{taskId} AND user_id = #{userId}
            """)
    int updateResult(ActionPlanResultRecord record);

    @Delete("""
            DELETE FROM task_results WHERE id = #{resultId} AND task_id = #{taskId} AND user_id = #{userId}
            """)
    int deleteResult(
            @Param("userId") long userId,
            @Param("taskId") long taskId,
            @Param("resultId") long resultId
    );

    @Update("UPDATE path_plans SET updated_at = CURRENT_TIMESTAMP WHERE id = #{planId}")
    int touchPlan(@Param("planId") long planId);
}
