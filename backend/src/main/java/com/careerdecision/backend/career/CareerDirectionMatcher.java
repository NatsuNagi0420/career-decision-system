package com.careerdecision.backend.career;

import com.careerdecision.backend.career.CareerDirectionJobModels.MatchDraft;
import com.careerdecision.backend.job.JobRecord;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component
public class CareerDirectionMatcher {
    public static final String RULE_VERSION = "direction-rule-v1";
    private static final Map<String, List<String>> CODE_ALIASES = Map.ofEntries(
            Map.entry("backend", List.of("后端", "服务端", "java", "spring", "golang", "go开发", "php", ".net")),
            Map.entry("frontend", List.of("前端", "web开发", "vue", "react", "typescript")),
            Map.entry("mobile", List.of("android", "ios", "移动端", "客户端", "flutter")),
            Map.entry("data-analysis", List.of("数据分析", "商业分析", "业务分析", "bi", "统计")),
            Map.entry("data-engineering", List.of("数据开发", "数据工程", "数仓", "etl", "大数据开发")),
            Map.entry("ai-algorithm", List.of("算法", "机器学习", "深度学习", "自然语言", "计算机视觉", "nlp")),
            Map.entry("ai-application", List.of("ai应用", "大模型", "llm", "智能体", "agent", "人工智能应用")),
            Map.entry("testing-quality", List.of("测试", "qa", "质量工程", "测试开发")),
            Map.entry("devops-security", List.of("运维", "sre", "云计算", "网络安全", "信息安全", "安全工程")),
            Map.entry("product-management", List.of("产品经理", "产品助理", "产品专员")),
            Map.entry("ux-design", List.of("用户体验", "交互设计", "ui设计", "ux", "视觉设计")),
            Map.entry("operations-growth", List.of("运营", "增长", "用户运营", "内容运营", "产品运营")),
            Map.entry("marketing-brand", List.of("市场", "品牌", "营销", "投放", "公关")),
            Map.entry("sales-bd", List.of("销售", "商务拓展", "商务经理", "bd", "客户经理")),
            Map.entry("customer-success", List.of("客户成功", "客服", "售后", "客户服务")),
            Map.entry("finance-accounting", List.of("财务", "会计", "审计", "税务", "出纳")),
            Map.entry("hr", List.of("人力资源", "招聘", "hr", "人才发展", "薪酬绩效")),
            Map.entry("legal-compliance", List.of("法务", "律师", "合规", "法律")),
            Map.entry("consulting-research", List.of("咨询", "行业研究", "战略研究", "研究顾问")),
            Map.entry("education-training", List.of("教师", "教育", "培训", "教研", "课程")),
            Map.entry("media-content", List.of("内容", "编辑", "记者", "新媒体", "文案")),
            Map.entry("industrial-engineering", List.of("工业工程", "制造", "工艺", "生产工程", "精益")),
            Map.entry("hardware-electronics", List.of("硬件", "电子", "嵌入式", "电路", "芯片")),
            Map.entry("biomedical-health", List.of("生物", "医药", "临床", "医疗", "健康")),
            Map.entry("public-service", List.of("公共服务", "社会工作", "社工", "公共事务", "社区"))
    );

    public MatchDraft match(
            CareerDirectionModels.DirectionRow direction,
            List<String> commonSkills,
            List<String> industryTags,
            JobRecord job,
            List<String> jobTags
    ) {
        String title = normalized(job.getTitle());
        String fullText = normalized(String.join(" ", safe(job.getTitle()), safe(job.getDirection()),
                safe(job.getIndustry()), safe(job.getDescription()), String.join(" ", jobTags)));
        int score = 0;
        List<String> reasons = new ArrayList<>();

        if (same(job.getDirection(), direction.name())) {
            score += 58;
            reasons.add("岗位方向与职业方向一致");
        } else if (same(job.getDirection(), direction.category())) {
            score += 18;
            reasons.add("岗位类别与职业方向类别一致");
        }

        Set<String> aliases = new LinkedHashSet<>(CODE_ALIASES.getOrDefault(direction.code(), List.of()));
        aliases.add(direction.name());
        List<String> titleHits = aliases.stream().filter(alias -> contains(title, alias)).toList();
        if (!titleHits.isEmpty()) {
            score += 48;
            reasons.add("岗位名称命中：" + String.join("、", titleHits.stream().limit(2).toList()));
        } else {
            List<String> contentHits = aliases.stream().filter(alias -> contains(fullText, alias)).toList();
            if (!contentHits.isEmpty()) {
                score += Math.min(12 + contentHits.size() * 4, 24);
                reasons.add("岗位描述命中方向关键词");
            }
        }

        List<String> skillHits = commonSkills.stream()
                .filter(skill -> useful(skill) && contains(fullText, skill)).distinct().limit(4).toList();
        if (!skillHits.isEmpty()) {
            score += Math.min(skillHits.size() * 7, 28);
            reasons.add("共同技能：" + String.join("、", skillHits));
        }

        List<String> industryHits = industryTags.stream()
                .filter(tag -> useful(tag) && contains(fullText, tag)).distinct().limit(3).toList();
        if (!industryHits.isEmpty()) {
            score += Math.min(industryHits.size() * 5, 15);
            reasons.add("相关行业：" + String.join("、", industryHits));
        }

        double quality = job.getQualityScore() == null ? 0 : Math.max(0, Math.min(job.getQualityScore(), 100));
        if (score > 0) {
            score += (int) Math.round(quality / 20.0);
        }
        return new MatchDraft(job.getId(), Math.min(score, 100), List.copyOf(reasons));
    }

    private boolean useful(String value) {
        return value != null && normalized(value).length() >= 2;
    }

    private boolean contains(String source, String candidate) {
        String target = normalized(candidate);
        return !target.isBlank() && source.contains(target);
    }

    private boolean same(String left, String right) {
        return !normalized(left).isBlank() && normalized(left).equals(normalized(right));
    }

    private String normalized(String value) {
        return safe(value).toLowerCase(Locale.ROOT).replaceAll("[\\s\\p{Punct}，。；：、（）【】《》]+", "");
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
