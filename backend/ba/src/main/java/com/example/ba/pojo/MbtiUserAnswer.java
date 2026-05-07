/**
 * 文件说明：MBTI 用户答题记录实体类。
 * 职责：记录用户在某次 MBTI 测评中的作答明细，包括题目、选项和得分维度等信息。
 */
package com.example.ba.pojo;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MbtiUserAnswer {
    private Long id;
    private Long userId;
    private String testNo;
    private Integer qId;
    private String optCode;
    private String scoreCode;
    private LocalDateTime createTime;
}
