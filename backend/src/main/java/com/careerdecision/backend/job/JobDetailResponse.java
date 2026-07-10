package com.careerdecision.backend.job;

import java.util.ArrayList;
import java.util.List;

public record JobDetailResponse(
        long id,
        String title,
        String company,
        String location,
        String direction,
        String salaryRange,
        String experienceLevel,
        String education,
        List<String> tags,
        String summary,
        List<String> responsibilities,
        List<String> requirements,
        List<String> growthPath,
        List<String> interviewFocus
) {
    static JobDetailResponse from(JobRecord job, List<String> tags) {
        List<String> immutableTags = displayTags(job, tags);
        return new JobDetailResponse(
                job.getId(),
                job.getTitle(),
                job.getCompany(),
                location(job),
                job.getDirection(),
                job.getSalaryText(),
                job.getExperienceLevel(),
                job.getEducation(),
                immutableTags,
                job.getDescription(),
                responsibilities(job),
                requirements(job, immutableTags),
                growthPath(job),
                interviewFocus(job, immutableTags)
        );
    }

    private static String location(JobRecord job) {
        if (job.getLocationText() != null && !job.getLocationText().isBlank()) {
            return job.getLocationText();
        }
        return job.getCity();
    }

    private static List<String> responsibilities(JobRecord job) {
        return List.of(
                "围绕" + valueOrDefault(job.getDirection(), "目标岗位") + "场景完成核心业务交付",
                "结合岗位数据、用户反馈和 AI 能力优化职业规划体验",
                "与产品、技术和运营协作，推动功能从需求到上线闭环"
        );
    }

    private static List<String> requirements(JobRecord job, List<String> tags) {
        String skills = tags.isEmpty() ? "相关专业能力" : String.join("、", tags);
        return List.of(
                "熟悉" + skills + "，能在真实业务场景中独立解决问题",
                "具备" + valueOrDefault(job.getExperienceLevel(), "相关") + "经验，理解岗位交付标准",
                "学历要求：" + valueOrDefault(job.getEducation(), "不限")
        );
    }

    private static List<String> growthPath(JobRecord job) {
        return List.of(
                "补齐" + valueOrDefault(job.getDirection(), "职业方向") + "所需的核心能力和项目经验",
                "参与跨模块协作，理解职业规划产品完整链路",
                "成长为该方向的核心执行者或专业负责人"
        );
    }

    private static List<String> interviewFocus(JobRecord job, List<String> tags) {
        List<String> focus = tags.stream()
                .limit(4)
                .map(tag -> tag + " 设计")
                .toList();
        if (!focus.isEmpty()) {
            return focus;
        }
        return List.of(
                valueOrDefault(job.getDirection(), "岗位") + "理解",
                "项目经验复盘",
                "业务问题拆解",
                "协作与沟通"
        );
    }

    private static String valueOrDefault(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value;
    }

    private static List<String> displayTags(JobRecord job, List<String> tags) {
        if (!tags.isEmpty()) {
            return List.copyOf(tags);
        }
        List<String> fallback = new ArrayList<>();
        addIfPresent(fallback, job.getDirection());
        addIfPresent(fallback, job.getIndustry());
        addIfPresent(fallback, job.getCompanySize());
        addIfPresent(fallback, job.getFinancingStage());
        return List.copyOf(fallback);
    }

    private static void addIfPresent(List<String> values, String value) {
        if (value != null && !value.isBlank() && !values.contains(value)) {
            values.add(value);
        }
    }
}
