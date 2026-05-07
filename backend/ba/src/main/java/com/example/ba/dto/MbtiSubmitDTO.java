/**
 * 文件说明：MBTI 测评提交请求 DTO。
 * 职责：承载用户在 MBTI 测评中对各题目的作答结果，用于计算性格类型。
 */
package com.example.ba.dto;

import lombok.Data;
import java.util.Map;

@Data
public class MbtiSubmitDTO {
    private Long userId;
    // Map<QuestionID, OptionCode>
    private Map<Integer, String> answers;
}
