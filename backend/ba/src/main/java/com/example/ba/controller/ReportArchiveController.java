/**
 * 文件说明：职业报告归档控制器。
 * 职责：负责当前登录用户职业规划报告的归档保存、历史列表查询以及单条详情查询。
 * 主要接口：
 * - POST /api/report/archive    保存一条新的报告归档记录。
 * - GET  /api/report/archive/list  查询当前用户的所有历史报告归档列表。
 * - GET  /api/report/archive/{id}  查询当前用户某次报告归档的详细内容。
 */
package com.example.ba.controller;


import com.example.ba.common.Result;
import com.example.ba.dto.ReportArchiveRequestDTO;
import com.example.ba.dto.ReportGenerateRequestDTO;
import com.example.ba.exception.BusinessException;
import com.example.ba.mapper.UserReportArchiveMapper;
import com.example.ba.pojo.UserReportArchive;
import com.example.ba.utils.AiUtils;
import com.example.ba.utils.AuthContext;
import com.example.ba.utils.JsonUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;




@RestController
@RequestMapping("/api/report")
@CrossOrigin
public class ReportArchiveController {
    @Autowired
    private UserReportArchiveMapper userReportArchiveMapper;

    @Autowired
    private AiUtils aiUtils;

    private final ObjectMapper objectMapper = new ObjectMapper();


    @PostMapping("/archive")
    public Result<Void> saveArchive(@RequestBody ReportArchiveRequestDTO dto) {
        Long userId = AuthContext.getUserId();
        if (userId == null) {
            throw new BusinessException("未登录");
        }
        if (dto == null || dto.getReportJson() == null) {
            throw new BusinessException("归档内容为空");
        }
        String title = dto.getTitle() == null ? "职业规划报告" : dto.getTitle();
        Long sortIndex = dto.getSortIndex() == null ? System.currentTimeMillis() : dto.getSortIndex();

        UserReportArchive archive = UserReportArchive.builder()
                .userId(userId)
                .title(title)
                .reportJson(JsonUtils.toJson(dto.getReportJson()))
                .sortIndex(sortIndex)
                .isDeleted(0)
                .build();

        userReportArchiveMapper.insert(archive);
        return Result.success();
    }

    @GetMapping("/archive/list")
    public Result<List<UserReportArchive>> listMyArchives() {
        Long userId = AuthContext.getUserId();
        if (userId == null) {
            throw new BusinessException("未登录");
        }
        List<UserReportArchive> list = userReportArchiveMapper.listByUserId(userId);
        return Result.success(list);
    }

    @GetMapping("/archive/{id}")
    public Result<UserReportArchive> getArchiveDetail(@PathVariable("id") Long id) {
        Long userId = AuthContext.getUserId();
        if (userId == null) {
            throw new BusinessException("未登录");
        }
        UserReportArchive archive = userReportArchiveMapper.findByIdAndUserId(id, userId);
        if (archive == null) {
            throw new BusinessException("记录不存在");
        }
        return Result.success(archive);
    }

