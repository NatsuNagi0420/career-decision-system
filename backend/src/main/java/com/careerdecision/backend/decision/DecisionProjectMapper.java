package com.careerdecision.backend.decision;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface DecisionProjectMapper {
    @Insert("""
            INSERT INTO decision_projects (
              user_id, title, question, decision_deadline, background, trigger_reason,
              priorities_json, must_haves_json, deal_breakers_json, status, current_stage, is_current
            ) VALUES (
              #{userId}, #{title}, #{question}, #{decisionDeadline}, #{background}, #{triggerReason},
              #{prioritiesJson}, #{mustHavesJson}, #{dealBreakersJson}, 'clarifying', 'clarify', 1
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertProject(DecisionProjectEntity entity);

    @Update("""
            <script>
            UPDATE decision_projects
            SET title = #{title}, question = #{question}, decision_deadline = #{decisionDeadline},
                background = #{background}, trigger_reason = #{triggerReason},
                priorities_json = #{prioritiesJson}, must_haves_json = #{mustHavesJson},
                deal_breakers_json = #{dealBreakersJson}, version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status != 'archived'
            <if test="version != null">AND version = #{version}</if>
            </script>
            """)
    int updateProject(DecisionProjectEntity entity);

    @Update("""
            UPDATE decision_projects
            SET is_current = 0, version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = #{userId} AND is_current = 1 AND status <> 'archived'
            """)
    int clearCurrent(@Param("userId") long userId);

    @Update("""
            UPDATE decision_projects
            SET is_current = 0, version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = #{userId} AND id <> #{id}
              AND is_current = 1 AND status <> 'archived'
            """)
    int clearCurrentExcept(@Param("userId") long userId, @Param("id") long id);

    @Update("""
            UPDATE decision_projects SET is_current = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status != 'archived'
            """)
    int markCurrent(@Param("userId") long userId, @Param("id") long id);

    @Select("""
            SELECT p.id, p.user_id, p.title, p.question, p.decision_deadline, p.background,
                   p.trigger_reason, p.priorities_json, p.must_haves_json, p.deal_breakers_json,
                   p.status, p.current_stage, p.is_current, p.version,
                   p.decided_at, p.created_at, p.updated_at,
                   (SELECT COUNT(1) FROM decision_candidates c
                    WHERE c.project_id = p.id AND c.status = 'active') AS candidate_count,
                   (SELECT COUNT(1) FROM decision_project_job_samples s
                    WHERE s.project_id = p.id) AS job_sample_count,
                   (SELECT t.target_name FROM decision_targets t
                    WHERE t.project_id = p.id AND t.target_type = 'primary' LIMIT 1) AS primary_target
            FROM decision_projects p
            WHERE p.user_id = #{userId} AND p.status <> 'archived'
            ORDER BY p.is_current DESC, p.updated_at DESC, p.id DESC
            """)
    List<DecisionProjectEntity> listProjects(@Param("userId") long userId);

    @Select("""
            SELECT id, user_id, title, question, decision_deadline, background,
                   trigger_reason, priorities_json, must_haves_json, deal_breakers_json,
                   status, current_stage, is_current, version,
                   decided_at, created_at, updated_at
            FROM decision_projects
            WHERE id = #{id} AND user_id = #{userId} AND status <> 'archived'
            LIMIT 1
            """)
    DecisionProjectEntity findProject(@Param("userId") long userId, @Param("id") long id);

    @Update("""
            UPDATE decision_projects
            SET status = #{status}, current_stage = #{stage}, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status <> 'archived'
            """)
    int updateStage(
            @Param("userId") long userId,
            @Param("id") long id,
            @Param("stage") String stage,
            @Param("status") String status
    );

    @Update("""
            UPDATE decision_projects
            SET status = 'decided', current_stage = 'target', decided_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status <> 'archived'
            """)
    int markDecided(@Param("userId") long userId, @Param("id") long id);

    @Update("""
            UPDATE decision_projects
            SET status = 'archived', is_current = 0, archived_at = CURRENT_TIMESTAMP,
                version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status <> 'archived'
              AND version = #{expectedVersion}
            """)
    int archiveProject(
            @Param("userId") long userId,
            @Param("id") long id,
            @Param("expectedVersion") int expectedVersion
    );

    @Select("""
            SELECT COUNT(1) FROM career_directions
            WHERE id = #{directionId} AND status = 'active'
              AND (owner_user_id IS NULL OR owner_user_id = #{userId})
            """)
    int countDirection(@Param("userId") long userId, @Param("directionId") long directionId);

    @Select("""
            SELECT COUNT(1) FROM decision_candidates
            WHERE project_id = #{projectId} AND status = 'active'
            """)
    int countCandidates(@Param("projectId") long projectId);

    @Select("""
            SELECT COALESCE(MAX(sort_order), -1) + 1 FROM decision_candidates
            WHERE project_id = #{projectId}
            """)
    int nextCandidateSort(@Param("projectId") long projectId);

    @Insert("""
            INSERT INTO decision_candidates (
              project_id, direction_id, name, source_type, recommendation_reason,
              opposing_factors, uncertainties, validation_actions_json, sort_order
            ) VALUES (
              #{projectId}, #{directionId}, #{name}, #{sourceType}, #{recommendationReason},
              #{opposingFactors}, #{uncertainties}, #{validationActionsJson}, #{sortOrder}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertCandidate(DecisionCandidateEntity entity);

    @Update("""
            UPDATE decision_candidates
            SET direction_id = #{directionId}, name = #{name},
                recommendation_reason = #{recommendationReason}, opposing_factors = #{opposingFactors},
                uncertainties = #{uncertainties}, validation_actions_json = #{validationActionsJson},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND project_id = #{projectId} AND status = 'active'
            """)
    int updateCandidate(DecisionCandidateEntity entity);

    @Update("""
            UPDATE decision_candidates SET status = 'excluded', updated_at = CURRENT_TIMESTAMP
            WHERE id = #{candidateId} AND project_id = #{projectId} AND status = 'active'
              AND NOT EXISTS (SELECT 1 FROM decision_targets t WHERE t.candidate_id = #{candidateId})
            """)
    int excludeCandidate(@Param("projectId") long projectId, @Param("candidateId") long candidateId);

    @Select("""
            SELECT id, project_id, direction_id, name, source_type, recommendation_reason,
                   opposing_factors, uncertainties, validation_actions_json, sort_order, updated_at
            FROM decision_candidates
            WHERE project_id = #{projectId} AND status = 'active'
            ORDER BY sort_order, id
            """)
    List<DecisionCandidateEntity> findCandidates(@Param("projectId") long projectId);

    @Select("""
            SELECT id, project_id, direction_id, name, source_type, recommendation_reason,
                   opposing_factors, uncertainties, validation_actions_json, sort_order, updated_at
            FROM decision_candidates
            WHERE id = #{candidateId} AND project_id = #{projectId} AND status = 'active'
            LIMIT 1
            """)
    DecisionCandidateEntity findCandidate(
            @Param("projectId") long projectId,
            @Param("candidateId") long candidateId
    );

    @Select("""
            SELECT COUNT(1) FROM personal_evidence
            WHERE id = #{evidenceId} AND user_id = #{userId} AND visibility = 'visible'
            """)
    int countPersonalEvidence(@Param("userId") long userId, @Param("evidenceId") long evidenceId);

    @Select("SELECT COUNT(1) FROM jobs WHERE id = #{jobId} AND status = 'active'")
    int countActiveJob(@Param("jobId") long jobId);

    @Select("""
            SELECT COUNT(1) FROM decision_project_job_samples
            WHERE project_id = #{projectId} AND job_id = #{jobId}
            """)
    int countJobSample(@Param("projectId") long projectId, @Param("jobId") long jobId);

    @Select("""
            SELECT COUNT(1) FROM decision_project_job_samples
            WHERE project_id = #{projectId} AND candidate_id = #{candidateId}
            """)
    int countCandidateJobSamples(
            @Param("projectId") long projectId,
            @Param("candidateId") long candidateId
    );

    @Insert("""
            INSERT INTO decision_project_job_samples (project_id, candidate_id, job_id, note)
            VALUES (#{projectId}, #{candidateId}, #{jobId}, #{note})
            """)
    void insertJobSample(
            @Param("projectId") long projectId,
            @Param("candidateId") long candidateId,
            @Param("jobId") long jobId,
            @Param("note") String note
    );

    @Delete("""
            DELETE FROM decision_project_job_samples
            WHERE id = #{sampleId} AND project_id = #{projectId}
            """)
    int deleteJobSample(@Param("projectId") long projectId, @Param("sampleId") long sampleId);

    @Select("""
            SELECT s.id, s.candidate_id, s.job_id, j.title, j.company, j.city,
                   j.salary_text, s.note, s.created_at
            FROM decision_project_job_samples s
            JOIN jobs j ON j.id = s.job_id
            WHERE s.project_id = #{projectId}
            ORDER BY s.created_at, s.id
            """)
    List<DecisionJobSampleRow> findJobSamples(@Param("projectId") long projectId);

    @Insert("""
            INSERT INTO decision_evidence (
              project_id, candidate_id, personal_evidence_id, title, detail,
              source_type, source_ref, credibility, stance
            ) VALUES (
              #{projectId}, #{candidateId}, #{personalEvidenceId}, #{title}, #{detail},
              #{sourceType}, #{sourceRef}, #{credibility}, #{stance}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertEvidence(DecisionEvidenceEntity entity);

    @Update("""
            UPDATE decision_evidence
            SET candidate_id = #{candidateId}, personal_evidence_id = #{personalEvidenceId},
                title = #{title}, detail = #{detail}, source_type = #{sourceType},
                source_ref = #{sourceRef}, credibility = #{credibility}, stance = #{stance},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND project_id = #{projectId} AND status = 'active'
            """)
    int updateEvidence(DecisionEvidenceEntity entity);

    @Update("""
            UPDATE decision_evidence SET status = 'hidden', updated_at = CURRENT_TIMESTAMP
            WHERE id = #{evidenceId} AND project_id = #{projectId} AND status = 'active'
            """)
    int hideEvidence(@Param("projectId") long projectId, @Param("evidenceId") long evidenceId);

    @Select("""
            SELECT id, project_id, candidate_id, personal_evidence_id, title, detail,
                   source_type, source_ref, credibility, stance, updated_at
            FROM decision_evidence
            WHERE project_id = #{projectId} AND status = 'active'
            ORDER BY updated_at DESC, id DESC
            """)
    List<DecisionEvidenceEntity> findEvidence(@Param("projectId") long projectId);

    @Select("""
            SELECT COUNT(1) FROM decision_evidence
            WHERE id = #{evidenceId} AND project_id = #{projectId} AND status = 'active'
            """)
    int countEvidence(@Param("projectId") long projectId, @Param("evidenceId") long evidenceId);

    @Select("""
            SELECT COUNT(1) FROM decision_evidence
            WHERE project_id = #{projectId} AND status = 'active'
              AND (candidate_id IS NULL OR candidate_id = #{candidateId})
            """)
    int countCandidateEvidence(
            @Param("projectId") long projectId,
            @Param("candidateId") long candidateId
    );

    @Insert("""
            INSERT INTO comparison_criteria (project_id, code, name, description, importance, sort_order)
            VALUES (#{projectId}, #{code}, #{name}, #{description}, #{importance}, #{sortOrder})
            """)
    void insertCriterion(
            @Param("projectId") long projectId,
            @Param("code") String code,
            @Param("name") String name,
            @Param("description") String description,
            @Param("importance") int importance,
            @Param("sortOrder") int sortOrder
    );

    @Select("""
            SELECT COALESCE(MAX(sort_order), -1) + 1 FROM comparison_criteria
            WHERE project_id = #{projectId}
            """)
    int nextCriterionSort(@Param("projectId") long projectId);

    @Update("""
            UPDATE comparison_criteria
            SET name = #{name}, description = #{description}, importance = #{importance},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{criterionId} AND project_id = #{projectId}
            """)
    int updateCriterion(
            @Param("projectId") long projectId,
            @Param("criterionId") long criterionId,
            @Param("name") String name,
            @Param("description") String description,
            @Param("importance") int importance
    );

    @Delete("""
            DELETE FROM comparison_criteria
            WHERE id = #{criterionId} AND project_id = #{projectId}
            """)
    int deleteCriterion(@Param("projectId") long projectId, @Param("criterionId") long criterionId);

    @Select("""
            SELECT id, code, name, description, importance, sort_order
            FROM comparison_criteria WHERE project_id = #{projectId}
            ORDER BY sort_order, id
            """)
    List<ComparisonCriterionRow> findCriteria(@Param("projectId") long projectId);

    @Select("""
            SELECT COUNT(1) FROM comparison_criteria
            WHERE id = #{criterionId} AND project_id = #{projectId}
            """)
    int countCriterion(@Param("projectId") long projectId, @Param("criterionId") long criterionId);

    @Select("""
            SELECT id, criterion_id, candidate_id, score, assessment, evidence_refs_json,
                   uncertainty, validation_action, updated_at
            FROM comparison_results WHERE criterion_id = #{criterionId}
            ORDER BY candidate_id
            """)
    List<ComparisonResultEntity> findComparisonResults(@Param("criterionId") long criterionId);

    @Select("""
            SELECT id, criterion_id, candidate_id, score, assessment, evidence_refs_json,
                   uncertainty, validation_action, updated_at
            FROM comparison_results
            WHERE criterion_id = #{criterionId} AND candidate_id = #{candidateId}
            LIMIT 1
            """)
    ComparisonResultEntity findComparisonResult(
            @Param("criterionId") long criterionId,
            @Param("candidateId") long candidateId
    );

    @Select("""
            SELECT COUNT(1)
            FROM comparison_results result
            JOIN comparison_criteria criterion ON criterion.id = result.criterion_id
            WHERE criterion.project_id = #{projectId}
              AND result.candidate_id = #{candidateId}
              AND (
                NULLIF(TRIM(result.assessment), '') IS NOT NULL
                OR NULLIF(TRIM(result.uncertainty), '') IS NOT NULL
                OR NULLIF(TRIM(result.validation_action), '') IS NOT NULL
              )
            """)
    int countCandidateComparisons(
            @Param("projectId") long projectId,
            @Param("candidateId") long candidateId
    );

    @Insert("""
            INSERT INTO comparison_results (
              criterion_id, candidate_id, score, assessment, evidence_refs_json,
              uncertainty, validation_action
            ) VALUES (
              #{criterionId}, #{candidateId}, #{score}, #{assessment}, #{evidenceRefsJson},
              #{uncertainty}, #{validationAction}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertComparisonResult(ComparisonResultEntity entity);

    @Update("""
            UPDATE comparison_results
            SET score = #{score}, assessment = #{assessment}, evidence_refs_json = #{evidenceRefsJson},
                uncertainty = #{uncertainty}, validation_action = #{validationAction},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id}
            """)
    int updateComparisonResult(ComparisonResultEntity entity);

    @Delete("DELETE FROM decision_targets WHERE project_id = #{projectId}")
    int deleteTargets(@Param("projectId") long projectId);

    @Insert("""
            INSERT INTO decision_targets (
              user_id, project_id, candidate_id, target_type, target_name,
              decision_reason, main_risks, review_date
            ) VALUES (
              #{userId}, #{projectId}, #{candidateId}, #{targetType}, #{targetName},
              #{decisionReason}, #{mainRisks}, #{reviewDate}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertTarget(DecisionTargetEntity entity);

    @Select("""
            SELECT id, user_id, project_id, candidate_id, target_type, target_name,
                   decision_reason, main_risks, review_date, confirmed_at
            FROM decision_targets WHERE project_id = #{projectId}
            ORDER BY CASE WHEN target_type = 'primary' THEN 0 ELSE 1 END
            """)
    List<DecisionTargetEntity> findTargets(@Param("projectId") long projectId);

    @Select("""
            SELECT COUNT(1) FROM decision_targets
            WHERE id = #{targetId} AND project_id = #{projectId} AND user_id = #{userId}
            """)
    int countTarget(
            @Param("userId") long userId,
            @Param("projectId") long projectId,
            @Param("targetId") long targetId
    );

    @Insert("""
            INSERT INTO target_confidence_feedback (
              user_id, project_id, target_id, trend, reason, request_id
            ) VALUES (
              #{userId}, #{projectId}, #{targetId}, #{trend}, #{reason}, #{requestId}
            )
            """)
    void insertConfidenceFeedback(
            @Param("userId") long userId,
            @Param("projectId") long projectId,
            @Param("targetId") long targetId,
            @Param("trend") String trend,
            @Param("reason") String reason,
            @Param("requestId") String requestId
    );

    @Select("""
            SELECT id, project_id, target_id, trend, reason, request_id, created_at
            FROM target_confidence_feedback
            WHERE user_id = #{userId} AND request_id = #{requestId}
            LIMIT 1
            """)
    DecisionProjectModels.ConfidenceFeedbackResponse findConfidenceFeedback(
            @Param("userId") long userId,
            @Param("requestId") String requestId
    );

    @Update("""
            UPDATE user_profiles
            SET target_role = #{targetName}, profile_version = profile_version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = #{userId}
            """)
    int updateLegacyTarget(@Param("userId") long userId, @Param("targetName") String targetName);

    @Insert("""
            INSERT INTO user_profiles (user_id, target_role, target_cities, skills, certificates,
                                       experiences, values_json, raw_profile)
            VALUES (#{userId}, #{targetName}, '[]', '[]', '[]', '[]', '[]', '{}')
            """)
    void insertLegacyTarget(@Param("userId") long userId, @Param("targetName") String targetName);

    @Update("""
            <script>
            UPDATE decision_projects SET version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND status != 'archived'
            <if test="expectedVersion != null">AND version = #{expectedVersion}</if>
            </script>
            """)
    int touchProject(
            @Param("userId") long userId,
            @Param("id") long id,
            @Param("expectedVersion") Integer expectedVersion
    );
}
