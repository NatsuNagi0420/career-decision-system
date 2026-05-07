/**
 * 文件说明：能力画像与职业路径业务实现类。
 * 职责：基于用户资料、目标岗位和历史画像结果，调用大模型生成能力画像与职业路径规划，
 *       并组装推荐岗位列表、匹配度分数等综合结果返回前端。
 */
package com.example.ba.service.impl;

import com.example.ba.dto.CapabilityProfileRequestDTO;
import com.example.ba.pojo.JobInfo;
import com.example.ba.service.CapabilityService;
import com.example.ba.service.JobService;
import com.example.ba.utils.AiUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class CapabilityServiceImpl implements CapabilityService {

    private static final List<String> RADAR_DIMENSIONS = List.of(
            "专业技能",
            "创新能力",
            "沟通表达",
            "学习能力",
            "执行力",
            "团队协作",
            "抗压能力"
    );

    @Autowired
    private AiUtils aiUtils;

    @Autowired
    private JobService jobService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Map<String, Object> generateProfile(CapabilityProfileRequestDTO req) {
        CapabilityProfileRequestDTO effectiveReq = assembleUserRequest(req);
        Map<String, Object> fallback = buildFallback(effectiveReq);

        String systemPrompt = "你是职业规划平台的分析引擎。" +
                "请根据用户信息输出严格 JSON，不要输出多余文字。" +
                "JSON 结构必须包含：" +
                "completenessScore(0-100), competitivenessStars(1-5), tags(string[])," +
                "radar(indicators:{name,max}[], values:number[])," +
                "suggestions:{shortTerm,longTerm}," +
                "recommendedKeywords(string[])," +
                "recommendedJobTitles(string[]，最多2项)," +
                "recommendedJobCards([{title, matchScore}])，matchScore为0-100整数。" +
                "雷达维度固定为：专业技能、创新能力、沟通表达、学习能力、执行力、团队协作、抗压能力，values 顺序必须与维度一致。";

        String userPrompt = "用户信息：" + safeToString(effectiveReq);

        String reply;
        try {
            reply = aiUtils.getChatResponse(systemPrompt, userPrompt);
        } catch (Exception e) {
            reply = null;
        }
        Map<String, Object> profile = normalizeProfile(parseProfileJson(reply), fallback);

        List<String> searchTerms = buildJobSearchTerms(profile, effectiveReq);
        String keyword = searchTerms.isEmpty() ? pickKeyword(profile, effectiveReq) : searchTerms.get(0);

        // 使用岗位标题优先匹配 + 关键词兜底的方式，从数据库中选出推荐岗位
        List<JobInfo> recommendedJobs = buildRecommendedJobsFromTitlesOrKeywords(profile, searchTerms, keyword);
        List<Integer> matchScores = buildMatchScores(profile, recommendedJobs);

        return buildProfileResponse(profile, recommendedJobs, matchScores, keyword);
    }

    private Map<String, Object> normalizeProfile(Map<String, Object> raw, Map<String, Object> fallback) {
        if (raw == null) return fallback;

        Map<String, Object> out = new HashMap<>(fallback);
        out.putAll(raw);

        out.put("radar", normalizeRadar(fallback, out));

        @SuppressWarnings("unchecked")
        List<String> fallbackTags = (List<String>) fallback.get("tags");
        out.put("tags", normalizeStringList(out.get("tags"), fallbackTags, 12));

        Object suggestions = out.get("suggestions");
        if (!(suggestions instanceof Map)) {
            out.put("suggestions", fallback.get("suggestions"));
        } else {
            Map<?, ?> s = (Map<?, ?>) suggestions;
            Object shortTerm = s.get("shortTerm");
            Object longTerm = s.get("longTerm");
            if (!(shortTerm instanceof String) || !(longTerm instanceof String)) {
                out.put("suggestions", fallback.get("suggestions"));
            }
        }

        @SuppressWarnings("unchecked")
        List<String> fallbackKeywords = (List<String>) fallback.get("recommendedKeywords");
        out.put("recommendedKeywords", normalizeStringList(out.get("recommendedKeywords"), fallbackKeywords, 10));

        @SuppressWarnings("unchecked")
        List<String> fallbackTitles = (List<String>) fallback.get("recommendedJobTitles");
        out.put("recommendedJobTitles", normalizeStringList(out.get("recommendedJobTitles"), fallbackTitles, 2));

        out.put("recommendedJobCards", normalizeJobCards(out.get("recommendedJobCards"), fallback.get("recommendedJobCards"), 2));

        int fallbackCompleteness = normalizeCompletenessScore(fallback.get("completenessScore"), 70);
        int completeness = normalizeCompletenessScore(out.get("completenessScore"), fallbackCompleteness);
        out.put("completenessScore", completeness);

        int fallbackStars = normalizeStars(fallback.get("competitivenessStars"), Math.max(3, (int) Math.round(fallbackCompleteness / 20.0)));
        int derivedStars = Math.max(3, (int) Math.round(completeness / 20.0));
        int stars = normalizeStars(out.get("competitivenessStars"), Math.max(fallbackStars, derivedStars));
        out.put("competitivenessStars", stars);

        return out;
    }

    private Map<String, Object> buildProfileResponse(Map<String, Object> profile,
                                                     List<JobInfo> jobs,
                                                     List<Integer> matchScores,
                                                     String keyword) {
        Map<String, Object> out = new HashMap<>();
        out.put("completenessScore", profile.get("completenessScore"));
        out.put("competitivenessStars", profile.get("competitivenessStars"));
        out.put("tags", profile.get("tags"));
        out.put("radar", profile.get("radar"));
        out.put("suggestions", profile.get("suggestions"));
        out.put("recommendedKeywords", profile.get("recommendedKeywords"));
        out.put("recommendedJobTitles", profile.get("recommendedJobTitles"));
        out.put("matchScores", normalizeMatchScores(matchScores, jobs == null ? 0 : jobs.size()));
        out.put("recommendKeyword", keyword);
        out.put("recommendedJobs", toJobBrief(jobs));
        return out;
    }

    private List<Map<String, Object>> toJobBrief(List<JobInfo> jobs) {
        if (jobs == null) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (JobInfo j : jobs) {
            if (j == null) continue;
            Map<String, Object> row = new HashMap<>();
            row.put("id", j.getId());
            row.put("jobName", j.getJobName());
            row.put("companyName", j.getCompanyName());
            row.put("location", j.getLocation());
            row.put("salaryRange", j.getSalaryRange());
            out.add(row);
        }
        return out;
    }

    private List<Integer> normalizeMatchScores(List<Integer> raw, int size) {
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            Integer v = (raw != null && i < raw.size()) ? raw.get(i) : null;
            if (v == null) {
                int base = 92;
                v = Math.max(60, base - i * 7);
            }
            out.add(Math.max(0, Math.min(100, v)));
        }
        return out;
    }

    private Map<String, Object> normalizeRadar(Map<String, Object> fallback, Map<String, Object> raw) {
        Map<String, Object> radar = new HashMap<>();
        List<Map<String, Object>> indicators = new ArrayList<>();
        for (String d : RADAR_DIMENSIONS) {
            Map<String, Object> indicator = new HashMap<>();
            indicator.put("name", d);
            indicator.put("max", 100);
            indicators.add(indicator);
        }

        List<Integer> values = new ArrayList<>();
        List<Integer> fallbackValues = new ArrayList<>();
        Object fb = fallback.get("radar");
        if (fb instanceof Map<?, ?> fbMap) {
            Object fbValues = fbMap.get("values");
            if (fbValues instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Number n) {
                        fallbackValues.add(n.intValue());
                    }
                }
            }
        }

        List<?> rawValues = null;
        Object rawRadar = raw.get("radar");
        if (rawRadar instanceof Map<?, ?> rm) {
            Object rv = rm.get("values");
            if (rv instanceof List<?> list) {
                rawValues = list;
            }
        }

        for (int i = 0; i < RADAR_DIMENSIONS.size(); i++) {
            int fallbackScore = (fallbackValues.size() > i) ? fallbackValues.get(i) : 65;
            Integer aiScore = null;
            if (rawValues != null && i < rawValues.size()) {
                aiScore = parseScore(rawValues.get(i));
            }
            values.add(calibrateRadarScore(aiScore, fallbackScore, i));
        }

        radar.put("indicators", indicators);
        radar.put("values", values);
        return radar;
    }

    private Integer parseScore(Object raw) {
        if (raw == null) return null;
        double d;
        if (raw instanceof Number n) {
            d = n.doubleValue();
        } else {
            try {
                d = Double.parseDouble(String.valueOf(raw));
            } catch (Exception e) {
                return null;
            }
        }

        if (d >= 0.0 && d <= 1.0) {
            d = d * 100.0;
        } else if (d > 1.0 && d <= 5.0) {
            d = d / 5.0 * 100.0;
        }

        return Math.max(0, Math.min(100, (int) Math.round(d)));
    }

    private int normalizeCompletenessScore(Object raw, int fallback) {
        int fb = Math.max(55, Math.min(95, fallback));
        Integer ai = parseScore(raw);
        if (ai == null) return fb;
        int blended = (int) Math.round(ai * 0.65 + fb * 0.35);
        return Math.max(55, Math.min(95, blended));
    }

    private int normalizeStars(Object raw, int fallback) {
        int fb = Math.max(3, Math.min(5, fallback));
        Integer ai = null;

        if (raw instanceof Number n) {
            double d = n.doubleValue();
            if (d >= 0.0 && d <= 1.0) {
                d = d * 5.0;
            } else if (d > 5.0 && d <= 100.0) {
                d = d / 20.0;
            }
            ai = (int) Math.round(d);
        } else if (raw != null) {
            try {
                double d = Double.parseDouble(String.valueOf(raw));
                if (d >= 0.0 && d <= 1.0) {
                    d = d * 5.0;
                } else if (d > 5.0 && d <= 100.0) {
                    d = d / 20.0;
                }
                ai = (int) Math.round(d);
            } catch (Exception ignore) {
            }
        }

        if (ai == null) return fb;
        int blended = (int) Math.round(ai * 0.6 + fb * 0.4);
        return Math.max(3, Math.min(5, blended));
    }

    private int calibrateRadarScore(Integer aiScore, int fallbackScore, int idx) {
        int fb = Math.max(50, Math.min(92, fallbackScore));
        if (aiScore == null) return fb;

        int blended = (int) Math.round(aiScore * 0.6 + fb * 0.4);
        int floor = Math.max(55, Math.min(68, fb - 4));
        int calibrated = Math.max(floor, Math.min(92, blended));

        int jitter = (Math.abs(mix((idx + 1) * 97 + fb)) % 3) - 1;
        return Math.max(floor, Math.min(92, calibrated + jitter));
    }

    private List<String> normalizeStringList(Object raw, List<String> fallback, int limit) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) continue;
                String s = String.valueOf(o).trim();
                if (s.isEmpty()) continue;
                out.add(s);
                if (out.size() >= limit) break;
            }
        }
        if (out.isEmpty() && fallback != null) {
            for (String s : fallback) {
                if (s == null) continue;
                String v = s.trim();
                if (v.isEmpty()) continue;
                out.add(v);
                if (out.size() >= limit) break;
            }
        }
        return out;
    }

    private List<Map<String, Object>> normalizeJobCards(Object raw, Object fallback, int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Object titleObj = m.get("title");
                Object scoreObj = m.get("matchScore");
                if (titleObj == null || scoreObj == null) continue;
                String title = String.valueOf(titleObj).trim();
                if (title.isEmpty()) continue;
                Integer score = null;
                if (scoreObj instanceof Number n) {
                    score = n.intValue();
                } else {
                    try {
                        score = Integer.parseInt(String.valueOf(scoreObj));
                    } catch (Exception ignore) {
                    }
                }
                if (score == null) continue;
                score = Math.max(0, Math.min(100, score));
                out.add(Map.of("title", title, "matchScore", score));
                if (out.size() >= limit) break;
            }
        }
        if (out.isEmpty() && fallback instanceof List<?> fbList) {
            for (Object o : fbList) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Object titleObj = m.get("title");
                Object scoreObj = m.get("matchScore");
                if (titleObj == null || scoreObj == null) continue;
                String title = String.valueOf(titleObj).trim();
                if (title.isEmpty()) continue;
                Integer score = null;
                if (scoreObj instanceof Number n) {
                    score = n.intValue();
                } else {
                    try {
                        score = Integer.parseInt(String.valueOf(scoreObj));
                    } catch (Exception ignore) {
                    }
                }
                if (score == null) continue;
                score = Math.max(0, Math.min(100, score));
                out.add(Map.of("title", title, "matchScore", score));
                if (out.size() >= limit) break;
            }
        }
        return out;
    }

    private String safeToString(CapabilityProfileRequestDTO req) {
        if (req == null) return "{}";

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("age", req.getAge());
        map.put("education", req.getEducation());
        map.put("tendencyAnswers", req.getTendencyAnswers());
        map.put("mbtiAnswers", req.getMbtiAnswers());
        map.put("basic", req.getBasic());
        map.put("target", req.getTarget());
        map.put("skills", req.getSkills());
        map.put("certificates", req.getCertificates());
        map.put("experiences", req.getExperiences());
        map.put("values", req.getValues());
        map.put("mbtiResult", req.getMbtiResult());
        map.put("links", req.getLinks());
        map.put("questionnaireAnswers", req.getQuestionnaireAnswers());
        try {
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            return map.toString();
        }
    }

    private Map<String, Object> parseProfileJson(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        int start = s.indexOf('{');
        int end = s.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        String json = s.substring(start, end + 1);
        try {
            JsonNode node = objectMapper.readTree(json);
            return objectMapper.convertValue(node, Map.class);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, Object> buildFallback(CapabilityProfileRequestDTO req) {
        int filled = 0;
        int total = 0;
        if (req != null) {
            total += 1;
            if (req.getBasic() != null && notBlank(req.getBasic().getName())) filled++;

            total += 1;
            if (req.getBasic() != null && notBlank(req.getBasic().getEmail())) filled++;

            total += 1;
            if (req.getTarget() != null && notBlank(req.getTarget().getRole())) filled++;

            total += 1;
            if (req.getSkills() != null && !req.getSkills().isEmpty()) filled++;

            total += 1;
            if (req.getCertificates() != null && !req.getCertificates().isEmpty()) filled++;

            total += 1;
            if (req.getExperiences() != null && !req.getExperiences().isEmpty()) filled++;

            total += 1;
            if (req.getValues() != null && !req.getValues().isEmpty()) filled++;

            total += 1;
            if (notBlank(req.getMbtiResult())) filled++;

            total += 1;
            if (req.getQuestionnaireAnswers() != null && !req.getQuestionnaireAnswers().isEmpty()) filled++;
        }
        if (total == 0) total = 1;
        int completenessScore = (int) Math.round((filled / (double) total) * 100);
        int stars = Math.max(1, Math.min(5, (int) Math.round(completenessScore / 20.0)));

        int seed = stableSeed(req);

        Map<String, Object> radar = new HashMap<>();
        List<Map<String, Object>> indicators = new ArrayList<>();
        List<Integer> values = new ArrayList<>();
        for (int i = 0; i < RADAR_DIMENSIONS.size(); i++) {
            String d = RADAR_DIMENSIONS.get(i);
            Map<String, Object> indicator = new HashMap<>();
            indicator.put("name", d);
            indicator.put("max", 100);
            indicators.add(indicator);
            int base = Math.max(40, Math.min(95, completenessScore));
            int jitter = (Math.abs(mix(seed + i * 101)) % 21) - 10;
            values.add(Math.max(40, Math.min(95, base + jitter)));
        }
        radar.put("indicators", indicators);
        radar.put("values", values);

        Map<String, String> suggestions = new HashMap<>();
        suggestions.put("shortTerm", "补全项目经历与技能证明材料，并准备可展示作品。");
        suggestions.put("longTerm", "围绕目标岗位形成可持续学习路线，逐步累积可量化成果。");

        Map<String, Object> out = new HashMap<>();
        out.put("completenessScore", completenessScore);
        out.put("competitivenessStars", stars);
        out.put("tags", List.of("逻辑清晰", "学习能力强", "执行力"));
        out.put("radar", radar);
        out.put("suggestions", suggestions);
        out.put("recommendedKeywords", List.of("前端", "Java"));
        out.put("recommendedJobTitles", List.of("前端开发工程师", "Java开发工程师", "产品助理"));
        out.put("recommendedJobCards", List.of(
                Map.of("title", "前端开发工程师", "matchScore", 92),
                Map.of("title", "Java开发工程师", "matchScore", 85),
                Map.of("title", "产品助理", "matchScore", 78)
        ));
        return out;
    }

    private int stableSeed(CapabilityProfileRequestDTO req) {
        try {
            String s = safeToString(req);
            int h = s == null ? 0 : s.hashCode();
            if (req != null && req.getUserId() != null) {
                h = 31 * h + req.getUserId().hashCode();
            }
            return mix(h);
        } catch (Exception e) {
            return 1;
        }
    }

    private int mix(int x) {
        int h = x;
        h ^= (h >>> 16);
        h *= 0x7feb352d;
        h ^= (h >>> 15);
        h *= 0x846ca68b;
        h ^= (h >>> 16);
        return h;
    }

    private List<String> buildJobSearchTerms(Map<String, Object> profile, CapabilityProfileRequestDTO req) {
        LinkedHashSet<String> set = new LinkedHashSet<>();

        Object titles = profile.get("recommendedJobTitles");
        if (titles instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) continue;
                String s = String.valueOf(o).trim();
                if (!s.isEmpty()) set.add(s);
                if (set.size() >= 6) break;
            }
        }

        Object keywords = profile.get("recommendedKeywords");
        if (keywords instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) continue;
                String s = String.valueOf(o).trim();
                if (!s.isEmpty()) set.add(s);
                if (set.size() >= 8) break;
            }
        }

        if (req != null && req.getTarget() != null && notBlank(req.getTarget().getRole())) {
            set.add(req.getTarget().getRole().trim());
        }

        return new ArrayList<>(set);
    }

    private List<JobInfo> buildRecommendedJobsFromTitlesOrKeywords(Map<String, Object> profile, List<String> searchTerms, String fallbackKeyword) {
        List<JobInfo> out = new ArrayList<>();
        Set<Integer> seen = new HashSet<>();

        // 1) 优先使用大模型返回的 recommendedJobTitles 逐个匹配数据库岗位，每个标题挑 1 个不同岗位
        Object titlesObj = profile == null ? null : profile.get("recommendedJobTitles");
        if (titlesObj instanceof List<?> titlesList) {
            for (Object o : titlesList) {
                if (o == null) continue;
                String title = String.valueOf(o).trim();
                if (title.isEmpty()) continue;
                addJobsByTerm(title, 10, 1, seen, out);
                if (out.size() >= 3) {
                    return out;
                }
            }
        }

        // 2) 如果标题匹配结果还不够，再用原来的关键词逻辑兜底补足
        List<String> terms = new ArrayList<>();
        for (String t : searchTerms) {
            if (t == null) continue;
            String s = t.trim();
            if (s.isEmpty()) continue;
            terms.add(s);
        }
        if (terms.isEmpty() && notBlank(fallbackKeyword)) {
            terms.add(fallbackKeyword.trim());
        }

        for (String term : terms) {
            addJobsByTerm(term, 2, 3 - out.size(), seen, out);
            if (out.size() >= 3) {
                return out;
            }
        }

        // 3) 对“嵌入式工程师/电气工程师”等词做扩展检索，避免过窄关键词导致 0 结果
        for (String term : expandSearchTerms(terms)) {
            addJobsByTerm(term, 3, 3 - out.size(), seen, out);
            if (out.size() >= 3) {
                return out;
            }
        }

        // 4) 最终兜底：如果仍没有命中，返回最新岗位，避免前端完全无岗位可渲染
        if (out.isEmpty()) {
            addJobsByTerm(null, 5, 3, seen, out);
        }

        return out;
    }

    private void addJobsByTerm(String term, int queryLimit, int appendLimit, Set<Integer> seen, List<JobInfo> out) {
        if (appendLimit <= 0) return;
        String keyword = term == null ? null : term.trim();
        if (keyword != null && keyword.isEmpty()) return;

        try {
            Map<String, Object> jobs = jobService.searchJobs(keyword, null, null, null, null, null, null, 1, Math.max(1, queryLimit));
            Object list = jobs.get("list");
            if (!(list instanceof List<?> items)) return;
            for (Object it : items) {
                if (!(it instanceof JobInfo ji)) continue;
                if (ji.getId() == null) continue;
                if (seen.contains(ji.getId())) continue;
                seen.add(ji.getId());
                out.add(ji);
                if (--appendLimit <= 0) break;
                if (out.size() >= 3) break;
            }
        } catch (Exception ignore) {
        }
    }

    private List<String> expandSearchTerms(List<String> baseTerms) {
        LinkedHashSet<String> set = new LinkedHashSet<>();
        if (baseTerms == null) return List.of();

        for (String raw : baseTerms) {
            if (!notBlank(raw)) continue;
            String term = raw.trim();
            set.add(term);

            String simplified = term
                    .replace("工程师", "")
                    .replace("开发", "")
                    .replace("管理", "")
                    .replace("证", "")
                    .trim();
            if (notBlank(simplified) && simplified.length() >= 2) {
                set.add(simplified);
            }

            if (term.contains("嵌入式")) set.add("嵌入式");
            if (term.contains("电气") || term.contains("电工")) set.add("电气");
            if (term.contains("机电")) set.add("机电");
            if (term.contains("生产")) set.add("生产");
        }

        return new ArrayList<>(set);
    }

    private List<Integer> buildMatchScores(Map<String, Object> profile, List<JobInfo> jobs) {
        List<Integer> out = new ArrayList<>();

        List<Map<String, Object>> cards = new ArrayList<>();
        Object raw = profile == null ? null : profile.get("recommendedJobCards");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    Map<String, Object> mm = new HashMap<>();
                    for (Map.Entry<?, ?> e : m.entrySet()) {
                        if (e.getKey() == null) continue;
                        mm.put(String.valueOf(e.getKey()), e.getValue());
                    }
                    cards.add(mm);
                }
            }
        }

        for (int i = 0; i < jobs.size(); i++) {
            JobInfo j = jobs.get(i);
            Integer score = null;
            if (j != null && j.getJobName() != null) {
                String name = j.getJobName();
                for (Map<String, Object> c : cards) {
                    Object titleObj = c.get("title");
                    Object sObj = c.get("matchScore");
                    if (titleObj == null || sObj == null) continue;
                    String title = String.valueOf(titleObj).trim();
                    if (title.isEmpty()) continue;
                    if (!(name.contains(title) || title.contains(name))) continue;
                    if (sObj instanceof Number n) {
                        score = n.intValue();
                    } else {
                        try {
                            score = Integer.parseInt(String.valueOf(sObj));
                        } catch (Exception ignore) {
                        }
                    }
                    if (score != null) break;
                }
            }
            if (score == null) {
                int base = 92;
                score = Math.max(60, base - i * 7);
            }
            out.add(Math.max(0, Math.min(100, score)));
        }
        return out;
    }

    private String pickKeyword(Map<String, Object> profile, CapabilityProfileRequestDTO req) {
        Object ks = profile.get("recommendedKeywords");
        if (ks instanceof List<?> list && !list.isEmpty()) {
            Object first = list.get(0);
            if (first != null && notBlank(String.valueOf(first))) {
                return String.valueOf(first);
            }
        }
        if (req != null && req.getSkills() != null) {
            for (String s : req.getSkills()) {
                if (s == null) continue;
                if (s.toLowerCase().contains("vue") || s.toLowerCase().contains("react")) return "前端";
                if (s.toLowerCase().contains("java")) return "Java";
                if (s.toLowerCase().contains("python")) return "Python";
            }
        }
        return "前端";
    }

    @Override
    public Map<String, Object> generateCareerPath(CapabilityProfileRequestDTO req) {
        CapabilityProfileRequestDTO effectiveReq = assembleUserRequest(req);
        Map<String, Object> fallback = buildPathFallback(effectiveReq);

        String systemPrompt = "你是一个资深的职业规划专家，负责根据用户背景和目标岗位生成职业路径图谱 JSON。" +
                "请只输出一个 JSON 对象，不要输出任何解释、前后缀、Markdown、自然语言或代码块标记。" +
                "如果信息不足或存在不确定性，也必须返回结构完整且语义合理的默认路径。" +
                "JSON 须严格包含并遵守以下字段与约束：" +
                "nodes: Array<{id: string, name: string, type: 'current' | 'target' | 'alternative'}>；" +
                "links: Array<{source: string, target: string, type: 'promotion' | 'career_change', label: string, skills: string[]}>；" +
                "recommendations: Array<{name: string, steps: string[]}>。" +
                "至少包含一条从当前岗位到目标岗位的主路径，并给出 1-2 条备选路径；" +
                "label 应为类似 '1-2年' 这种中文时长描述；" +
                "skills 为建议补全的关键技能列表。" +
                "禁止返回 error 字段或与路径规划无关的其他字段。";

        String userPrompt = "用户信息：" + safeToString(effectiveReq);

        String reply;
        try {
            reply = aiUtils.getChatResponse(systemPrompt, userPrompt);
        } catch (Exception e) {
            reply = null;
        }
        Map<String, Object> pathData = parseProfileJson(reply);
        return normalizeCareerPath(pathData, fallback);
    }

    private CapabilityProfileRequestDTO assembleUserRequest(CapabilityProfileRequestDTO req) {
        return req;
    }

    private Map<String, Object> normalizeCareerPath(Map<String, Object> data, Map<String, Object> fallback) {
        if (data == null) return fallback;
        if (data.containsKey("error")) return fallback;
        Object type = data.get("type");
        if (type != null && "error".equalsIgnoreCase(String.valueOf(type))) return fallback;

        List<Map<String, Object>> nodes = new ArrayList<>();
        Set<String> nodeIds = new HashSet<>();
        Map<String, String> nameToId = new HashMap<>();
        Object rawNodes = data.get("nodes");
        if (rawNodes instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Object idObj = m.get("id");
                Object nameObj = m.get("name");
                if (idObj == null || nameObj == null) continue;
                String id = String.valueOf(idObj).trim();
                String name = String.valueOf(nameObj).trim();
                if (id.isEmpty() || name.isEmpty()) continue;
                String typeRaw = String.valueOf(m.get("type")).trim();
                String safeType = "alternative";
                if ("current".equalsIgnoreCase(typeRaw)) safeType = "current";
                if ("target".equalsIgnoreCase(typeRaw)) safeType = "target";
                if ("alternative".equalsIgnoreCase(typeRaw)) safeType = "alternative";
                if (nodeIds.contains(id)) continue;
                nodeIds.add(id);
                nameToId.put(name, id);
                nodes.add(Map.of("id", id, "name", name, "type", safeType));
            }
        }
        if (nodes.isEmpty()) return fallback;

        List<Map<String, Object>> links = new ArrayList<>();
        Object rawLinks = data.get("links");
        if (rawLinks instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                String sourceRaw = String.valueOf(m.get("source")).trim();
                String targetRaw = String.valueOf(m.get("target")).trim();
                if (sourceRaw.isEmpty() || targetRaw.isEmpty()) continue;
                String source = nodeIds.contains(sourceRaw) ? sourceRaw : nameToId.getOrDefault(sourceRaw, "");
                String target = nodeIds.contains(targetRaw) ? targetRaw : nameToId.getOrDefault(targetRaw, "");
                if (source.isEmpty() || target.isEmpty()) continue;
                String typeRaw = String.valueOf(m.get("type")).trim();
                String safeType = "promotion";
                if ("career_change".equalsIgnoreCase(typeRaw)) safeType = "career_change";
                if ("promotion".equalsIgnoreCase(typeRaw)) safeType = "promotion";
                String label = String.valueOf(m.get("label")).trim();
                if (label.isEmpty()) label = "1-2年";
                List<String> skills = new ArrayList<>();
                Object rawSkills = m.get("skills");
                if (rawSkills instanceof List<?> slist) {
                    for (Object s : slist) {
                        if (s == null) continue;
                        String v = String.valueOf(s).trim();
                        if (v.isEmpty()) continue;
                        skills.add(v);
                        if (skills.size() >= 8) break;
                    }
                }
                if (skills.isEmpty()) {
                    skills = List.of("核心技能提升");
                }
                links.add(Map.of(
                        "source", source,
                        "target", target,
                        "type", safeType,
                        "label", label,
                        "skills", skills
                ));
            }
        }
        if (links.isEmpty()) return fallback;

        List<Map<String, Object>> recs = new ArrayList<>();
        Object rawRecs = data.get("recommendations");
        if (rawRecs instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Object nameObj = m.get("name");
                if (nameObj == null) continue;
                String name = String.valueOf(nameObj).trim();
                if (name.isEmpty()) continue;
                List<String> steps = new ArrayList<>();
                Object rawSteps = m.get("steps");
                if (rawSteps instanceof List<?> sList) {
                    for (Object s : sList) {
                        if (s == null) continue;
                        String v = String.valueOf(s).trim();
                        if (v.isEmpty()) continue;
                        steps.add(v);
                        if (steps.size() >= 10) break;
                    }
                }
                if (steps.isEmpty()) continue;
                recs.add(Map.of("name", name, "steps", steps));
            }
        }
        if (recs.isEmpty()) return fallback;

        Map<String, Object> out = new HashMap<>();
        out.put("nodes", nodes);
        out.put("links", links);
        out.put("recommendations", recs);
        return out;
    }

    private Map<String, Object> buildPathFallback(CapabilityProfileRequestDTO req) {
        Map<String, Object> out = new HashMap<>();
        String targetName = (req != null && req.getTarget() != null && notBlank(req.getTarget().getRole())) 
                ? req.getTarget().getRole() : "目标岗位";
        
        List<Map<String, Object>> nodes = new ArrayList<>();
        nodes.add(Map.of("id", "1", "name", "当前岗位", "type", "current"));
        nodes.add(Map.of("id", "2", "name", targetName, "type", "target"));
        nodes.add(Map.of("id", "3", "name", "备选岗位", "type", "alternative"));

        List<Map<String, Object>> links = new ArrayList<>();
        links.add(Map.of("source", "1", "target", "2", "type", "promotion", "label", "1-3年", "skills", List.of("核心技能强化")));
        links.add(Map.of("source", "1", "target", "3", "type", "career_change", "label", "1-2年", "skills", List.of("跨领域知识")));

        List<Map<String, Object>> recs = new ArrayList<>();
        recs.add(Map.of("name", "主路径", "steps", List.of("当前岗位", targetName)));
        recs.add(Map.of("name", "备选路径", "steps", List.of("当前岗位", "备选岗位")));

        out.put("nodes", nodes);
        out.put("links", links);
        out.put("recommendations", recs);
        return out;
    }

    private boolean notBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }
}
