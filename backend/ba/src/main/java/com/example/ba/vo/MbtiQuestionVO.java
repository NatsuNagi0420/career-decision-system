/**
 * 文件说明：带选项列表的 MBTI 题目视图对象。
 * 职责：在 MBTIQuestion 基础上组合对应选项列表，用于返回给前端展示完整一题内容。
 */
package com.example.ba.vo;

import com.example.ba.pojo.MbtiOption;
import com.example.ba.pojo.MbtiQuestion;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = false)
public class MbtiQuestionVO extends MbtiQuestion {
    private List<MbtiOption> options;
}
