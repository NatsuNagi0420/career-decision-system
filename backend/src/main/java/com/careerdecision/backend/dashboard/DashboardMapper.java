package com.careerdecision.backend.dashboard;

import com.careerdecision.backend.dashboard.DashboardModels.ProjectSnapshot;
import com.careerdecision.backend.dashboard.DashboardModels.ProfileSnapshot;
import com.careerdecision.backend.dashboard.DashboardModels.ReviewSnapshot;
import com.careerdecision.backend.dashboard.DashboardModels.ExecutionRiskSnapshot;
import com.careerdecision.backend.agent.AgentRunRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;

@Mapper
public interface DashboardMapper {
    @Select("""
            SELECT COUNT(1) FROM user_profiles
            WHERE user_id = #{userId} AND onboarding_completed_at IS NOT NULL
            """)
    int onboardingCompleted(@Param("userId") long userId);

    @Select("""
            SELECT display_name, school, major, grade, city,
                   CASE WHEN external_ai_consent_at IS NULL THEN FALSE ELSE TRUE END AS external_ai_consent,
                   updated_at
            FROM user_profiles WHERE user_id = #{userId} LIMIT 1
            """)
    ProfileSnapshot profile(@Param("userId") long userId);

    @Select("""
            SELECT p.id, p.title, p.question, p.status, p.current_stage,
                   (SELECT COUNT(1) FROM decision_candidates c
                    WHERE c.project_id = p.id AND c.status = 'active') AS candidate_count,
                   (SELECT COUNT(1) FROM decision_project_job_samples s
                    WHERE s.project_id = p.id) AS job_sample_count,
                   ((SELECT COUNT(1) FROM decision_candidates c
                     WHERE c.project_id = p.id AND c.status = 'active'
                       AND c.uncertainties IS NOT NULL AND TRIM(c.uncertainties) != '')
                    + (SELECT COUNT(1) FROM comparison_results result
                       JOIN comparison_criteria criterion ON criterion.id = result.criterion_id
                       WHERE criterion.project_id = p.id
                         AND ((result.uncertainty IS NOT NULL AND TRIM(result.uncertainty) != '')
                           OR (result.validation_action IS NOT NULL AND TRIM(result.validation_action) != ''))))
                    AS open_question_count,
                   (SELECT t.target_name FROM decision_targets t
                    WHERE t.project_id = p.id AND t.target_type = 'primary' LIMIT 1) AS primary_target,
                   (SELECT t.target_name FROM decision_targets t
                    WHERE t.project_id = p.id AND t.target_type = 'backup' LIMIT 1) AS backup_target,
                   (SELECT t.decision_reason FROM decision_targets t
                    WHERE t.project_id = p.id AND t.target_type = 'primary' LIMIT 1) AS decision_reason,
                   (SELECT t.main_risks FROM decision_targets t
                    WHERE t.project_id = p.id AND t.target_type = 'primary' LIMIT 1) AS main_risks,
                   (SELECT t.review_date FROM decision_targets t
                    WHERE t.project_id = p.id AND t.target_type = 'primary' LIMIT 1) AS review_date,
                   (SELECT t.confirmed_at FROM decision_targets t
                    WHERE t.project_id = p.id AND t.target_type = 'primary' LIMIT 1) AS confirmed_at,
                   (SELECT COUNT(1) FROM decision_evidence e
                    WHERE e.project_id = p.id AND e.status = 'active') AS evidence_count,
                   (SELECT COUNT(1)
                    FROM task_results result
                    JOIN path_plan_tasks task ON task.id = result.task_id
                    JOIN path_plan_milestones milestone ON milestone.id = task.milestone_id
                    JOIN path_plans plan ON plan.id = milestone.plan_id
                    WHERE plan.decision_project_id = p.id AND result.user_id = p.user_id) AS result_count,
                   p.updated_at
            FROM decision_projects p
            WHERE p.user_id = #{userId} AND p.status <> 'archived'
            ORDER BY p.is_current DESC, p.updated_at DESC, p.id DESC LIMIT 1
            """)
    ProjectSnapshot currentProject(@Param("userId") long userId);

    @Select("""
            SELECT id, plan_id, week_no, status, updated_at
            FROM weekly_reviews WHERE user_id = #{userId}
            ORDER BY updated_at DESC, id DESC LIMIT 1
            """)
    ReviewSnapshot latestReview(@Param("userId") long userId);

    @Select("""
            SELECT
              COALESCE(SUM(CASE WHEN t.deleted = 0
                  AND t.status IN ('todo', 'in_progress', 'deferred')
                  AND t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP THEN 1 ELSE 0 END), 0) AS overdue_task_count,
              COALESCE(SUM(CASE WHEN t.deleted = 0 AND t.status = 'deferred' THEN 1 ELSE 0 END), 0) AS deferred_task_count,
              COALESCE(SUM(CASE WHEN t.deleted = 0 AND t.status = 'completed'
                  AND NOT EXISTS (SELECT 1 FROM task_results result WHERE result.task_id = t.id) THEN 1 ELSE 0 END), 0)
                  AS completed_without_evidence_count,
              (SELECT COUNT(1) FROM task_results result
               WHERE result.user_id = #{userId} AND result.created_at >= #{recentSince})
                  AS recent_result_count
            FROM path_plans p
            JOIN path_plan_milestones m ON m.plan_id = p.id
            JOIN path_plan_tasks t ON t.milestone_id = m.id
            WHERE p.user_id = #{userId} AND p.status = 'active' AND p.plan_type = 'action'
            """)
    ExecutionRiskSnapshot executionRisk(
            @Param("userId") long userId,
            @Param("recentSince") LocalDateTime recentSince
    );

    @Select("""
            SELECT id, request_id, user_id, agent_type, model_name, status,
                   input_json, output_json, error_message, latency_ms, started_at, finished_at
            FROM agent_runs
            WHERE user_id = #{userId} AND status = 'success'
              AND agent_type IN ('chat', 'decision_coach', 'job_comparison', 'action_coach', 'weekly_review')
            ORDER BY finished_at DESC, id DESC
            LIMIT 1
            """)
    AgentRunRecord latestSuccessfulAgentRun(@Param("userId") long userId);
}
