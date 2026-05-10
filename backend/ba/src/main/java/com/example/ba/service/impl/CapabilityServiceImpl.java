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
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

@Service
public class CapabilityServiceImpl implements CapabilityService {

    private static final Logger log = LoggerFactory.getLogger(CapabilityServiceImpl.class);

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

    // 推理链结果缓存：key = userId:targetRole, value = {steps, timestamp}
    private final ConcurrentHashMap<String, ReasoningCache> reasoningCache = new ConcurrentHashMap<>();
    private static final long CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟

    // 缓存统计
    private final AtomicLong cacheHits = new AtomicLong(0);
    private final AtomicLong cacheMisses = new AtomicLong(0);
    private final AtomicLong cacheEvictions = new AtomicLong(0);

    // 定期清理过期缓存（每5分钟执行一次）
    @Scheduled(fixedRate = 5 * 60 * 1000, initialDelay = 5 * 60 * 1000)
    public void cleanupExpiredCache() {
        int removed = 0;
        for (Map.Entry<String, ReasoningCache> entry : reasoningCache.entrySet()) {
            if (entry.getValue().isExpired()) {
                reasoningCache.remove(entry.getKey());
                removed++;
                cacheEvictions.incrementAndGet();
            }
        }
        if (removed > 0) {
            log.info("Cleaned up {} expired cache entries, current cache size: {}", removed, reasoningCache.size());
        }
    }

    /**
     * 推理链缓存数据结构
     */
    private static class ReasoningCache {
        Map<String, Object> step1Data;
        Map<String, Object> step2Data;
        Map<String, Object> step3Data;
        long timestamp;

        ReasoningCache(Map<String, Object> step1, Map<String, Object> step2, Map<String, Object> step3) {
            this.step1Data = step1;
            this.step2Data = step2;
            this.step3Data = step3;
            this.timestamp = System.currentTimeMillis();
        }

        boolean isValid() {
            return System.currentTimeMillis() - timestamp < CACHE_EXPIRY;
        }

        boolean isExpired() {
            return !isValid();
        }

        Map<String, Object> getStep1Data() {
            return step1Data;
        }

        Map<String, Object> getStep2Data() {
            return step2Data;
        }

        Map<String, Object> getStep3Data() {
            return step3Data;
        }
    }

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
        String targetRole = (req != null && req.getTarget() != null && notBlank(req.getTarget().getRole()))
                ? req.getTarget().getRole() : "目标岗位";

        // 推断当前岗位和中间岗位
        String currentRole = inferCurrentRole(targetRole);
        String intermediateRole = getIntermediateRole(targetRole);

        // 获取各阶段所需技能
        List<String> currentSkills = getRequiredSkillsForRole(currentRole);
        List<String> intermediateSkills = getRequiredSkillsForRole(intermediateRole);
        List<String> targetSkills = getRequiredSkillsForRole(targetRole);

        // 构建节点
        List<Map<String, Object>> nodes = new ArrayList<>();
        nodes.add(Map.of("id", "1", "name", currentRole, "type", "current"));
        nodes.add(Map.of("id", "2", "name", intermediateRole, "type", "intermediate"));
        nodes.add(Map.of("id", "3", "name", targetRole, "type", "target"));

        // 构建连接
        List<Map<String, Object>> links = new ArrayList<>();
        links.add(Map.of(
            "source", "1",
            "target", "2",
            "type", "promotion",
            "label", "1-2年",
            "skills", intermediateSkills.subList(0, Math.min(3, intermediateSkills.size()))
        ));
        links.add(Map.of(
            "source", "2",
            "target", "3",
            "type", "promotion",
            "label", "2-3年",
            "skills", targetSkills.subList(0, Math.min(3, targetSkills.size()))
        ));

        // 构建建议
        List<Map<String, Object>> recs = new ArrayList<>();
        recs.add(Map.of(
            "name", "主要发展路径",
            "steps", List.of(currentRole, intermediateRole, targetRole),
            "description", "通过逐步提升，稳步达成目标"
        ));

        out.put("nodes", nodes);
        out.put("links", links);
        out.put("recommendations", recs);

