package com.careerdecision.backend.job;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class JobDescriptionStructurer {
    static final String RULE_VERSION = "jd-rule-v1";
    private static final Pattern BREAK_TAG = Pattern.compile("(?i)<br\\s*/?>|</(?:p|div|li|ul|ol|h[1-6])>");
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");
    private static final Pattern LEADING_MARKER = Pattern.compile(
            "^(?:[（(]?[一二三四五六七八九十]+[）).、：:]|[（(]?\\d{1,2}[）).、：:]|[-—–•·*◆▪■]+)\\s*"
    );
    private static final Pattern RESPONSIBILITY_HEADER = Pattern.compile(
            "^(?:岗位|职位|工作|主要工作|核心)?(?:职责|内容|描述|范围|任务)(?:说明)?\\s*[：:]?\\s*(.*)$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern REQUIREMENT_HEADER = Pattern.compile(
            "^(?:任职|岗位|职位|人员|应聘|基本|其他|资格)?(?:要求|条件|资格)(?:说明)?\\s*[：:]?\\s*(.*)$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern GROWTH_HEADER = Pattern.compile(
            "^(?:职业)?(?:发展|成长|晋升)(?:路径|通道|空间|方向)?\\s*[：:]?\\s*(.*)$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern INTERVIEW_HEADER = Pattern.compile(
            "^(?:面试|考察)(?:重点|流程|内容|方向)?\\s*[：:]?\\s*(.*)$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern IGNORE_HEADER = Pattern.compile(
            "^(?:薪资|职位|员工|相关)?(?:福利|待遇|亮点)|^(?:工作)?(?:地点|地址)|^(?:公司|企业)(?:介绍|简介)|^(?:备注|其他)(?:说明)?",
            Pattern.CASE_INSENSITIVE
    );
    private static final Set<String> NOISE = Set.of(
            "职位描述", "岗位描述", "岗位职责", "工作职责", "任职要求", "岗位要求", "职位要求", "任职资格",
            "工作内容", "工作范围", "主要职责", "要求", "职责"
    );

    public String extractorVersion(JobRecord job, List<String> tags) {
        String source = String.join("|",
                safe(job.getDescription()), safe(job.getEducation()), safe(job.getExperienceLevel()),
                String.join(",", tags == null ? List.of() : tags));
        return RULE_VERSION + "-" + digest(source).substring(0, 12);
    }

    /**
     * Returns a readable plain-text representation while the untouched source
     * remains stored in {@code jobs.description} for audit and re-extraction.
     */
    public String displayText(String description) {
        return String.join("\n", lines(description));
    }

    public List<JobRequirementItem> extract(JobRecord job, List<String> tags) {
        String version = extractorVersion(job, tags);
        Map<String, Draft> unique = new LinkedHashMap<>();
        Section section = Section.RESPONSIBILITY;
        int order = 0;

        for (String rawLine : lines(job.getDescription())) {
            String line = clean(rawLine);
            if (line.isBlank() || NOISE.contains(line)) {
                continue;
            }
            HeaderMatch header = header(line);
            if (header != null) {
                section = header.section();
                line = clean(header.tail());
                if (line.isBlank()) {
                    continue;
                }
            }
            if (section == Section.IGNORE) {
                continue;
            }
            for (String value : splitLongLine(line)) {
                String cleaned = clean(value);
                if (cleaned.length() < 3 || NOISE.contains(cleaned)) {
                    continue;
                }
                String type = section.itemType;
                put(unique, type, cleaned, 0.82, order++);
            }
        }

        if (present(job.getEducation())) {
            put(unique, "education", "学历要求：" + job.getEducation().trim(), 0.99, order++);
        }
        if (present(job.getExperienceLevel())) {
            put(unique, "experience", "经验要求：" + job.getExperienceLevel().trim(), 0.99, order++);
        }
        if (tags != null) {
            for (String tag : tags) {
                if (present(tag)) {
                    put(unique, "skill", "技能要求：" + tag.trim(), 0.92, order++);
                }
            }
        }

        List<JobRequirementItem> result = new ArrayList<>();
        for (Draft draft : unique.values()) {
            result.add(new JobRequirementItem(
                    null, job.getId(), draft.type(), draft.text(), draft.key(), draft.confidence(),
                    "rule", version, draft.order()
            ));
        }
        return List.copyOf(result);
    }

    private List<String> lines(String description) {
        if (!present(description)) {
            return List.of();
        }
        String value = BREAK_TAG.matcher(description).replaceAll("\n");
        value = HTML_TAG.matcher(value).replaceAll("");
        value = decodeEntities(value).replace('\r', '\n');
        return Pattern.compile("\\n+").splitAsStream(value)
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .toList();
    }

    private List<String> splitLongLine(String line) {
        if (line.length() <= 240) {
            return List.of(line);
        }
        List<String> pieces = Pattern.compile("(?<=[。；;])").splitAsStream(line)
                .map(String::trim).filter(value -> !value.isBlank()).toList();
        return pieces.size() > 1 ? pieces : List.of(line.substring(0, Math.min(line.length(), 1000)));
    }

    private HeaderMatch header(String line) {
        HeaderMatch match = matchHeader(RESPONSIBILITY_HEADER, line, Section.RESPONSIBILITY);
        if (match != null) return match;
        match = matchHeader(REQUIREMENT_HEADER, line, Section.REQUIREMENT);
        if (match != null) return match;
        match = matchHeader(GROWTH_HEADER, line, Section.GROWTH);
        if (match != null) return match;
        match = matchHeader(INTERVIEW_HEADER, line, Section.INTERVIEW);
        if (match != null) return match;
        return IGNORE_HEADER.matcher(line).find() ? new HeaderMatch(Section.IGNORE, "") : null;
    }

    private HeaderMatch matchHeader(Pattern pattern, String line, Section section) {
        Matcher matcher = pattern.matcher(line);
        return matcher.matches() ? new HeaderMatch(section, matcher.group(1)) : null;
    }

    private void put(Map<String, Draft> unique, String type, String text, double confidence, int order) {
        String limited = text.length() > 1000 ? text.substring(0, 1000) : text;
        String key = normalize(limited);
        if (!key.isBlank()) {
            unique.putIfAbsent(type + ":" + key, new Draft(type, limited, key, confidence, order));
        }
    }

    private String clean(String value) {
        if (value == null) return "";
        String result = value.replace('\u3000', ' ').trim();
        result = LEADING_MARKER.matcher(result).replaceFirst("").trim();
        return result.replaceAll("\\s+", " ");
    }

    private String normalize(String value) {
        String normalized = value.toLowerCase(Locale.ROOT)
                .replaceFirst("^(?:学历|经验|技能)要求[：:]", "")
                .replaceAll("[\\s\\p{Punct}，。；：、（）【】《》]+", "");
        return normalized.substring(0, Math.min(normalized.length(), 240));
    }

    private String decodeEntities(String value) {
        return value.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"");
    }

    private String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte item : bytes) result.append(String.format("%02x", item));
            return result.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    private boolean present(String value) {
        return value != null && !value.isBlank();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private enum Section {
        RESPONSIBILITY("responsibility"), REQUIREMENT("requirement"),
        GROWTH("growth_path"), INTERVIEW("interview_focus"), IGNORE(null);

        private final String itemType;
        Section(String itemType) { this.itemType = itemType; }
    }

    private record HeaderMatch(Section section, String tail) { }
    private record Draft(String type, String text, String key, double confidence, int order) { }
}
