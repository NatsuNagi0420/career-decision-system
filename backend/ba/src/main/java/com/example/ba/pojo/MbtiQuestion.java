/**
 * 文件说明：MBTI 题目实体类。
 * 职责：映射 mbti_question 表中每道题的题干、分区及排序信息。
 */
package com.example.ba.pojo;

import lombok.Data;

@Data
public class MbtiQuestion {
    private Integer id;
    private Integer section;
    private String qType;
    private String content;
    private Integer sort;
}
