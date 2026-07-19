package com.careerdecision.backend.review;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface WeeklyReviewMapper {
    @Select("""
            SELECT decision_project_id FROM path_plans
            WHERE id = #{planId} AND user_id = #{userId}
              AND plan_type IN ('action', 'validation')
              AND status <> 'archived' LIMIT 1
            """)
    Long findOwnedProjectId(@Param("userId") long userId, @Param("planId") long planId);

    @Select("""
            <script>
            SELECT id, user_id, plan_id, project_id, week_no, completed_summary,
                   evidence_summary, difficulties, next_week_minutes, confidence_trend,
                   confidence_reason, adjustment_proposal_json, status, request_id, submitted_at,
                   created_at, updated_at
            FROM weekly_reviews
            WHERE user_id = #{userId}
            <if test="planId != null">AND plan_id = #{planId}</if>
            ORDER BY updated_at DESC, id DESC
            </script>
            """)
    List<WeeklyReviewEntity> findAll(@Param("userId") long userId, @Param("planId") Long planId);

    @Select("""
            SELECT id, user_id, plan_id, project_id, week_no, completed_summary,
                   evidence_summary, difficulties, next_week_minutes, confidence_trend,
                   confidence_reason, adjustment_proposal_json, status, request_id, submitted_at,
                   created_at, updated_at
            FROM weekly_reviews WHERE id = #{id} AND user_id = #{userId} LIMIT 1
            """)
    WeeklyReviewEntity findById(@Param("userId") long userId, @Param("id") long id);

    @Select("""
            SELECT id, user_id, plan_id, project_id, week_no, completed_summary,
                   evidence_summary, difficulties, next_week_minutes, confidence_trend,
                   confidence_reason, adjustment_proposal_json, status, request_id, submitted_at,
                   created_at, updated_at
            FROM weekly_reviews
            WHERE user_id = #{userId} AND plan_id = #{planId} AND week_no = #{weekNo} LIMIT 1
            """)
    WeeklyReviewEntity findByPlanWeek(
            @Param("userId") long userId,
            @Param("planId") long planId,
            @Param("weekNo") int weekNo
    );

    @Select("""
            SELECT id, user_id, plan_id, project_id, week_no, completed_summary,
                   evidence_summary, difficulties, next_week_minutes, confidence_trend,
                   confidence_reason, adjustment_proposal_json, status, request_id, submitted_at,
                   created_at, updated_at
            FROM weekly_reviews
            WHERE user_id = #{userId} AND request_id = #{requestId} LIMIT 1
            """)
    WeeklyReviewEntity findByRequestId(
            @Param("userId") long userId,
            @Param("requestId") String requestId
    );

    @Insert("""
            INSERT INTO weekly_reviews (
              user_id, plan_id, project_id, week_no, completed_summary, evidence_summary,
              difficulties, next_week_minutes, confidence_trend, confidence_reason,
              adjustment_proposal_json, status, request_id
            ) VALUES (
              #{userId}, #{planId}, #{projectId}, #{weekNo}, #{completedSummary}, #{evidenceSummary},
              #{difficulties}, #{nextWeekMinutes}, #{confidenceTrend}, #{confidenceReason},
              #{adjustmentProposalJson}, 'draft', #{requestId}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(WeeklyReviewEntity entity);

    @Update("""
            UPDATE weekly_reviews
            SET completed_summary = #{completedSummary}, evidence_summary = #{evidenceSummary},
                difficulties = #{difficulties}, next_week_minutes = #{nextWeekMinutes},
                confidence_trend = #{confidenceTrend}, confidence_reason = #{confidenceReason},
                adjustment_proposal_json = #{adjustmentProposalJson},
                request_id = COALESCE(request_id, #{requestId}), updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status = 'draft'
            """)
    int update(WeeklyReviewEntity entity);

    @Update("""
            UPDATE weekly_reviews SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status = 'draft'
            """)
    int submit(@Param("userId") long userId, @Param("id") long id);

    @Update("""
            UPDATE weekly_reviews SET status = 'adjustments_applied', updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status = 'submitted'
            """)
    int markApplied(@Param("userId") long userId, @Param("id") long id);

    @Delete("DELETE FROM weekly_reviews WHERE id = #{id} AND user_id = #{userId} AND status = 'draft'")
    int deleteDraft(@Param("userId") long userId, @Param("id") long id);
}