    @PostMapping("/generate")
    public Result<Map<String, Object>> generateReport(@RequestBody ReportGenerateRequestDTO dto) {
        if (dto == null) {
            throw new BusinessException("报告生成入参为空");
        }

        String systemPrompt = "你是职业规划平台的报告生成引擎。" +
                "请基于用户信息、能力画像、目标岗位与路径规划，输出严格 JSON。" +
                "只输出 JSON，不要输出任何解释或 Markdown。" +
                "JSON 结构必须包含：" +
                "summary(string)," +
                "gaps(Array<{label:string, items:string[]}>)," +
                "planStages(Array<{name:string, tasks:string[]}>)," +
                "matchAnalysis(string)," +
                "evidenceHighlights(string[])," +
                "skillPath(string[])," +
                "action90Days(string[])," +
                "risksAndAlternatives(string[])," +
                "resumeInterviewStrategies(string[]).";


        String userPrompt = "用户信息：" + safeJson(dto.getEntryDraft()) +
                "\n能力画像：" + safeJson(dto.getCapabilityProfile()) +
                "\n目标岗位：" + safeJson(dto.getTargetJob()) +
                "\n路径规划：" + safeJson(dto.getPathPlan()) +
                "\n路径图谱：" + safeJson(dto.getPathGraph());

        try {
            String reply = aiUtils.getChatResponse(systemPrompt, userPrompt);
            Map<String, Object> parsed = parseJson(reply);
            return Result.success(normalizeReportJson(parsed, dto));
        } catch (Exception e) {
            throw new BusinessException("报告生成失败: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> buildReportFallback(ReportGenerateRequestDTO dto) {
        Map<String, Object> out = new HashMap<>();
        String jobName = null;
        if (dto != null && dto.getTargetJob() != null) {
            Object name = dto.getTargetJob().get("jobName");
            if (name instanceof String s && !s.trim().isEmpty()) {
                jobName = s.trim();
            }
        }
        if (jobName == null) jobName = "目标岗位";

        out.put("summary", "你的目标岗位为「" + jobName + "」，系统将基于你的能力画像和路径规划给出可执行的成长建议。");
        out.put("gaps", List.of(
                Map.of("label", "关键技能差距（示意）", "items", List.of("核心技能补全", "项目经历沉淀")),
                Map.of("label", "行动建议（示意）", "items", List.of("完善作品集", "阶段化复盘与投递"))
        ));
        out.put("planStages", List.of());
        out.put("matchAnalysis", "结合目标岗位要求与当前能力画像，重点补齐高频技能与项目经验。" );
        out.put("evidenceHighlights", List.of("梳理 2-3 个核心项目成果作为能力证据", "补充量化指标提升说服力"));
        out.put("skillPath", List.of("拆解岗位核心技能，形成可执行学习清单", "用项目实践沉淀可展示成果"));
        out.put("action90Days", List.of("第 1-30 天聚焦关键技能与基础项目", "第 31-60 天完善作品集与项目深度", "第 61-90 天投递与面试复盘"));
        out.put("risksAndAlternatives", List.of("核心技能推进缓慢时可先转向相近岗位", "准备备选行业或岗位降低不确定性"));
        out.put("resumeInterviewStrategies", List.of("简历突出岗位关键词与量化成果", "准备 3-5 个与岗位匹配的项目复盘故事"));
        return out;
    }


    private Map<String, Object> normalizeReportJson(Map<String, Object> raw, ReportGenerateRequestDTO dto) {
        Map<String, Object> fallback = buildReportFallback(dto);
        if (raw == null || raw.isEmpty()) return fallback;

        Map<String, Object> out = new HashMap<>();

        Object summaryObj = raw.get("summary");
        if (summaryObj instanceof String s && !s.trim().isEmpty()) {
            out.put("summary", s.trim());
        } else {
            out.put("summary", fallback.get("summary"));
        }

        List<Map<String, Object>> gaps = new ArrayList<>();
        Object rawGaps = raw.get("gaps");
        if (rawGaps instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Object labelObj = m.get("label");
                if (labelObj == null) continue;
                String label = String.valueOf(labelObj).trim();
                if (label.isEmpty()) continue;
                List<String> items = new ArrayList<>();
                Object rawItems = m.get("items");
                if (rawItems instanceof List<?> ilist) {
                    for (Object it : ilist) {
                        if (it == null) continue;
                        String v = String.valueOf(it).trim();
                        if (v.isEmpty()) continue;
                        items.add(v);
                        if (items.size() >= 10) break;
                    }
                }
                if (items.isEmpty()) continue;
                gaps.add(Map.of("label", label, "items", items));
                if (gaps.size() >= 4) break;
            }
        }
        if (gaps.isEmpty()) {
            Object fb = fallback.get("gaps");
            if (fb instanceof List<?> fbList) {
                gaps = (List<Map<String, Object>>) fbList;
            }
        }
        out.put("gaps", gaps);

        List<Map<String, Object>> planStages = new ArrayList<>();
        Object rawStages = raw.get("planStages");
        if (rawStages instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Object nameObj = m.get("name");
                if (nameObj == null) continue;
                String name = String.valueOf(nameObj).trim();
                if (name.isEmpty()) continue;
                List<String> tasks = new ArrayList<>();
                Object rawTasks = m.get("tasks");
                if (rawTasks instanceof List<?> tlist) {
                    for (Object t : tlist) {
                        if (t == null) continue;
                        String v = String.valueOf(t).trim();
                        if (v.isEmpty()) continue;
                        tasks.add(v);
                        if (tasks.size() >= 12) break;
                    }
                }
                planStages.add(Map.of("name", name, "tasks", tasks));
                if (planStages.size() >= 6) break;
            }
        }
        out.put("planStages", planStages);

        String matchAnalysis = null;
        Object matchObj = raw.get("matchAnalysis");
        if (matchObj instanceof String s && !s.trim().isEmpty()) {
            matchAnalysis = s.trim();
        } else if (fallback.get("matchAnalysis") instanceof String s) {
            matchAnalysis = s;
        }
        if (matchAnalysis != null) {
            out.put("matchAnalysis", matchAnalysis);
        }

        out.put("evidenceHighlights", fallbackIfEmpty(normalizeStringList(raw.get("evidenceHighlights"), 8), fallback.get("evidenceHighlights")));
        out.put("skillPath", fallbackIfEmpty(normalizeStringList(raw.get("skillPath"), 8), fallback.get("skillPath")));
        out.put("action90Days", fallbackIfEmpty(normalizeStringList(raw.get("action90Days"), 10), fallback.get("action90Days")));
        out.put("risksAndAlternatives", fallbackIfEmpty(normalizeStringList(raw.get("risksAndAlternatives"), 8), fallback.get("risksAndAlternatives")));
        out.put("resumeInterviewStrategies", fallbackIfEmpty(normalizeStringList(raw.get("resumeInterviewStrategies"), 8), fallback.get("resumeInterviewStrategies")));

        return out;
    }

    private List<String> normalizeStringList(Object raw, int maxItems) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object it : list) {
                if (it == null) continue;
                String v = String.valueOf(it).trim();
                if (v.isEmpty()) continue;
                out.add(v);
                if (out.size() >= maxItems) break;
            }
        } else if (raw instanceof String s && !s.trim().isEmpty()) {
            out.add(s.trim());
        }
        return out;
    }

    private List<String> fallbackIfEmpty(List<String> list, Object fallback) {
        if (list != null && !list.isEmpty()) return list;
        if (fallback instanceof List<?> fb) {
            List<String> out = new ArrayList<>();
            for (Object it : fb) {
                if (it == null) continue;
                String v = String.valueOf(it).trim();
                if (v.isEmpty()) continue;
                out.add(v);
            }
            if (!out.isEmpty()) return out;
        }
        return list == null ? new ArrayList<>() : list;
    }

    private Map<String, Object> parseJson(String raw) {


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

    private String safeJson(Object obj) {
        if (obj == null) return "{}";
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return String.valueOf(obj);
        }
    }
}


