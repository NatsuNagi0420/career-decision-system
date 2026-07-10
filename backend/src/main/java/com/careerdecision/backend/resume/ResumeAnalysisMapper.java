package com.careerdecision.backend.resume;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ResumeAnalysisMapper {
    @Insert("""
            INSERT INTO resumes (user_id, file_name, content_hash, resume_text, parsed_json)
            VALUES (#{userId}, #{fileName}, #{contentHash}, #{resumeText}, #{parsedJson})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertResume(ResumeRecord record);

    @Insert("""
            INSERT INTO resume_analyses (
              resume_id, user_id, agent_run_id, target_role, score, ats_score, keyword_match, issues_json, suggestions_json
            )
            VALUES (
              #{resumeId}, #{userId}, #{agentRunId}, #{targetRole}, #{score}, #{atsScore}, #{keywordMatch}, #{issuesJson}, #{suggestionsJson}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertAnalysis(ResumeAnalysisRecord record);

    @Select("""
            SELECT a.id, a.resume_id, a.user_id, a.agent_run_id, a.target_role,
                   a.score, a.ats_score, a.keyword_match, a.issues_json, a.suggestions_json,
                   r.parsed_json, a.created_at
            FROM resume_analyses a
            LEFT JOIN resumes r ON r.id = a.resume_id
            WHERE a.user_id = #{userId}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT #{limit} OFFSET #{offset}
            """)
    List<ResumeAnalysisRecord> listAnalyses(
            @Param("userId") long userId,
            @Param("offset") int offset,
            @Param("limit") int limit
    );

    @Select("""
            SELECT a.id, a.resume_id, a.user_id, a.agent_run_id, a.target_role,
                   a.score, a.ats_score, a.keyword_match, a.issues_json, a.suggestions_json,
                   r.parsed_json, a.created_at
            FROM resume_analyses a
            LEFT JOIN resumes r ON r.id = a.resume_id
            WHERE a.id = #{analysisId}
              AND a.user_id = #{userId}
            LIMIT 1
            """)
    ResumeAnalysisRecord findAnalysis(@Param("userId") long userId, @Param("analysisId") long analysisId);

    @Delete("""
            DELETE FROM resume_analyses
            WHERE id = #{analysisId}
              AND user_id = #{userId}
            """)
    int deleteAnalysis(@Param("userId") long userId, @Param("analysisId") long analysisId);

    @Delete("""
            DELETE FROM resumes
            WHERE id = #{resumeId}
              AND user_id = #{userId}
            """)
    int deleteResume(@Param("userId") long userId, @Param("resumeId") long resumeId);
}
