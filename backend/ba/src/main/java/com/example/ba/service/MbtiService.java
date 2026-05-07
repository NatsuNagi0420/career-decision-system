/**
 * 文件说明：MBTI 测评业务接口。
 * 职责：定义获取 MBTI 题目及选项、保存用户作答并计算 MBTI 类型等核心方法。
 */
package com.example.ba.service;

import com.example.ba.dto.MbtiSubmitDTO;
import com.example.ba.vo.MbtiQuestionVO;
import java.util.List;

public interface MbtiService {
    List<MbtiQuestionVO> getAllQuestionsWithOptions();
    
    /**
     * 保存测评结果并返回 MBTI 类型
     */
    String submitTest(MbtiSubmitDTO submitDTO);
}
