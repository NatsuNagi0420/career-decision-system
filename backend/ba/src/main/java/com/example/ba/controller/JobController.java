/**
 * 文件说明：岗位搜索与推荐控制器。
 * 职责：基于岗位信息表提供多条件岗位搜索、推荐岗位列表以及单个岗位详情查询接口，
 *       支持分页、地区和行业等筛选。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.JobRecommendRequestDTO;
import com.example.ba.mapper.JobMapper;
import com.example.ba.pojo.JobInfo;
import com.example.ba.service.JobService;
import com.example.ba.utils.AiUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/jobs")
@CrossOrigin
public class JobController {

    @Autowired
    private JobService jobService;

    @Autowired
    private JobMapper jobMapper;

    @Autowired
    private AiUtils aiUtils;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping
    public Result<Map<String, Object>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) List<String> locations,
            @RequestParam(required = false) String industry,
            @RequestParam(required = false) String companySize,
            @RequestParam(required = false) String companyType,
            @RequestParam(required = false) String salary,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "12") int pageSize
    ) {
        try {
            return Result.success(jobService.searchJobs(keyword, location, locations, industry, companySize, companyType, salary, page, pageSize));
        } catch (Exception e) {
            return Result.error("获取岗位列表失败: " + e.getMessage());
        }
    }

    @GetMapping("/recommend")
    public Result<Map<String, Object>> recommend(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) List<String> locations,
            @RequestParam(required = false) String industry,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "12") int pageSize
    ) {
        try {
            return Result.success(jobService.searchJobs(keyword, location, locations, industry, null, null, null, page, pageSize));
        } catch (Exception e) {
            return Result.error("获取推荐岗位失败: " + e.getMessage());
        }
    }

    @PostMapping("/recommend/ai")
    public Result<Map<String, Object>> recommendByAi(@RequestBody JobRecommendRequestDTO req) {
        try {
            int limit = normalizeLimit(req == null ? null : req.getLimit());
            List<JobInfo> result = new ArrayList<>();
            Set<Integer> seen = new HashSet<>();

            // 1) 先加入能力画像阶段的优先岗位（保证在推荐列表中）
            List<Integer> preferredIds = req == null ? null : req.getPreferredJobIds();
            if (preferredIds != null && !preferredIds.isEmpty()) {
                Map<Integer, JobInfo> byId = new HashMap<>();
                for (JobInfo ji : jobMapper.selectByIds(preferredIds)) {
                    if (ji != null && ji.getId() != null) {
                        byId.put(ji.getId(), ji);
                    }
                }
                for (Integer id : preferredIds) {
                    JobInfo ji = byId.get(id);
                    if (ji != null && ji.getId() != null && !seen.contains(ji.getId())) {
                        seen.add(ji.getId());
                        result.add(ji);
                        if (result.size() >= limit) {
                            return Result.success(buildRecommendPayload(result, resolveKeywords(req)));
                        }
                    }
                }
            }

            // 2) 使用关键词补齐推荐岗位
            List<String> keywords = resolveKeywords(req);
            for (String kw : keywords) {
                if (kw == null || kw.trim().isEmpty()) continue;
                try {
                    Map<String, Object> jobs = jobService.searchJobs(
                            kw.trim(),
                            null,
                            req == null ? null : req.getLocations(),
                            null,
                            null,
                            null,
                            null,
                            1,
                            Math.max(6, limit)
                    );
                    Object list = jobs.get("list");
                    if (!(list instanceof List<?> items)) continue;
                    for (Object it : items) {
                        if (!(it instanceof JobInfo ji)) continue;
                        if (ji.getId() == null) continue;
                        if (seen.contains(ji.getId())) continue;
                        seen.add(ji.getId());
                        result.add(ji);
                        if (result.size() >= limit) {
                            return Result.success(buildRecommendPayload(result, keywords));
                        }
                    }
                } catch (Exception ignore) {
                }
            }

            return Result.success(buildRecommendPayload(result, keywords));
        } catch (Exception e) {
            return Result.error("AI 推荐岗位失败: " + e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public Result<JobInfo> detail(@PathVariable int id) {
        try {
            JobInfo job = jobService.getJobDetail(id);
            if (job == null) {
                return Result.error(404, "岗位不存在");
            }
            return Result.success(job);
        } catch (Exception e) {
            return Result.error("获取岗位详情失败: " + e.getMessage());
        }
    }

    @GetMapping("/facets")
    public Result<Map<String, Object>> facets() {
        try {
            return Result.success(jobService.getFacets());
        } catch (Exception e) {
            return Result.error("获取筛选项失败: " + e.getMessage());
        }
    }

    private int normalizeLimit(Integer raw) {
        int base = raw == null ? 6 : raw;
        return Math.max(2, Math.min(base, 12));
    }

    private Map<String, Object> buildRecommendPayload(List<JobInfo> jobs, List<String> keywords) {
        Map<String, Object> out = new HashMap<>();
        out.put("jobs", mapJobBriefs(jobs));
        out.put("keywords", keywords == null ? List.of() : keywords);
        return out;
    }

    private List<Map<String, Object>> mapJobBriefs(List<JobInfo> jobs) {
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
            row.put("industry", j.getIndustry());
            row.put("jobSourceUrl", j.getJobSourceUrl());
            out.add(row);
        }
        return out;
    }

    private List<String> resolveKeywords(JobRecommendRequestDTO req) {
        List<String> direct = normalizeKeywords(req == null ? null : req.getKeywords());
        if (!direct.isEmpty()) return direct;

        // 从能力画像中读取推荐关键词
        List<String> fromProfile = new ArrayList<>();
        if (req != null && req.getCapabilityProfile() != null) {
            Object raw = req.getCapabilityProfile().get("recommendedKeywords");
            if (raw instanceof List<?> list) {
                for (Object o : list) {
                    if (o == null) continue;
                    String s = String.valueOf(o).trim();
                    if (!s.isEmpty()) fromProfile.add(s);
                    if (fromProfile.size() >= 8) break;
                }
            }
        }
        fromProfile = normalizeKeywords(fromProfile);
        if (!fromProfile.isEmpty()) return fromProfile;

        // 从能力画像推荐岗位标题中提取关键词
        List<String> fromTitles = new ArrayList<>();
        if (req != null && req.getCapabilityProfile() != null) {
            Object raw = req.getCapabilityProfile().get("recommendedJobTitles");
            if (raw instanceof List<?> list) {
                for (Object o : list) {
                    if (o == null) continue;
                    String s = String.valueOf(o).trim();
                    if (!s.isEmpty()) fromTitles.add(s);
                    if (fromTitles.size() >= 6) break;
                }
            }
        }
        fromTitles = normalizeKeywords(fromTitles);
        if (!fromTitles.isEmpty()) return fromTitles;

        // 兜底使用大模型生成关键词
        if (req == null) return List.of();
        String systemPrompt = "你是职业规划平台的岗位推荐引擎。" +
                "请根据用户信息与能力画像输出岗位推荐关键词 JSON。" +
                "只输出 JSON，不要输出多余文字，格式：{\"keywords\":[\"关键词1\",\"关键词2\"]}。" +
                "关键词数量 6-10 个，中文短语为主。";

        String userPrompt = "用户信息：" + safeJson(req.getEntry()) + "\n能力画像：" + safeJson(req.getCapabilityProfile());
        String reply = aiUtils.getChatResponse(systemPrompt, userPrompt);
        List<String> parsed = parseKeywords(reply);
        return normalizeKeywords(parsed);
    }

    private List<String> normalizeKeywords(List<String> raw) {
        if (raw == null) return List.of();
        Set<String> keep = new LinkedHashSet<>();
        for (String s : raw) {
            if (s == null) continue;
            String v = s.trim();
            if (v.isEmpty()) continue;
            keep.add(v);
            if (keep.size() >= 10) break;
        }
        return new ArrayList<>(keep);
    }

    private List<String> parseKeywords(String raw) {
        if (raw == null || raw.trim().isEmpty()) return List.of();
        String s = raw.trim();
        int start = s.indexOf('{');
        int end = s.lastIndexOf('}');
        if (start >= 0 && end > start) {
            s = s.substring(start, end + 1);
        }
        try {
            JsonNode node = objectMapper.readTree(s);
            JsonNode arr = node.path("keywords");
            if (arr.isArray()) {
                List<String> out = new ArrayList<>();
                for (JsonNode n : arr) {
                    String v = n.asText(null);
                    if (v != null && !v.trim().isEmpty()) out.add(v.trim());
                }
                return out;
            }
        } catch (Exception ignore) {
        }
        return List.of();
    }

    private String safeJson(Object obj) {
        if (obj == null) return "{}";
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return String.valueOf(obj);
        }
    }
}
