/**
 * 文件说明：MBTI 测评提交请求 DTO。
 * 职责：承载用户在 MBTI 测评中对各题目的作答结果，用于计算性格类型。
 */
package com.example.ba.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.util.Map;

@Data
public class MbtiSubmitDTO {
    @NotNull(message = "用户ID不能为空")
    private Long userId;

    @NotEmpty(message = "答案不能为空")
    // Map<QuestionID, OptionCode>
    private Map<Integer, String> answers;
}
