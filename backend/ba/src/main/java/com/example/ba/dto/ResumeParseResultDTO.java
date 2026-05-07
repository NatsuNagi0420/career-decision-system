/**
 * 文件说明：简历解析结果 DTO。
 * 职责：承载后端对上传简历进行解析后得到的结构化信息，用于前端自动回填综合信息录入表单。
 */
package com.example.ba.dto;

import lombok.Data;

import java.util.List;

@Data
public class ResumeParseResultDTO {

    @Data
    public static class BasicInfo {
        /** 姓名 */
        private String name;
        /** 电话 */
        private String phone;
        /** 邮箱 */
        private String email;
        /** 性别 */
        private String gender;
        /** 年龄 */
        private Integer age;
        /** 学校 */
        private String school;
        /** 专业 */
        private String major;
    }


    @Data
    public static class TargetInfo {
        /** 意向岗位 */
        private String intentionPosition;
        /** 意向城市 */
        private List<String> intentionCities;
        /** 期望薪资 */
        private String expectedSalary;
        /** 求职类型 */
        private String jobType;
    }

    @Data
    public static class EducationItem {
        /** 教育经历单条，如“2019-2023 XX大学 计算机科学与技术 本科” */
        private String text;
    }

    @Data
    public static class WorkExperienceItem {
        /** 工作/实习经历单条标题（公司/项目名） */
        private String title;
        /** 具体描述 */
        private String description;
    }

    /** 基础信息：姓名、电话、邮箱、性别、年龄 */
    private BasicInfo basic;

    /** 求职目标相关：意向岗位、城市、薪资、求职类型 */
    private TargetInfo target;

    /** 教育经历列表 */
    private List<EducationItem> educations;

    /** 主修课程列表 */
    private List<String> mainCourses;

    /** 技能列表 */
    private List<String> skills;

    /** 证书列表 */
    private List<String> certificates;

    /** 兼容旧字段：技能证书（混合列表） */
    private List<String> skillCertificates;

    /** 工作/实习经历 */
    private List<WorkExperienceItem> workExperiences;

    /** 自我评价 */
    private String selfEvaluation;
}

