package com.careerdecision.backend.job;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class JobDescriptionStructurerTest {
    private final JobDescriptionStructurer structurer = new JobDescriptionStructurer();

    @Test
    void extractsSectionsAndExplicitRequirementsWhileKeepingOriginalEvidence() {
        JobRecord job = new JobRecord();
        job.setId(42L);
        job.setDescription("""
                岗位职责：<br>
                1、建设业务接口与数据模型。<br>
                2、参与性能与稳定性治理。<br>
                任职要求：<br>
                1、本科及以上学历，计算机相关专业。<br>
                2、熟悉 Java 与关系型数据库。<br>
                发展路径：后端工程师 → 技术负责人。<br>
                面试重点：系统设计与项目复盘。<br>
                职位福利：<br>
                五险一金、年度体检。
                """);
        job.setEducation("本科及以上");
        job.setExperienceLevel("1-3年");

        List<JobRequirementItem> items = structurer.extract(job, List.of("Java", "Spring Boot"));

        assertThat(texts(items, "responsibility"))
                .contains("建设业务接口与数据模型。", "参与性能与稳定性治理。");
        assertThat(texts(items, "requirement"))
                .contains("本科及以上学历，计算机相关专业。", "熟悉 Java 与关系型数据库。");
        assertThat(texts(items, "education")).containsExactly("学历要求：本科及以上");
        assertThat(texts(items, "experience")).containsExactly("经验要求：1-3年");
        assertThat(texts(items, "skill")).contains("技能要求：Java", "技能要求：Spring Boot");
        assertThat(texts(items, "growth_path")).containsExactly("后端工程师 → 技术负责人。");
        assertThat(texts(items, "interview_focus")).containsExactly("系统设计与项目复盘。");
        assertThat(items).noneMatch(item -> item.originalText().contains("五险一金"));
        assertThat(items).allMatch(item -> item.extractorVersion().startsWith("jd-rule-v1-"));

        String displayText = structurer.displayText(job.getDescription());
        assertThat(displayText)
                .contains("岗位职责：", "建设业务接口与数据模型。", "任职要求：")
                .doesNotContain("<br>");
    }

    private List<String> texts(List<JobRequirementItem> items, String type) {
        return items.stream().filter(item -> type.equals(item.itemType()))
                .map(JobRequirementItem::originalText).toList();
    }
}
