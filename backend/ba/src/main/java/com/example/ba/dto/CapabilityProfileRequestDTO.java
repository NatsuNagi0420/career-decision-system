/**
 * 文件说明：能力画像/职业测评请求 DTO。
 * 职责：封装用户基础信息、目标岗位意向、技能经历、问卷答案等数据，
 *       作为生成能力画像与职业路径规划的大模型入参结构。
 */
package com.example.ba.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class CapabilityProfileRequestDTO {
    private Long userId;

    private Integer age;
    private String education;
    private List<Integer> tendencyAnswers;
    private List<Integer> mbtiAnswers;

    private Basic basic;
    private Target target;
    private List<String> skills;
    private List<String> certificates;
    private List<Experience> experiences;
    private List<Integer> values;
    private String mbtiResult;

    private Links links;
    private Map<String, Object> questionnaireAnswers;

    @Data
    public static class Basic {
        private String name;
        private String email;
        private String school;
        private String major;
        private String grade;
        private String city;
    }

    @Data
    public static class Target {
        private String role;
        private String jobType;
        private List<String> cities;
        private String salary;
        private String availableAt;
        private String avoid;
    }

    @Data
    public static class Links {
        private String github;
        private String portfolio;
    }

    @Data
    public static class Experience {
        private String title;
        private String desc;
    }
}
