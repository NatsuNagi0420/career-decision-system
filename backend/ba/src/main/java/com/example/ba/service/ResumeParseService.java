/**
 * 文件说明：简历解析服务。
 * 职责：使用 Apache Tika 从上传文件中抽取文本，再基于关键词和简单规则解析出核心字段。
 */
package com.example.ba.service;

import com.example.ba.dto.ResumeParseResultDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.tika.metadata.Metadata;

import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.sax.BodyContentHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ResumeParseService {

    private static final Logger log = LoggerFactory.getLogger(ResumeParseService.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();


    private static final Pattern NAME_PATTERN = Pattern.compile("姓名[:：]\\s*([\\u4e00-\\u9fa5A-Za-z·\\s]{1,20})");
    private static final Pattern PHONE_PATTERN = Pattern.compile("(电话|手机)[:：\\s]*([0-9\\-+]{7,20})");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("(邮箱|Email)[:：\\s]*([A-Za-z0-9_\\.\\-]+@[A-Za-z0-9_\\-]+\\.[A-Za-z]{2,})");
    private static final Pattern GENDER_PATTERN = Pattern.compile("(性别)[:：\\s]*([男女男士女士]{1,2})");
    private static final Pattern AGE_PATTERN = Pattern.compile("(年龄)[:：\\s]*([0-9]{1,2})");
    private static final Pattern POSITION_PATTERN = Pattern.compile("(?:意向岗位|求职意向|目标岗位)[:：]\\s*(.+?)(?=\\s*(?:意向城市|期望城市|工作地点|期望薪资|薪资要求|求职类型|工作性质)[:：]|\\n|$)");
    private static final Pattern CITY_PATTERN = Pattern.compile("(?:意向城市|期望城市|工作地点)[:：]\\s*(.+?)(?=\\s*(?:期望薪资|薪资要求|求职类型|工作性质)[:：]|\\n|$)");
    private static final Pattern SALARY_PATTERN = Pattern.compile("(?:期望薪资|薪资要求)[:：]\\s*(.+?)(?=\\s*(?:求职类型|工作性质)[:：]|\\n|$)");
    private static final Pattern JOBTYPE_PATTERN = Pattern.compile("(?:求职类型|工作性质)[:：]\\s*(.+?)(?=\\n|$)");
    private static final Pattern YEAR_RANGE_LINE_PATTERN = Pattern.compile("^[12]\\d{3}[.\\-/][01]?\\d(?:\\s*[-~至到]\\s*[12]\\d{3}[.\\-/][01]?\\d|[.\\-/][12]\\d{3}[.\\-/][01]?\\d)?.*");


    public ResumeParseResultDTO parse(MultipartFile file) {
        log.info("开始解析简历: fileName={}, fileSize={}", file.getOriginalFilename(), file.getSize());
        long startTime = System.currentTimeMillis();

        String text = extractText(file);
        if (text == null || text.isBlank()) {
            log.warn("简历文本提取为空: fileName={}", file.getOriginalFilename());
            return new ResumeParseResultDTO();
        }

        String normalized = text.replaceAll("\\r\\n", "\n").replaceAll("\\r", "\n");

        // 调试输出：打印简历文本前几百个字符，方便观察原始结构
        String preview = normalized.length() > 800 ? normalized.substring(0, 800) : normalized;
        log.debug("简历文本预览 (前800字符): {}", preview);

        // 调试输出：打印关键基础字段的正则匹配结果
        String labelName = matchFirstGroup(normalized, NAME_PATTERN);
        String name = extractName(normalized, labelName);
        String phone = matchSecondGroup(normalized, PHONE_PATTERN);
        String email = matchSecondGroup(normalized, EMAIL_PATTERN);
        String gender = matchSecondGroup(normalized, GENDER_PATTERN);
        String ageStr = matchSecondGroup(normalized, AGE_PATTERN);
        log.debug("简历字段匹配结果: labelName={}, finalName={}, phone={}, email={}, gender={}, ageStr={}",
                labelName, name, phone, email, gender, ageStr);

        ResumeParseResultDTO dto = new ResumeParseResultDTO();

        List<ResumeParseResultDTO.EducationItem> educations = extractEducationSection(normalized);
        EducationProfile educationProfile = parseEducationProfile(educations);

        ResumeParseResultDTO.BasicInfo basic = new ResumeParseResultDTO.BasicInfo();
        basic.setName(name);
        basic.setPhone(phone);
        basic.setEmail(email);
        basic.setGender(gender);
        basic.setSchool(educationProfile.school);
        basic.setMajor(educationProfile.major);
        if (ageStr != null) {
            try {
                basic.setAge(Integer.parseInt(ageStr));
            } catch (NumberFormatException ignore) {
            }
        }
        dto.setBasic(basic);

        ResumeParseResultDTO.TargetInfo target = new ResumeParseResultDTO.TargetInfo();
        String intentionPosition = sanitizePlaceholder(matchFirstGroup(normalized, POSITION_PATTERN), List.of("求职岗位", "职位名称"));
        target.setIntentionPosition(intentionPosition);

        String cityStr = sanitizePlaceholder(matchFirstGroup(normalized, CITY_PATTERN), List.of("都能接受", "不限", "全国"));
        if (cityStr != null) {
            String[] parts = cityStr.split("[、，,\\s]+");
            List<String> cities = new ArrayList<>();
            for (String c : parts) {
                if (!c.isBlank()) {
                    String value = c.trim();
                    if (!isPlaceholderValue(value, List.of("都能接受", "不限", "全国"))) {
                        cities.add(value);
                    }
                }
            }
            if (!cities.isEmpty()) {
                target.setIntentionCities(cities);
            }
        }

        String expectedSalary = sanitizePlaceholder(matchFirstGroup(normalized, SALARY_PATTERN), List.of("期望薪水", "面议"));
        target.setExpectedSalary(expectedSalary);

        String jobType = sanitizePlaceholder(matchFirstGroup(normalized, JOBTYPE_PATTERN), List.of("求职类型"));
        target.setJobType(jobType);
        dto.setTarget(target);

        dto.setEducations(educations);
        dto.setMainCourses(extractMainCourses(normalized));
        SkillSplit skillSplit = extractSkillsAndCertificates(normalized);
        dto.setSkills(skillSplit.skills);
        dto.setCertificates(skillSplit.certificates);
        dto.setSkillCertificates(skillSplit.merged);
        dto.setWorkExperiences(extractWorkExperiences(normalized));
        dto.setSelfEvaluation(extractSelfEvaluation(normalized));

        printPackagedResult(dto);

        long duration = System.currentTimeMillis() - startTime;
        log.info("简历解析完成: fileName={}, duration={}ms", file.getOriginalFilename(), duration);

        return dto;

    }



    private String extractText(MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            AutoDetectParser parser = new AutoDetectParser();
            BodyContentHandler handler = new BodyContentHandler(-1);
            Metadata metadata = new Metadata();
            ParseContext context = new ParseContext();
            parser.parse(in, handler, metadata, context);
            String raw = handler.toString();
            if (raw == null) {
                return null;
            }
            return new String(raw.getBytes(), StandardCharsets.UTF_8)
                    .replaceAll("[ \\t]+", " ")
                    .replaceAll("\\n{3,}", "\n\n");
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 提取姓名：
     * 1. 优先使用带「姓名：」的显式字段（labelName）
     * 2. 如无显式字段，则从首行推断，例如「姓名 意向岗位：xxx」这种结构
     */
    private String extractName(String text, String labelName) {
        if (labelName != null && !labelName.isBlank()) {
            return labelName.trim();
        }
        if (text == null || text.isBlank()) {
            return null;
        }
        // 只看第一行，通常会包含姓名 + 简短说明
        String firstLine = text;
        int nl = text.indexOf('\n');
        if (nl > 0) {
            firstLine = text.substring(0, nl);
        }
        firstLine = firstLine.trim();
        if (firstLine.isEmpty()) {
            return null;
        }
        // 规则一：开头 2-6 个中文姓名字符 + 可选的 "意向岗位/求职意向/简历" 等描述
        Pattern p = Pattern.compile("^([\\u4e00-\\u9fa5·]{2,6})\\s*(意向岗位|求职意向|简历|求职简历)?");
        Matcher m = p.matcher(firstLine);
        if (m.find()) {
            return m.group(1).trim();
        }
        // 规则二：如果包含「意向岗位」，截取其前面的部分作为姓名候选
        int idx = firstLine.indexOf("意向岗位");
        if (idx > 0) {
            String before = firstLine.substring(0, idx).trim();
            if (before.length() >= 2 && before.length() <= 12) {
                return before;
            }
        }
        return null;
    }

    private String matchFirstGroup(String text, Pattern pattern) {
        Matcher m = pattern.matcher(text);
        if (m.find()) {
            return m.group(1).trim();
        }
        return null;
    }

    private String matchSecondGroup(String text, Pattern pattern) {

        Matcher m = pattern.matcher(text);
        if (m.find()) {
            return m.group(2).trim();
        }
        return null;
    }

    private String sanitizePlaceholder(String value, List<String> placeholders) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return isPlaceholderValue(trimmed, placeholders) ? null : trimmed;
    }

    private boolean isPlaceholderValue(String value, List<String> placeholders) {
        String normalized = value == null ? "" : value.trim().replaceAll("\\s+", "");
        if (normalized.isEmpty()) {
            return true;
        }
        for (String p : placeholders) {
            String np = p == null ? "" : p.trim().replaceAll("\\s+", "");
            if (!np.isEmpty() && normalized.equalsIgnoreCase(np)) {
                return true;
            }
        }
        return false;
    }

    private EducationProfile parseEducationProfile(List<ResumeParseResultDTO.EducationItem> educations) {
        if (educations == null || educations.isEmpty()) {
            return new EducationProfile(null, null);
        }

        String school = null;
        String major = null;

        for (ResumeParseResultDTO.EducationItem item : educations) {
            if (item == null || item.getText() == null) continue;
            String text = item.getText().trim();
            if (text.isEmpty()) continue;

            if (school == null) {
                Matcher schoolMatcher = Pattern.compile("([\\u4e00-\\u9fa5A-Za-z0-9（）()·\\-]{2,40}(大学|学院|学校|职业技术大学|职业学院))").matcher(text);
                if (schoolMatcher.find()) {
                    school = schoolMatcher.group(1).trim();
                }
            }

            if (major == null) {
                String[] parts = text.split("\\|");
                if (parts.length >= 2) {
                    String candidate = parts[0].trim().replaceAll("\\s+", " ");
                    if (!candidate.isEmpty() && candidate.length() <= 20) {
                        major = candidate;
                    }
                } else {
                    Matcher majorMatcher = Pattern.compile("(计算机|软件|电子|机械|电气|自动化|机电|通信|土木|财务|会计|市场|工商|护理|医学|设计|英语|法学)[\\u4e00-\\u9fa5A-Za-z0-9（）()·\\-]{0,16}(技术|工程|管理|学|专业)").matcher(text);
                    if (majorMatcher.find()) {
                        major = majorMatcher.group().trim();
                    }
                }
            }


            if (school != null && major != null) {
                break;
            }
        }

        return new EducationProfile(school, major);
    }

    private void printPackagedResult(ResumeParseResultDTO dto) {
        try {
            log.debug("简历解析结果: {}", OBJECT_MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(dto));
        } catch (Exception e) {
            log.warn("简历解析结果日志输出失败: {}", e.getMessage());
        }
    }

    private static class EducationProfile {
        private final String school;
        private final String major;

        private EducationProfile(String school, String major) {
            this.school = school;
            this.major = major;
        }
    }

    private List<ResumeParseResultDTO.EducationItem> extractEducationSection(String text) {

        String section = sliceBetween(text, "教育经历", List.of("主修课程", "技能证书", "工作经历", "实习经历", "自我评价"));
        if (section == null) {
            return List.of();
        }
        String[] lines = section.split("\\n");
        List<ResumeParseResultDTO.EducationItem> list = new ArrayList<>();
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.length() < 4) continue;
            if (trimmed.contains("教育经历")) continue;
            ResumeParseResultDTO.EducationItem item = new ResumeParseResultDTO.EducationItem();
            item.setText(trimmed);
            list.add(item);
        }
        return list;
    }

    private List<String> extractMainCourses(String text) {
        String section = sliceBetween(text, "主修课程", List.of("教育经历", "技能证书", "证书", "工作经历", "实习经历", "自我评价"));
        if (section == null) {
            return List.of();
        }
        String merged = section.replace("\n", " ");
        String[] parts = merged.split("[、，,;；\\s]+");
        List<String> courses = new ArrayList<>();
        for (String p : parts) {
            String t = p.trim();
            if (t.length() >= 2) {
                courses.add(t);
            }
        }
        return courses;
    }

    private SkillSplit extractSkillsAndCertificates(String text) {
        String section = sliceBetween(text, "技能证书", List.of("教育经历", "主修课程", "工作经历", "实习经历", "自我评价"));
        if (section == null) {
            section = sliceBetween(text, "技能", List.of("教育经历", "主修课程", "工作经历", "实习经历", "自我评价"));
            if (section == null) {
                return new SkillSplit(List.of(), List.of());
            }
        }
        String[] lines = section.split("\\n");
        List<String> skills = new ArrayList<>();
        List<String> certificates = new ArrayList<>();
        Pattern certPattern = Pattern.compile("(证书|认证|资格|certificate|certified|award|获奖)", Pattern.CASE_INSENSITIVE);
        for (String line : lines) {
            String t = line.trim().replaceFirst("^[•·*\\-]+", "").trim();
            if (t.length() < 2) continue;
            if (certPattern.matcher(t).find()) {
                certificates.add(t);
            } else {
                skills.add(t);
            }
        }
        return new SkillSplit(skills, certificates);
    }

    private static class SkillSplit {
        private final List<String> skills;
        private final List<String> certificates;
        private final List<String> merged;

        private SkillSplit(List<String> skills, List<String> certificates) {
            this.skills = skills;
            this.certificates = certificates;
            this.merged = new ArrayList<>();
            this.merged.addAll(skills);
            this.merged.addAll(certificates);
        }
    }

    private List<ResumeParseResultDTO.WorkExperienceItem> extractWorkExperiences(String text) {

        String section = sliceBetween(text, "工作经历", List.of("自我评价", "自我介绍", "校园经历", "其他信息"));
        if (section == null) {
            section = sliceBetween(text, "实习经历", List.of("自我评价", "自我介绍", "校园经历", "其他信息"));
            if (section == null) {
                return List.of();
            }
        }

        String[] rawLines = section.split("\\n");
        List<String> lines = new ArrayList<>();
        for (String raw : rawLines) {
            String trimmed = raw == null ? "" : raw.trim();
            if (trimmed.isEmpty()) continue;
            if ("工作经历".equals(trimmed) || "实习经历".equals(trimmed)) continue;
            lines.add(trimmed);
        }

        if (lines.isEmpty()) {
            return List.of();
        }

        List<ResumeParseResultDTO.WorkExperienceItem> list = new ArrayList<>();
        ResumeParseResultDTO.WorkExperienceItem current = null;

        for (String line : lines) {
            if (YEAR_RANGE_LINE_PATTERN.matcher(line).matches()) {
                if (current != null && (notBlank(current.getTitle()) || notBlank(current.getDescription()))) {
                    list.add(current);
                }
                current = new ResumeParseResultDTO.WorkExperienceItem();
                current.setTitle(line);
                current.setDescription("");
                continue;
            }

            if (current == null) {
                current = new ResumeParseResultDTO.WorkExperienceItem();
                current.setTitle(line);
                current.setDescription("");
                continue;
            }

            if (notBlank(current.getTitle()) && !notBlank(current.getDescription()) && looksLikeSubtitle(line)) {
                current.setTitle(current.getTitle() + " | " + line);
            } else {
                String desc = current.getDescription();
                current.setDescription(desc == null || desc.isBlank() ? line : desc + "\n" + line);
            }
        }

        if (current != null && (notBlank(current.getTitle()) || notBlank(current.getDescription()))) {
            list.add(current);
        }

        return list;
    }


    private boolean looksLikeSubtitle(String line) {
        if (line == null) return false;
        String t = line.trim();
        if (t.isEmpty()) return false;
        return t.contains("|") || (t.length() <= 24 && !t.contains("，") && !t.contains("。"));
    }

    private boolean notBlank(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String extractSelfEvaluation(String text) {

        String section = sliceBetween(text, "自我评价", List.of("兴趣爱好", "获奖情况", "其他信息", "附加信息"));
        if (section == null) {
            return null;
        }
        return section.trim();
    }

    private String sliceBetween(String text, String startKeyword, List<String> endKeywords) {
        int start = text.indexOf(startKeyword);
        if (start < 0) {
            return null;
        }
        start += startKeyword.length();
        int end = text.length();
        for (String endKeyword : endKeywords) {
            int idx = text.indexOf(endKeyword, start);
            if (idx > 0 && idx < end) {
                end = idx;
            }
        }
        if (start >= end) {
            return null;
        }
        return text.substring(start, end);
    }
}
