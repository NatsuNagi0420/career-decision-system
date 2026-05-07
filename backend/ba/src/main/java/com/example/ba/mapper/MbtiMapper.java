/**
 * 文件说明：MBTI 题库与答题记录 Mapper。
 * 职责：负责 MBTI 题目与选项的查询，以及用户答题记录的插入和选项得分信息的查询。
 */
package com.example.ba.mapper;

import com.example.ba.pojo.MbtiOption;
import com.example.ba.pojo.MbtiQuestion;
import com.example.ba.pojo.MbtiUserAnswer;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface MbtiMapper {

    @Select("SELECT * FROM mbti_question ORDER BY sort ASC")
    List<MbtiQuestion> findAllQuestions();

    @Select("SELECT * FROM mbti_option WHERE q_id = #{qId}")
    List<MbtiOption> findOptionsByQuestionId(Integer qId);

    @Select("SELECT * FROM mbti_option")
    List<MbtiOption> findAllOptions();

    @Insert("INSERT INTO mbti_user_answer(user_id, test_no, q_id, opt_code, score_code, create_time) " +
            "VALUES(#{userId}, #{testNo}, #{qId}, #{optCode}, #{scoreCode}, NOW())")
    void insertAnswer(MbtiUserAnswer answer);

    @Select("SELECT * FROM mbti_option WHERE q_id = #{qId} AND opt_code = #{optCode}")
    MbtiOption findOptionByQuestionAndCode(@Param("qId") Integer qId, @Param("optCode") String optCode);
}
