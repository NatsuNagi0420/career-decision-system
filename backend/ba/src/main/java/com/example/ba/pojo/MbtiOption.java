/**
 * 文件说明：MBTI 题目选项实体类。
 * 职责：映射 mbti_option 表中单个选项的内容、编码及评分信息。
 */
package com.example.ba.pojo;

import lombok.Data;

@Data
public class MbtiOption {
    private Integer id;
    private Integer qId;
    private String optCode;
    private String optContent;
    private String scoreCode;
    private Integer score;
}