        log.info("Generated intelligent fallback for target role: {}", targetRole);
        return out;
    }

    private boolean notBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }

    /**
     * 生成缓存键：userId + 目标岗位
     * 确保不同目标岗位使用不同的缓存
     */
    private String generateCacheKey(CapabilityProfileRequestDTO req) {
        if (req.getUserId() == null) {
            return null;
        }

        String targetRole = "unknown";
        if (req.getTarget() != null && notBlank(req.getTarget().getRole())) {
            targetRole = req.getTarget().getRole();
        }

        // 使用 userId:targetRole 作为缓存键
        return req.getUserId() + ":" + targetRole;
    }

    /**
     * 语义校验：检查路径合理性
     * @param graph 图谱数据
     * @return true=合理，false=不合理
     */
    private boolean validatePathSemantics(Map<String, Object> graph) {
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) graph.get("nodes");
        List<Map<String, Object>> links = (List<Map<String, Object>>) graph.get("links");

        if (nodes == null || links == null) {
            return false;
        }

        // 1. 检查节点数量（至少3个）
        if (nodes.size() < 3) {
            log.warn("Path has too few nodes: {}", nodes.size());
            return false;
        }

        // 2. 检查时间跨度合理性（单个阶段不超过5年）
        for (Map<String, Object> link : links) {
            String label = String.valueOf(link.get("label"));
            if (label.contains("年")) {
                int years = extractYears(label);
                if (years > 5) {
                    log.warn("Unrealistic time span: {}", label);
                    return false;
                }
            }
        }

        // 3. 检查是否有"待补充岗位"等占位符
        for (Map<String, Object> node : nodes) {
            String name = String.valueOf(node.get("name"));
            if (name.contains("待补充") || name.contains("占位") || name.equals("null")) {
                log.warn("Found placeholder node: {}", name);
                return false;
            }
        }

        return true;
    }

    /**
     * 从标签中提取年份数字（取最大值）
     * 例如："1-2年" -> 2, "3年" -> 3
     */
    private int extractYears(String label) {
        Pattern pattern = Pattern.compile("(\\d+)[-~]?(\\d+)?年");
        Matcher matcher = pattern.matcher(label);
        if (matcher.find()) {
            String max = matcher.group(2);
            return max != null ? Integer.parseInt(max) : Integer.parseInt(matcher.group(1));
        }
        return 0;
    }

    /**
     * 根据目标岗位推断当前岗位
     */
    private String inferCurrentRole(String targetRole) {
        if (targetRole.contains("高级") || targetRole.contains("资深")) {
            return targetRole.replace("高级", "").replace("资深", "");
        } else if (targetRole.contains("架构师")) {
            return "高级" + targetRole.replace("架构师", "工程师");
        } else if (targetRole.contains("经理") || targetRole.contains("主管")) {
            return targetRole.replace("经理", "专员").replace("主管", "专员");
        }
        return "初级" + targetRole;
    }

    /**
     * 获取中间过渡岗位
     */
    private String getIntermediateRole(String targetRole) {
        if (targetRole.contains("高级")) {
            return targetRole.replace("高级", "中级");
        } else if (targetRole.contains("架构师")) {
            return "高级" + targetRole.replace("架构师", "工程师");
        } else if (targetRole.contains("经理")) {
            return targetRole.replace("经理", "组长");
        }
        return "中级" + targetRole;
    }

    /**
     * 根据岗位获取所需技能列表
     */
    private List<String> getRequiredSkillsForRole(String role) {
        if (role.contains("前端")) {
            return List.of("HTML/CSS/JavaScript", "Vue/React框架", "工程化工具", "性能优化");
        } else if (role.contains("后端")) {
            return List.of("Java/Python/Go", "数据库设计", "微服务架构", "高并发处理");
        } else if (role.contains("产品")) {
            return List.of("需求分析", "原型设计", "数据分析", "项目管理");
        } else if (role.contains("数据")) {
            return List.of("Python/SQL", "机器学习", "数据可视化", "业务理解");
        } else if (role.contains("测试")) {
            return List.of("测试用例设计", "自动化测试", "性能测试", "质量保障");
        } else if (role.contains("运维")) {
            return List.of("Linux系统", "Docker/K8s", "监控告警", "自动化部署");
        }
        return List.of("专业技能", "沟通协作", "问题解决", "持续学习");
    }

    /**
     * 解析并校验JSON响应
     * @param jsonString AI返回的JSON字符串
     * @return 解析后的Map，如果解析失败或为空则返回null
     */
    private Map<String, Object> parseAndValidate(String jsonString) {
        if (jsonString == null || jsonString.trim().isEmpty()) {
            return null;
        }
        Map<String, Object> parsed = parseProfileJson(jsonString);
        if (parsed == null || parsed.isEmpty()) {
            return null;
        }
        return parsed;
    }

    /**
     * 能力画像推理链 - 步骤1兜底数据（用户背景分析）
     */
    private String getProfileStep1Fallback(CapabilityProfileRequestDTO req) {
        return "用户背景分析：基于提供的基本信息，用户具备一定的教育背景和技能基础。";
    }

    /**
     * 能力画像推理链 - 步骤2兜底数据（人格与价值观）
     */
    private String getProfileStep2Fallback(CapabilityProfileRequestDTO req) {
        return "人格与价值观分析：用户展现出积极的工作态度和学习意愿，重视个人成长和职业发展。";
    }

    /**
     * 能力画像推理链 - 步骤3兜底数据（技能与竞争力）
     */
    private String getProfileStep3Fallback(CapabilityProfileRequestDTO req) {
        return "技能与竞争力分析：用户具备基础技能储备，通过系统学习和实践可以进一步提升竞争力。";
    }

    /**
     * 能力画像推理链 - 步骤4兜底数据（综合能力画像JSON）
     */
    private Map<String, Object> getProfileStep4Fallback(CapabilityProfileRequestDTO req) {
        Map<String, Object> fallback = buildFallback(req);
        log.warn("Step 4 using fallback profile data");
        return fallback;
    }

    /**
     * 能力画像推理链 - 步骤5兜底数据（推荐岗位关键词）
     */
    private Map<String, Object> getProfileStep5Fallback(CapabilityProfileRequestDTO req) {
        Map<String, Object> keywords = new HashMap<>();
        List<String> defaultKeywords = new ArrayList<>();
        List<String> defaultTitles = new ArrayList<>();

        if (req != null && req.getTarget() != null && notBlank(req.getTarget().getRole())) {
            defaultTitles.add(req.getTarget().getRole());
            defaultKeywords.add(req.getTarget().getRole());
        } else {
            defaultTitles.add("初级岗位");
            defaultKeywords.add("通用技能");
        }

        keywords.put("recommendedKeywords", defaultKeywords);
        keywords.put("recommendedJobTitles", defaultTitles);
        log.warn("Step 5 using fallback keywords");
        return keywords;
    }

    /**
     * 职业路径推理链 - 步骤1兜底数据（当前能力基线）
     */
    private String getPathStep1Fallback(CapabilityProfileRequestDTO req) {
        return "当前能力基线分析：用户具备基础能力，需要通过系统学习和实践来提升专业技能。";
    }

    /**
     * 职业路径推理链 - 步骤2兜底数据（目标岗位要求）
     */
    private String getPathStep2Fallback(CapabilityProfileRequestDTO req) {
        String targetRole = (req != null && req.getTarget() != null && notBlank(req.getTarget().getRole()))
                ? req.getTarget().getRole() : "目标岗位";
        return "目标岗位要求分析：" + targetRole + "需要扎实的专业技能、良好的沟通能力和持续学习的态度。";
    }

    /**
     * 职业路径推理链 - 步骤3兜底数据（差距分析）
     */
    private String getPathStep3Fallback(CapabilityProfileRequestDTO req) {
        return "差距分析：需要重点提升专业技能深度、项目经验积累和行业认知水平。";
    }

    /**
     * 职业路径推理链 - 步骤4兜底数据（分阶段路径JSON）
     */
    private Map<String, Object> getPathStep4Fallback(CapabilityProfileRequestDTO req) {
        Map<String, Object> fallback = buildPathFallback(req);
        log.warn("Step 4 using fallback path data");
        return fallback;
    }

    /**
     * 六步推理链生成能力画像（流式）- 带完整异常兜底
     */
    public Map<String, Object> generateProfileWithChain(CapabilityProfileRequestDTO req, SseEmitter emitter) {
        long startTime = System.currentTimeMillis();
        log.info("Starting profile generation with reasoning chain");

        CapabilityProfileRequestDTO effectiveReq = assembleUserRequest(req);
        Map<String, Object> fallback = buildFallback(effectiveReq);

        String systemPrompt = "你是职业规划平台的分析引擎。请根据用户信息进行分析，输出简洁的文字或JSON格式。";
        List<Map<String, String>> conversationHistory = new ArrayList<>();

        try {
            // 步骤一：解析用户背景
            long step1Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 1,
                "total", 6,
                "summary", "正在分析你的教育背景与经历..."
            ));

            String step1Response;
            String step1Prompt = "请分析用户的教育背景、工作经验和技能：\n" + safeToString(effectiveReq);
            try {
                step1Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step1Prompt);
                if (step1Response == null || step1Response.trim().isEmpty()) {
                    log.warn("Step 1 returned empty response, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤1执行异常：AI返回空响应",
                        "step", 1,
                        "total", 6,
                        "errorType", "EMPTY_RESPONSE",
                        "suggestion", "AI服务返回了空响应，已使用默认数据继续"
                    ));
                    step1Response = getProfileStep1Fallback(effectiveReq);
                }
            } catch (Exception e) {
                log.error("Step 1 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤1执行失败：" + e.getMessage(),
                    "step", 1,
                    "total", 6,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step1Response = getProfileStep1Fallback(effectiveReq);
            }
            conversationHistory.add(Map.of("role", "user", "content", step1Prompt));
            conversationHistory.add(Map.of("role", "assistant", "content", step1Response));
            long step1Duration = System.currentTimeMillis() - step1Start;
            log.info("Step 1 completed in {}ms", step1Duration);

            // 步骤二：分析人格与价值观
            long step2Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 2,
                "total", 6,
                "summary", "正在分析你的人格特质与价值观..."
            ));

            String step2Response;
            String step2Prompt = "基于前面的分析，请评估用户的人格特质、工作风格和核心价值观。";
            try {
                step2Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step2Prompt);
                if (step2Response == null || step2Response.trim().isEmpty()) {
                    log.warn("Step 2 returned empty response, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤2执行异常：AI返回空响应",
                        "step", 2,
                        "total", 6,
                        "errorType", "EMPTY_RESPONSE",
                        "suggestion", "AI服务返回了空响应，已使用默认数据继续"
                    ));
                    step2Response = getProfileStep2Fallback(effectiveReq);
                }
            } catch (Exception e) {
                log.error("Step 2 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤2执行失败：" + e.getMessage(),
                    "step", 2,
                    "total", 6,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step2Response = getProfileStep2Fallback(effectiveReq);
            }
            conversationHistory.add(Map.of("role", "user", "content", step2Prompt));
            conversationHistory.add(Map.of("role", "assistant", "content", step2Response));
            long step2Duration = System.currentTimeMillis() - step2Start;
            log.info("Step 2 completed in {}ms", step2Duration);

            // 步骤三：分析技能与竞争力
            long step3Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 3,
                "total", 6,
                "summary", "正在分析你的技能与竞争力..."
            ));

            String step3Response;
            String step3Prompt = "基于前面的分析，请评估用户的技能矩阵和整体竞争力。";
            try {
                step3Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step3Prompt);
                if (step3Response == null || step3Response.trim().isEmpty()) {
                    log.warn("Step 3 returned empty response, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤3执行异常：AI返回空响应",
                        "step", 3,
                        "total", 6,
                        "errorType", "EMPTY_RESPONSE",
                        "suggestion", "AI服务返回了空响应，已使用默认数据继续"
                    ));
                    step3Response = getProfileStep3Fallback(effectiveReq);
                }
            } catch (Exception e) {
                log.error("Step 3 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤3执行失败：" + e.getMessage(),
                    "step", 3,
                    "total", 6,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step3Response = getProfileStep3Fallback(effectiveReq);
            }
            conversationHistory.add(Map.of("role", "user", "content", step3Prompt));
            conversationHistory.add(Map.of("role", "assistant", "content", step3Response));
            long step3Duration = System.currentTimeMillis() - step3Start;
            log.info("Step 3 completed in {}ms", step3Duration);

            // 缓存前3步结果供路径规划复用
            String cacheKey = generateCacheKey(effectiveReq);
            if (cacheKey != null) {
                Map<String, Object> step1Data = Map.of("response", step1Response, "prompt", step1Prompt);
                Map<String, Object> step2Data = Map.of("response", step2Response, "prompt", step2Prompt);
                Map<String, Object> step3Data = Map.of("response", step3Response, "prompt", step3Prompt);
                reasoningCache.put(cacheKey, new ReasoningCache(step1Data, step2Data, step3Data));
                log.info("Cached reasoning chain steps 1-3 for key: {}", cacheKey);
            }

            // 步骤四：综合生成能力画像
            long step4Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 4,
                "total", 6,
                "summary", "正在生成综合能力画像..."
            ));

            Map<String, Object> step4Data;
            String step4Prompt = "基于前面的所有分析，请生成完整的能力画像JSON。\n\n" +
                "【输出要求】\n" +
                "1. 必须输出纯JSON格式，不要包含任何解释文字、Markdown标记或代码块符号\n" +
                "2. JSON必须包含以下字段（缺一不可）：\n" +
                "   - completenessScore: 整数，范围0-100，表示信息完整度\n" +
                "   - competitivenessStars: 整数，范围1-5，表示竞争力星级\n" +
                "   - tags: 字符串数组，3-5个标签，描述用户特点\n" +
                "   - radar: 对象，包含indicators数组和values数组\n" +
                "     * indicators: 数组，每项包含name(维度名称)和max(最大值100)\n" +
                "     * values: 数字数组，与indicators一一对应，范围0-100\n" +
                "   - suggestions: 对象，包含shortTerm和longTerm两个字符串字段\n\n" +
                "【质量标准】\n" +
                "- completenessScore: 根据用户提供的信息量评估，信息越详细分数越高\n" +
                "- competitivenessStars: 综合评估用户的教育背景、工作经验、技能水平\n" +
                "- tags: 使用简洁的词汇，如\"技术驱动\"、\"快速学习者\"、\"团队协作\"等\n" +
                "- radar维度: 建议包含\"专业技能\"、\"学习能力\"、\"沟通表达\"、\"创新思维\"、\"执行力\"、\"团队协作\"、\"抗压能力\"等7个维度\n" +
                "- suggestions: shortTerm建议3-6个月内的行动，longTerm建议1-2年的发展方向\n\n" +
                "【输出示例】\n" +
                "{\n" +
                "  \"completenessScore\": 75,\n" +
                "  \"competitivenessStars\": 4,\n" +
                "  \"tags\": [\"技术驱动\", \"快速学习\", \"项目经验丰富\", \"善于沟通\"],\n" +
                "  \"radar\": {\n" +
                "    \"indicators\": [\n" +
                "      {\"name\": \"专业技能\", \"max\": 100},\n" +
                "      {\"name\": \"学习能力\", \"max\": 100},\n" +
                "      {\"name\": \"沟通表达\", \"max\": 100},\n" +
                "      {\"name\": \"创新思维\", \"max\": 100},\n" +
                "      {\"name\": \"执行力\", \"max\": 100},\n" +
                "      {\"name\": \"团队协作\", \"max\": 100},\n" +
                "      {\"name\": \"抗压能力\", \"max\": 100}\n" +
                "    ],\n" +
                "    \"values\": [85, 80, 75, 70, 80, 85, 75]\n" +
                "  },\n" +
                "  \"suggestions\": {\n" +
                "    \"shortTerm\": \"建议在未来3-6个月内：1) 深化前端框架的实战经验，完成2-3个完整项目；2) 学习TypeScript和工程化工具；3) 参与开源项目提升代码质量意识\",\n" +
                "    \"longTerm\": \"1-2年发展方向：1) 向高级前端工程师方向发展，掌握性能优化和架构设计；2) 培养跨端开发能力；3) 提升技术影响力，可以考虑技术分享或博客写作\"\n" +
                "  }\n" +
                "}\n\n" +
                "请严格按照上述格式输出JSON：";
            try {
                String step4Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step4Prompt);
                step4Data = parseAndValidate(step4Response);
                if (step4Data == null || step4Data.isEmpty()) {
                    log.warn("Step 4 returned invalid JSON, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤4执行异常：AI返回的JSON格式无效",
                        "step", 4,
                        "total", 6,
                        "errorType", "INVALID_JSON",
                        "suggestion", "AI返回的数据格式不正确，已使用默认数据继续"
                    ));
                    step4Data = getProfileStep4Fallback(effectiveReq);
                }
                conversationHistory.add(Map.of("role", "user", "content", step4Prompt));
                conversationHistory.add(Map.of("role", "assistant", "content", step4Response));
            } catch (Exception e) {
                log.error("Step 4 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤4执行失败：" + e.getMessage(),
                    "step", 4,
                    "total", 6,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step4Data = getProfileStep4Fallback(effectiveReq);
                conversationHistory.add(Map.of("role", "user", "content", step4Prompt));
                conversationHistory.add(Map.of("role", "assistant", "content", objectMapper.writeValueAsString(step4Data)));
            }
            long step4Duration = System.currentTimeMillis() - step4Start;
            log.info("Step 4 completed in {}ms", step4Duration);

            // 步骤五：生成推荐岗位关键词
            long step5Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 5,
                "total", 6,
                "summary", "正在生成推荐岗位关键词..."
            ));

            Map<String, Object> step5Data;
            String step5Prompt = "基于能力画像，请推荐适合用户的岗位关键词和岗位名称。\n\n" +
                "【输出要求】\n" +
                "1. 必须输出纯JSON格式，不要包含任何解释文字\n" +
                "2. JSON必须包含以下字段：\n" +
                "   - recommendedKeywords: 字符串数组，2-3个岗位关键词\n" +
                "   - recommendedJobTitles: 字符串数组，2-3个具体岗位名称\n\n" +
                "【推荐原则】\n" +
                "- 关键词应该是岗位类别或技能方向，如\"前端开发\"、\"数据分析\"、\"产品设计\"等\n" +
                "- 岗位名称应该是具体的职位，如\"前端工程师\"、\"数据分析师\"、\"产品经理\"等\n" +
                "- 推荐的岗位应该与用户的教育背景、工作经验、技能水平相匹配\n" +
                "- 优先推荐用户目标岗位相关的职位\n" +
                "- 可以包含1个略高于当前水平的挑战性岗位\n\n" +
                "【输出示例】\n" +
                "{\n" +
                "  \"recommendedKeywords\": [\"前端开发\", \"全栈开发\", \"移动端开发\"],\n" +
                "  \"recommendedJobTitles\": [\"前端工程师\", \"全栈工程师\", \"React Native开发工程师\"]\n" +
                "}\n\n" +
                "请严格按照上述格式输出JSON：";
            try {
                String step5Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step5Prompt);
                step5Data = parseAndValidate(step5Response);
                if (step5Data == null || step5Data.isEmpty()) {
                    log.warn("Step 5 returned invalid JSON, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤5执行异常：AI返回的JSON格式无效",
                        "step", 5,
                        "total", 6,
                        "errorType", "INVALID_JSON",
                        "suggestion", "AI返回的数据格式不正确，已使用默认数据继续"
                    ));
                    step5Data = getProfileStep5Fallback(effectiveReq);
                }
                conversationHistory.add(Map.of("role", "user", "content", step5Prompt));
                conversationHistory.add(Map.of("role", "assistant", "content", step5Response));
            } catch (Exception e) {
                log.error("Step 5 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤5执行失败：" + e.getMessage(),
                    "step", 5,
                    "total", 6,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step5Data = getProfileStep5Fallback(effectiveReq);
                step5Data = getProfileStep5Fallback(effectiveReq);
                conversationHistory.add(Map.of("role", "user", "content", step5Prompt));
                conversationHistory.add(Map.of("role", "assistant", "content", objectMapper.writeValueAsString(step5Data)));
            }
            long step5Duration = System.currentTimeMillis() - step5Start;
            log.info("Step 5 completed in {}ms", step5Duration);

            // 步骤六：组装最终响应
            long step6Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 6,
                "total", 6,
                "summary", "正在组装最终结果..."
            ));

            // 合并步骤4和步骤5的数据
            Map<String, Object> profile = new HashMap<>(step4Data);
            profile.putAll(step5Data);

            Map<String, Object> normalized = normalizeProfile(profile, fallback);

            // 获取推荐岗位
            List<String> searchTerms = buildJobSearchTerms(normalized, effectiveReq);
            String keyword = searchTerms.isEmpty() ? pickKeyword(normalized, effectiveReq) : searchTerms.get(0);
            List<JobInfo> recommendedJobs = buildRecommendedJobsFromTitlesOrKeywords(normalized, searchTerms, keyword);
            List<Integer> matchScores = buildMatchScores(normalized, recommendedJobs);

            long step6Duration = System.currentTimeMillis() - step6Start;
            log.info("Step 6 completed in {}ms", step6Duration);

            long totalDuration = System.currentTimeMillis() - startTime;
            log.info("Profile generation completed in {}ms (step1:{}ms, step2:{}ms, step3:{}ms, step4:{}ms, step5:{}ms, step6:{}ms)",
                totalDuration, step1Duration, step2Duration, step3Duration, step4Duration, step5Duration, step6Duration);

            return buildProfileResponse(normalized, recommendedJobs, matchScores, keyword);

        } catch (Exception e) {
            long totalDuration = System.currentTimeMillis() - startTime;
            log.error("六步推理链生成能力画像失败，降级到原有方法，耗时{}ms", totalDuration, e);
            String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                              e.getMessage().contains("connect") ? "NETWORK" : "SYSTEM_ERROR";
            AiUtils.sendSseEvent(emitter, "error", Map.of(
                "message", "推理链执行失败：" + e.getMessage(),
                "errorType", errorType,
                "suggestion", errorType.equals("NETWORK") ? "网络连接异常，请检查网络后重试" :
                             errorType.equals("TIMEOUT") ? "请求超时，请稍后重试" :
                             "系统异常，已使用默认方案生成"
            ));
            // 降级到原有方法
            return generateProfile(req);
        }
    }

    /**
     * 五步推理链生成职业路径规划（流式）- 带完整异常兜底
     */
    public Map<String, Object> generateCareerPathWithChain(CapabilityProfileRequestDTO req, SseEmitter emitter) {
        long startTime = System.currentTimeMillis();
        log.info("Starting career path generation with reasoning chain");

        CapabilityProfileRequestDTO effectiveReq = assembleUserRequest(req);
        Map<String, Object> fallback = buildPathFallback(effectiveReq);

        String systemPrompt = "你是职业规划平台的路径规划引擎。请根据用户信息进行分析，输出简洁的文字或JSON格式。";
        List<Map<String, String>> conversationHistory = new ArrayList<>();

        try {
            // 检查是否存在有效的推理链缓存
            String cacheKey = generateCacheKey(effectiveReq);
            ReasoningCache cache = null;
            if (cacheKey != null) {
                cache = reasoningCache.get(cacheKey);
                if (cache != null && !cache.isExpired()) {
                    cacheHits.incrementAndGet(); // 缓存命中统计
                    long cacheHitTime = System.currentTimeMillis();
                    log.info("Cache hit! Reusing cached reasoning chain steps 1-3 for key: {}", cacheKey);

                    // 从缓存中提取步骤1-3的数据并填充到 conversationHistory
                    Map<String, Object> step1Data = cache.getStep1Data();
                    Map<String, Object> step2Data = cache.getStep2Data();
                    Map<String, Object> step3Data = cache.getStep3Data();

                    conversationHistory.add(Map.of("role", "user", "content", (String) step1Data.get("prompt")));
                    conversationHistory.add(Map.of("role", "assistant", "content", (String) step1Data.get("response")));
                    conversationHistory.add(Map.of("role", "user", "content", (String) step2Data.get("prompt")));
                    conversationHistory.add(Map.of("role", "assistant", "content", (String) step2Data.get("response")));
                    conversationHistory.add(Map.of("role", "user", "content", (String) step3Data.get("prompt")));
                    conversationHistory.add(Map.of("role", "assistant", "content", (String) step3Data.get("response")));

                    long cacheLoadDuration = System.currentTimeMillis() - cacheHitTime;
                    log.info("Cache loaded in {}ms", cacheLoadDuration);

                    // 直接跳到步骤四：生成分阶段路径
                    long step4Start = System.currentTimeMillis();
                    AiUtils.sendSseEvent(emitter, "step", Map.of(
                        "step", 4,
                        "total", 5,
                        "summary", "正在生成分阶段职业路径..."
                    ));

                    Map<String, Object> step4Data;
                    String step4Prompt = "基于差距分析，请生成职业发展路径图谱JSON。\n\n" +
                        "【输出要求】\n" +
                        "1. 必须输出纯JSON格式，不要包含任何解释文字、Markdown标记或代码块符号\n" +
                        "2. JSON必须包含以下字段：\n" +
                        "   - nodes: 节点数组，每个节点包含id、name、type字段\n" +
                        "   - links: 链接数组，每个链接包含source、target、type、label、skills字段\n" +
                        "   - recommendations: 推荐路径数组，每个推荐包含name和steps字段\n\n" +
                        "【节点设计规范】\n" +
                        "- 至少包含3-5个节点\n" +
                        "- type取值：'current'(当前岗位)、'target'(目标岗位)、'alternative'(备选岗位)\n" +
                        "- name必须是具体的岗位名称，如\"前端工程师\"、\"高级前端工程师\"，避免\"待补充岗位\"等模糊表述\n" +
                        "- id使用简单的数字字符串：\"1\", \"2\", \"3\"等\n\n" +
                        "【链接设计规范】\n" +
                        "- source和target必须对应nodes中的id\n" +
                        "- type取值：'promotion'(晋升)、'career_change'(转岗)\n" +
                        "- label表示时间跨度，遵循以下原则：\n" +
                        "  * 初级到中级：1-2年\n" +
                        "  * 中级到高级：2-3年\n" +
                        "  * 高级到专家：3-5年\n" +
                        "- skills数组包含2-4个关键技能，每个阶段的技能应基于前一阶段逐步深化\n\n" +
                        "【推荐路径规范】\n" +
                        "- 至少包含1条主路径\n" +
                        "- steps数组包含岗位名称序列，展示完整的职业发展路径\n\n" +
                        "【输出示例】\n" +
                        "{\n" +
                        "  \"nodes\": [\n" +
                        "    {\"id\": \"1\", \"name\": \"前端工程师\", \"type\": \"current\"},\n" +
                        "    {\"id\": \"2\", \"name\": \"高级前端工程师\", \"type\": \"alternative\"},\n" +
                        "    {\"id\": \"3\", \"name\": \"前端技术专家\", \"type\": \"target\"}\n" +
                        "  ],\n" +
                        "  \"links\": [\n" +
                        "    {\n" +
                        "      \"source\": \"1\",\n" +
                        "      \"target\": \"2\",\n" +
                        "      \"type\": \"promotion\",\n" +
                        "      \"label\": \"1-2年\",\n" +
                        "      \"skills\": [\"Vue3深度实践\", \"TypeScript精通\", \"工程化体系\", \"性能优化\"]\n" +
                        "    },\n" +
                        "    {\n" +
                        "      \"source\": \"2\",\n" +
                        "      \"target\": \"3\",\n" +
                        "      \"type\": \"promotion\",\n" +
                        "      \"label\": \"2-3年\",\n" +
                        "      \"skills\": [\"前端架构设计\", \"团队技术规划\", \"跨端技术方案\", \"技术影响力\"]\n" +
                        "    }\n" +
                        "  ],\n" +
                        "  \"recommendations\": [\n" +
                        "    {\n" +
                        "      \"name\": \"主路径\",\n" +
                        "      \"steps\": [\"前端工程师\", \"高级前端工程师\", \"前端技术专家\"]\n" +
                        "    }\n" +
                        "  ]\n" +
                        "}\n\n" +
                        "请严格按照上述格式输出JSON：";
                    try {
                        String step4Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step4Prompt);
                        step4Data = parseAndValidate(step4Response);
                        if (step4Data == null || step4Data.isEmpty()) {
                            log.warn("Path Step 4 returned invalid JSON, using fallback");
                            AiUtils.sendSseEvent(emitter, "error", Map.of(
                                "message", "步骤4执行异常：AI返回的JSON格式无效",
                                "step", 4,
                                "total", 5,
                                "errorType", "INVALID_JSON",
                                "suggestion", "AI返回的数据格式不正确，已使用默认数据继续"
                            ));
                            step4Data = getPathStep4Fallback(effectiveReq);
                        }
                        conversationHistory.add(Map.of("role", "user", "content", step4Prompt));
                        conversationHistory.add(Map.of("role", "assistant", "content", step4Response));
                    } catch (Exception e) {
                        log.error("Path Step 4 failed, using fallback", e);
                        String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                          e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                        AiUtils.sendSseEvent(emitter, "error", Map.of(
                            "message", "步骤4执行失败：" + e.getMessage(),
                            "step", 4,
                            "total", 5,
                            "errorType", errorType,
                            "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                        ));
                        step4Data = getPathStep4Fallback(effectiveReq);
                        conversationHistory.add(Map.of("role", "user", "content", step4Prompt));
                        conversationHistory.add(Map.of("role", "assistant", "content", objectMapper.writeValueAsString(step4Data)));
                    }
                    long step4Duration = System.currentTimeMillis() - step4Start;
                    log.info("Step 4 completed in {}ms", step4Duration);

                    // 步骤五：校验与组装（包含悬空节点修复）
                    long step5Start = System.currentTimeMillis();
                    AiUtils.sendSseEvent(emitter, "step", Map.of(
                        "step", 5,
                        "total", 5,
                        "summary", "正在校验和组装最终路径..."
                    ));

                    // 验证并修复图谱结构
                    Map<String, Object> validatedGraph = validateAndFixGraph(step4Data, fallback);
                    Map<String, Object> normalized = normalizeCareerPath(validatedGraph, fallback);

                    long step5Duration = System.currentTimeMillis() - step5Start;
                    log.info("Step 5 completed in {}ms", step5Duration);

                    long totalDuration = System.currentTimeMillis() - startTime;
                    log.info("Career path generation completed with cache in {}ms (cache_load:{}ms, step4:{}ms, step5:{}ms)",
                        totalDuration, cacheLoadDuration, step4Duration, step5Duration);

                    return normalized;
                } else if (cache != null) {
                    cacheMisses.incrementAndGet(); // 缓存过期统计
                    cacheEvictions.incrementAndGet(); // 缓存驱逐统计
                    log.info("Cache expired for key: {}, executing full reasoning chain", cacheKey);
                    reasoningCache.remove(cacheKey);
                } else {
                    cacheMisses.incrementAndGet(); // 缓存未命中统计
                    log.info("Cache miss for key: {}, executing full reasoning chain", cacheKey);
                }
            }

            // 缓存未命中或已过期，执行完整的5步推理链
            // 步骤一：提取当前能力基线
            long step1Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 1,
                "total", 5,
                "summary", "正在分析你的当前能力基线..."
            ));

            String step1Response;
            String step1Prompt = "请分析用户的当前能力水平、优势和不足：\n" + safeToString(effectiveReq);
            try {
                step1Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step1Prompt);
                if (step1Response == null || step1Response.trim().isEmpty()) {
                    log.warn("Path Step 1 returned empty response, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤1执行异常：AI返回空响应",
                        "step", 1,
                        "total", 5,
                        "errorType", "EMPTY_RESPONSE",
                        "suggestion", "AI服务返回了空响应，已使用默认数据继续"
                    ));
                    step1Response = getPathStep1Fallback(effectiveReq);
                }
            } catch (Exception e) {
                log.error("Path Step 1 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤1执行失败：" + e.getMessage(),
                    "step", 1,
                    "total", 5,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step1Response = getPathStep1Fallback(effectiveReq);
            }
            conversationHistory.add(Map.of("role", "user", "content", step1Prompt));
            conversationHistory.add(Map.of("role", "assistant", "content", step1Response));
            long step1Duration = System.currentTimeMillis() - step1Start;
            log.info("Step 1 completed in {}ms", step1Duration);

            // 步骤二：解析目标岗位要求
            long step2Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 2,
                "total", 5,
                "summary", "正在分析目标岗位要求..."
            ));

            String step2Response;
            String targetRole = (effectiveReq.getTarget() != null && notBlank(effectiveReq.getTarget().getRole()))
                ? effectiveReq.getTarget().getRole() : "目标岗位";
            String step2Prompt = "请详细分析【" + targetRole + "】这个岗位的能力要求、典型发展路径和行业洞察。";
            try {
                step2Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step2Prompt);
                if (step2Response == null || step2Response.trim().isEmpty()) {
                    log.warn("Path Step 2 returned empty response, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤2执行异常：AI返回空响应",
                        "step", 2,
                        "total", 5,
                        "errorType", "EMPTY_RESPONSE",
                        "suggestion", "AI服务返回了空响应，已使用默认数据继续"
                    ));
                    step2Response = getPathStep2Fallback(effectiveReq);
                }
            } catch (Exception e) {
                log.error("Path Step 2 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤2执行失败：" + e.getMessage(),
                    "step", 2,
                    "total", 5,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step2Response = getPathStep2Fallback(effectiveReq);
            }
            conversationHistory.add(Map.of("role", "user", "content", step2Prompt));
            conversationHistory.add(Map.of("role", "assistant", "content", step2Response));
            long step2Duration = System.currentTimeMillis() - step2Start;
            log.info("Step 2 completed in {}ms", step2Duration);

            // 步骤三：差距分析
            long step3Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 3,
                "total", 5,
                "summary", "正在进行能力差距分析..."
            ));

            String step3Response;
            String step3Prompt = "基于前面的分析，请详细对比用户当前能力与目标岗位要求的差距，列出需要提升的关键领域和优先级。";
            try {
                step3Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step3Prompt);
                if (step3Response == null || step3Response.trim().isEmpty()) {
                    log.warn("Path Step 3 returned empty response, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤3执行异常：AI返回空响应",
                        "step", 3,
                        "total", 5,
                        "errorType", "EMPTY_RESPONSE",
                        "suggestion", "AI服务返回了空响应，已使用默认数据继续"
                    ));
                    step3Response = getPathStep3Fallback(effectiveReq);
                }
            } catch (Exception e) {
                log.error("Path Step 3 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤3执行失败：" + e.getMessage(),
                    "step", 3,
                    "total", 5,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step3Response = getPathStep3Fallback(effectiveReq);
            }
            conversationHistory.add(Map.of("role", "user", "content", step3Prompt));
            conversationHistory.add(Map.of("role", "assistant", "content", step3Response));
            long step3Duration = System.currentTimeMillis() - step3Start;
            log.info("Step 3 completed in {}ms", step3Duration);

            // 步骤四：生成分阶段路径
            long step4Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 4,
                "total", 5,
                "summary", "正在生成分阶段职业路径..."
            ));

            Map<String, Object> step4Data;
            String step4Prompt = "基于差距分析，请生成职业发展路径图谱JSON。\n\n" +
                "【输出要求】\n" +
                "1. 必须输出纯JSON格式，不要包含任何解释文字、Markdown标记或代码块符号\n" +
                "2. JSON必须包含以下字段：\n" +
                "   - nodes: 节点数组，每个节点包含id、name、type字段\n" +
                "   - links: 链接数组，每个链接包含source、target、type、label、skills字段\n" +
                "   - recommendations: 推荐路径数组，每个推荐包含name和steps字段\n\n" +
                "【节点设计规范】\n" +
                "- 至少包含3-5个节点\n" +
                "- type取值：'current'(当前岗位)、'target'(目标岗位)、'alternative'(备选岗位)\n" +
                "- name必须是具体的岗位名称，如\"前端工程师\"、\"高级前端工程师\"，避免\"待补充岗位\"等模糊表述\n" +
                "- id使用简单的数字字符串：\"1\", \"2\", \"3\"等\n\n" +
                "【链接设计规范】\n" +
                "- source和target必须对应nodes中的id\n" +
                "- type取值：'promotion'(晋升)、'career_change'(转岗)\n" +
                "- label表示时间跨度，遵循以下原则：\n" +
                "  * 初级到中级：1-2年\n" +
                "  * 中级到高级：2-3年\n" +
                "  * 高级到专家：3-5年\n" +
                "- skills数组包含2-4个关键技能，每个阶段的技能应基于前一阶段逐步深化\n\n" +
                "【推荐路径规范】\n" +
                "- 至少包含1条主路径\n" +
                "- steps数组包含岗位名称序列，展示完整的职业发展路径\n\n" +
                "【输出示例】\n" +
                "{\n" +
                "  \"nodes\": [\n" +
                "    {\"id\": \"1\", \"name\": \"前端工程师\", \"type\": \"current\"},\n" +
                "    {\"id\": \"2\", \"name\": \"高级前端工程师\", \"type\": \"alternative\"},\n" +
                "    {\"id\": \"3\", \"name\": \"前端技术专家\", \"type\": \"target\"}\n" +
                "  ],\n" +
                "  \"links\": [\n" +
                "    {\n" +
                "      \"source\": \"1\",\n" +
                "      \"target\": \"2\",\n" +
                "      \"type\": \"promotion\",\n" +
                "      \"label\": \"1-2年\",\n" +
                "      \"skills\": [\"Vue3深度实践\", \"TypeScript精通\", \"工程化体系\", \"性能优化\"]\n" +
                "    },\n" +
                "    {\n" +
                "      \"source\": \"2\",\n" +
                "      \"target\": \"3\",\n" +
                "      \"type\": \"promotion\",\n" +
                "      \"label\": \"2-3年\",\n" +
                "      \"skills\": [\"前端架构设计\", \"团队技术规划\", \"跨端技术方案\", \"技术影响力\"]\n" +
                "    }\n" +
                "  ],\n" +
                "  \"recommendations\": [\n" +
                "    {\n" +
                "      \"name\": \"主路径\",\n" +
                "      \"steps\": [\"前端工程师\", \"高级前端工程师\", \"前端技术专家\"]\n" +
                "    }\n" +
                "  ]\n" +
                "}\n\n" +
                "请严格按照上述格式输出JSON：";
            try {
                String step4Response = aiUtils.getChatResponseWithHistory(systemPrompt, conversationHistory, step4Prompt);
                step4Data = parseAndValidate(step4Response);
                if (step4Data == null || step4Data.isEmpty()) {
                    log.warn("Path Step 4 returned invalid JSON, using fallback");
                    AiUtils.sendSseEvent(emitter, "error", Map.of(
                        "message", "步骤4执行异常：AI返回的JSON格式无效",
                        "step", 4,
                        "total", 5,
                        "errorType", "INVALID_JSON",
                        "suggestion", "AI返回的数据格式不正确，已使用默认数据继续"
                    ));
                    step4Data = getPathStep4Fallback(effectiveReq);
                }
                conversationHistory.add(Map.of("role", "user", "content", step4Prompt));
                conversationHistory.add(Map.of("role", "assistant", "content", step4Response));
            } catch (Exception e) {
                log.error("Path Step 4 failed, using fallback", e);
                String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                                  e.getMessage().contains("connect") ? "NETWORK" : "AI_ERROR";
                AiUtils.sendSseEvent(emitter, "error", Map.of(
                    "message", "步骤4执行失败：" + e.getMessage(),
                    "step", 4,
                    "total", 5,
                    "errorType", errorType,
                    "suggestion", errorType.equals("NETWORK") ? "请检查网络连接后重试" : "AI服务暂时不可用，已使用默认数据继续"
                ));
                step4Data = getPathStep4Fallback(effectiveReq);
                conversationHistory.add(Map.of("role", "user", "content", step4Prompt));
                conversationHistory.add(Map.of("role", "assistant", "content", objectMapper.writeValueAsString(step4Data)));
            }
            long step4Duration = System.currentTimeMillis() - step4Start;
            log.info("Step 4 completed in {}ms", step4Duration);

            // 步骤五：校验与组装（包含悬空节点修复）
            long step5Start = System.currentTimeMillis();
            AiUtils.sendSseEvent(emitter, "step", Map.of(
                "step", 5,
                "total", 5,
                "summary", "正在校验和组装最终路径..."
            ));

            // 验证并修复图谱结构
            Map<String, Object> validatedGraph = validateAndFixGraph(step4Data, fallback);
            Map<String, Object> normalized = normalizeCareerPath(validatedGraph, fallback);

            long step5Duration = System.currentTimeMillis() - step5Start;
            log.info("Step 5 completed in {}ms", step5Duration);

            long totalDuration = System.currentTimeMillis() - startTime;
            log.info("Career path generation completed in {}ms (step1:{}ms, step2:{}ms, step3:{}ms, step4:{}ms, step5:{}ms)",
                totalDuration, step1Duration, step2Duration, step3Duration, step4Duration, step5Duration);

            return normalized;

        } catch (Exception e) {
            long totalDuration = System.currentTimeMillis() - startTime;
            log.error("五步推理链生成职业路径失败，降级到原有方法，耗时{}ms", totalDuration, e);
            String errorType = e.getMessage().contains("timeout") ? "TIMEOUT" :
                              e.getMessage().contains("connect") ? "NETWORK" : "SYSTEM_ERROR";
            AiUtils.sendSseEvent(emitter, "error", Map.of(
                "message", "推理链执行失败：" + e.getMessage(),
                "errorType", errorType,
                "suggestion", errorType.equals("NETWORK") ? "网络连接异常，请检查网络后重试" :
                             errorType.equals("TIMEOUT") ? "请求超时，请稍后重试" :
                             "系统异常，已使用默认方案生成"
            ));
            // 降级到原有方法
            return generateCareerPath(req);
        }
    }

    /**
     * 验证并修复图谱结构（悬空节点自动修复）
     * @param graph 原始图谱数据
     * @param fallback 兜底数据
     * @return 修复后的图谱数据
     */
    private Map<String, Object> validateAndFixGraph(Map<String, Object> graph, Map<String, Object> fallback) {
        if (graph == null) {
            log.warn("Graph is null, using fallback");
            return fallback;
        }

        List<Map<String, Object>> nodes = (List<Map<String, Object>>) graph.get("nodes");
        List<Map<String, Object>> links = (List<Map<String, Object>>) graph.get("links");

        if (nodes == null || links == null) {
            log.warn("Graph missing nodes or links, using fallback");
            return fallback;
        }

        // 1. 收集所有 node.id
        Set<String> nodeIds = new HashSet<>();
        for (Map<String, Object> node : nodes) {
            Object id = node.get("id");
            if (id != null) {
                nodeIds.add(String.valueOf(id));
            }
        }

        // 2. 检查所有 link.source 和 link.target
        Set<String> missingIds = new HashSet<>();
        for (Map<String, Object> link : links) {
            String source = String.valueOf(link.get("source"));
            String target = String.valueOf(link.get("target"));

            if (source != null && !source.equals("null") && !nodeIds.contains(source)) {
                missingIds.add(source);
            }
            if (target != null && !target.equals("null") && !nodeIds.contains(target)) {
                missingIds.add(target);
            }
        }

        // 3. 为缺失节点自动补全占位节点
        if (!missingIds.isEmpty()) {
            log.warn("Found {} missing node IDs, adding placeholder nodes: {}", missingIds.size(), missingIds);
            for (String missingId : missingIds) {
                Map<String, Object> placeholderNode = new HashMap<>();
                placeholderNode.put("id", missingId);
                placeholderNode.put("name", "待补充岗位");
                placeholderNode.put("type", "alternative");
                nodes.add(placeholderNode);
            }
        }

        // 4. 移除无效 link（source 或 target 为空或null）
        links.removeIf(link -> {
            String source = String.valueOf(link.get("source"));
            String target = String.valueOf(link.get("target"));
            boolean invalid = source == null || target == null ||
                            source.equals("null") || target.equals("null") ||
                            source.trim().isEmpty() || target.trim().isEmpty();
            if (invalid) {
                log.warn("Removing invalid link: source={}, target={}", source, target);
            }
            return invalid;
        });

        // 5. 若修复后仍不满足条件（如 links 为空），返回 fallback
        if (links.isEmpty()) {
            log.warn("Graph validation failed: no valid links after cleanup, using fallback");
            return fallback;
        }

        graph.put("nodes", nodes);
        graph.put("links", links);

        // 6. 语义校验：检查路径合理性
        if (!validatePathSemantics(graph)) {
            log.warn("Path semantics validation failed, using fallback");
            return fallback;
        }

        return graph;
    }

    /**
     * 获取缓存统计信息
     */
    public Map<String, Object> getCacheStatistics() {
        long totalRequests = cacheHits.get() + cacheMisses.get();
        double hitRate = totalRequests > 0 ? (double) cacheHits.get() / totalRequests * 100 : 0.0;

        Map<String, Object> stats = new HashMap<>();
        stats.put("cacheSize", reasoningCache.size());
        stats.put("cacheHits", cacheHits.get());
        stats.put("cacheMisses", cacheMisses.get());
        stats.put("cacheEvictions", cacheEvictions.get());
        stats.put("totalRequests", totalRequests);
        stats.put("hitRate", String.format("%.2f%%", hitRate));
        stats.put("expiryTime", CACHE_EXPIRY / 1000 + "s");

        return stats;
    }

    /**
     * 清空所有缓存
     */
    public Map<String, Object> clearCache() {
        int size = reasoningCache.size();
        reasoningCache.clear();
        log.info("Manually cleared all cache entries, removed {} entries", size);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "Cache cleared successfully");
        result.put("removedEntries", size);

        return result;
    }

    /**
     * 清空指定用户的缓存
     */
    public Map<String, Object> clearUserCache(Long userId) {
        int removed = 0;
        List<String> keysToRemove = new ArrayList<>();

        for (String key : reasoningCache.keySet()) {
            if (key.startsWith(userId + ":")) {
                keysToRemove.add(key);
            }
        }

        for (String key : keysToRemove) {
            reasoningCache.remove(key);
            removed++;
        }

        log.info("Cleared cache for user {}, removed {} entries", userId, removed);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "User cache cleared successfully");
        result.put("userId", userId);
        result.put("removedEntries", removed);

        return result;
    }
}
