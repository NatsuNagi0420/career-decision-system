package com.careerdecision.backend.pathplan;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface PathPlanMapper {
    @Insert("""
            INSERT INTO path_plans (user_id, agent_run_id, target_role, overview, status)
            VALUES (#{userId}, #{agentRunId}, #{targetRole}, #{overview}, 'active')
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertPlan(PathPlanRecord record);

    @Insert("""
            INSERT INTO path_plan_milestones (plan_id, title, duration, sort_order, acceptance_json)
            VALUES (#{planId}, #{title}, #{duration}, #{sortOrder}, #{acceptanceJson})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertMilestone(PathPlanMilestoneRecord record);

    @Insert("""
            INSERT INTO path_plan_tasks (milestone_id, content, status, sort_order)
            VALUES (#{milestoneId}, #{content}, 'todo', #{sortOrder})
            """)
    void insertTask(PathPlanTaskRecord record);

    @Select("""
            SELECT p.id, p.user_id, p.agent_run_id, p.target_role, p.overview, p.status,
                   p.start_date, p.end_date, p.created_at, p.updated_at,
                   (
                     SELECT COUNT(1)
                     FROM path_plan_milestones m
                     WHERE m.plan_id = p.id
                   ) AS milestone_count,
                   (
                     SELECT COUNT(1)
                     FROM path_plan_milestones m
                     JOIN path_plan_tasks t ON t.milestone_id = m.id
                     WHERE m.plan_id = p.id
                   ) AS task_count,
                   (
                     SELECT COUNT(1)
                     FROM path_plan_milestones m
                     JOIN path_plan_tasks t ON t.milestone_id = m.id
                     WHERE m.plan_id = p.id
                       AND t.status = 'done'
                   ) AS completed_task_count
            FROM path_plans p
            WHERE p.user_id = #{userId}
              AND p.status <> 'archived'
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT #{limit} OFFSET #{offset}
            """)
    List<PathPlanRecord> listPlans(
            @Param("userId") long userId,
            @Param("offset") int offset,
            @Param("limit") int limit
    );

    @Select("""
            SELECT id, user_id, agent_run_id, target_role, overview, status,
                   start_date, end_date, created_at, updated_at
            FROM path_plans
            WHERE id = #{planId}
              AND user_id = #{userId}
              AND status <> 'archived'
            LIMIT 1
            """)
    PathPlanRecord findPlan(@Param("userId") long userId, @Param("planId") long planId);

    @Select("""
            SELECT id, plan_id, title, duration, sort_order, acceptance_json
            FROM path_plan_milestones
            WHERE plan_id = #{planId}
            ORDER BY sort_order, id
            """)
    List<PathPlanMilestoneRecord> findMilestones(@Param("planId") long planId);

    @Select("""
            SELECT id, milestone_id, content, status, completed_at, sort_order
            FROM path_plan_tasks
            WHERE milestone_id = #{milestoneId}
            ORDER BY sort_order, id
            """)
    List<PathPlanTaskRecord> findTasks(@Param("milestoneId") long milestoneId);

    @Update("""
            UPDATE path_plan_tasks
            SET status = #{status},
                completed_at = CASE WHEN #{status} = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE id = #{taskId}
              AND milestone_id IN (
                SELECT m.id
                FROM path_plan_milestones m
                JOIN path_plans p ON p.id = m.plan_id
                WHERE p.id = #{planId}
                  AND p.user_id = #{userId}
                  AND p.status <> 'archived'
              )
            """)
    int updateTaskStatus(
            @Param("userId") long userId,
            @Param("planId") long planId,
            @Param("taskId") long taskId,
            @Param("status") String status
    );

    @Update("""
            UPDATE path_plans
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = #{planId}
              AND user_id = #{userId}
              AND status <> 'archived'
            """)
    int touchPlan(@Param("userId") long userId, @Param("planId") long planId);

    @Update("""
            UPDATE path_plans
            SET status = 'archived',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{planId}
              AND user_id = #{userId}
              AND status <> 'archived'
            """)
    int archivePlan(@Param("userId") long userId, @Param("planId") long planId);

    @Delete("DELETE FROM path_plans WHERE id = #{planId} AND user_id = #{userId}")
    int deletePlan(@Param("userId") long userId, @Param("planId") long planId);
}
