package com.careerdecision.backend.assessment.mbti;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface MbtiMapper {
    @Select("""
            SELECT id, content
            FROM assessment_questions
            WHERE assessment_code = 'MBTI'
              AND status = 'active'
            ORDER BY sort_order, id
            """)
    List<MbtiQuestionRecord> findQuestions();

    @Select("""
            SELECT question_id, option_code, content, score_dimension, score_value
            FROM assessment_options
            WHERE question_id = #{questionId}
            ORDER BY sort_order, id
            """)
    List<MbtiOptionRecord> findOptions(@Param("questionId") long questionId);

    @Select("""
            SELECT id, content
            FROM assessment_questions
            WHERE id = #{questionId}
              AND assessment_code = 'MBTI'
              AND status = 'active'
            LIMIT 1
            """)
    MbtiQuestionRecord findQuestion(@Param("questionId") long questionId);

    @Select("""
            SELECT opt.question_id, opt.option_code, opt.content, opt.score_dimension, opt.score_value
            FROM assessment_options opt
            JOIN assessment_questions question ON question.id = opt.question_id
            WHERE opt.question_id = #{questionId}
              AND LOWER(opt.option_code) = LOWER(#{optionCode})
              AND question.assessment_code = 'MBTI'
              AND question.status = 'active'
            LIMIT 1
            """)
    MbtiOptionRecord findOption(
            @Param("questionId") long questionId,
            @Param("optionCode") String optionCode
    );

    @Select("""
            SELECT code_a, code_b, tie_rule
            FROM mbti_dimensions
            ORDER BY id
            """)
    List<MbtiDimensionRecord> findDimensions();

    @Select("""
            SELECT description
            FROM mbti_personalities
            WHERE type_code = #{type}
            LIMIT 1
            """)
    String findDescription(@Param("type") String type);

    @Select("""
            SELECT COUNT(1)
            FROM users
            WHERE id = #{userId}
              AND deleted = 0
            """)
    int countActiveUser(@Param("userId") long userId);

    @Insert("""
            INSERT INTO assessment_sessions
              (user_id, assessment_code, test_no, status, result_code, score_json, result_json, submitted_at)
            VALUES
              (#{userId}, #{assessmentCode}, #{testNo}, #{status}, #{resultCode}, #{scoreJson}, #{resultJson}, CURRENT_TIMESTAMP)
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertSession(MbtiSessionRecord session);

    @Insert("""
            INSERT INTO assessment_answers
              (session_id, question_id, option_code, score_dimension, score_value)
            VALUES
              (#{sessionId}, #{questionId}, #{optionCode}, #{scoreDimension}, #{scoreValue})
            """)
    void insertAnswer(
            @Param("sessionId") long sessionId,
            @Param("questionId") long questionId,
            @Param("optionCode") String optionCode,
            @Param("scoreDimension") String scoreDimension,
            @Param("scoreValue") int scoreValue
    );
}
