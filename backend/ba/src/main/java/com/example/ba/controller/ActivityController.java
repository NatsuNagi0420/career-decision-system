/**
 * 文件说明：用户活动信号处理控制器
 * 职责：接收前端发送的用户行为信号，调用大模型判断是否需要主动介入，返回主动消息
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.ActivitySignalDTO;
import com.example.ba.utils.AiUtils;
import com.example.ba.utils.AuthContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/activity")
@CrossOrigin
public class ActivityController {

    private static final Logger log = LoggerFactory.getLogger(ActivityController.class);

    @Autowired
    private AiUtils aiUtils;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // 冷却期存储：key = userId:page, value = {lastPushTime, pushCount}
    private final ConcurrentHashMap<String, Map<String, Object>> cooldownStore = new ConcurrentHashMap<>();

    // 持久化文件路径
    private static final String COOLDOWN_FILE_PATH = "data/activity_cooldown.json";

    // 定时持久化任务
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    @PostConstruct
    public void init() {
        // 启动时加载持久化数据
        loadCooldownData();

        // 每30秒持久化一次
        scheduler.scheduleAtFixedRate(this::saveCooldownData, 30, 30, TimeUnit.SECONDS);

        log.info("ActivityController initialized, cooldown data loaded from {}", COOLDOWN_FILE_PATH);
    }

    @PreDestroy
    public void destroy() {
        // 关闭时保存数据
        saveCooldownData();
        scheduler.shutdown();
        log.info("ActivityController destroyed, cooldown data saved");
    }

    @PostMapping("/signal")
    public Result<Map<String, Object>> handleSignal(@RequestBody ActivitySignalDTO signal) {
        try {
            Long userId = AuthContext.getUserId();
            if (userId == null) {
                return Result.success(Map.of("shouldPush", false));
            }

            String page = signal.getPage();
            Map<String, Object> pageState = signal.getPageState();

            // 检查冷却期
            String cooldownKey = userId + ":" + page;
            if (isInCooldown(cooldownKey, pageState)) {
                return Result.success(Map.of("shouldPush", false));
            }

            // 调用大模型判断是否需要介入
            String systemPrompt = buildSystemPrompt();
            String userPrompt = buildUserPrompt(signal);

            String aiResponse = aiUtils.getChatResponse(systemPrompt, userPrompt);

            // 解析大模型返回的JSON
            Map<String, Object> decision = parseDecision(aiResponse);

            Boolean shouldPush = (Boolean) decision.get("shouldPush");
            if (Boolean.TRUE.equals(shouldPush)) {
                // 更新冷却记录
                updateCooldown(cooldownKey);
            }

            return Result.success(decision);

        } catch (Exception e) {
            log.error("处理活动信号失败", e);
            return Result.success(Map.of("shouldPush", false));
        }
    }

    /**
     * 检查是否在冷却期内
     */
    private boolean isInCooldown(String cooldownKey, Map<String, Object> pageState) {
        Map<String, Object> cooldown = cooldownStore.get(cooldownKey);
        if (cooldown == null) {
            return false;
        }

        Long lastPushTime = (Long) cooldown.get("lastPushTime");
        Integer pushCount = (Integer) cooldown.get("pushCount");

        if (lastPushTime == null || pushCount == null) {
            return false;
        }

        long now = System.currentTimeMillis();
        long timeSinceLastPush = now - lastPushTime;
        long minInterval = 15 * 60 * 1000; // 15分钟

        // 同页最多5次，间隔至少15分钟
        if (pushCount >= 5 && timeSinceLastPush < minInterval) {
            return true;
        }

        // 如果正在生成推理链，不推送
        Boolean profileGenerating = (Boolean) pageState.get("profileGenerating");
        Boolean pathPlanGenerating = (Boolean) pageState.get("pathPlanGenerating");
        if (Boolean.TRUE.equals(profileGenerating) || Boolean.TRUE.equals(pathPlanGenerating)) {
            return true;
        }

        return false;
    }

    /**
     * 更新冷却记录
     */
    private void updateCooldown(String cooldownKey) {
        Map<String, Object> cooldown = cooldownStore.getOrDefault(cooldownKey, new HashMap<>());
        cooldown.put("lastPushTime", System.currentTimeMillis());
        cooldown.put("pushCount", (Integer) cooldown.getOrDefault("pushCount", 0) + 1);
        cooldownStore.put(cooldownKey, cooldown);
    }

    /**
     * 加载持久化的冷却数据
     */
    private void loadCooldownData() {
        try {
            File file = new File(COOLDOWN_FILE_PATH);
            if (!file.exists()) {
                log.info("Cooldown file not found, starting with empty store");
                return;
            }

            Map<String, Map<String, Object>> data = objectMapper.readValue(
                file,
                new TypeReference<Map<String, Map<String, Object>>>() {}
            );

            if (data != null) {
                // 清理过期数据（超过24小时的记录）
                long now = System.currentTimeMillis();
                long expirationTime = 24 * 60 * 60 * 1000; // 24小时

                data.entrySet().removeIf(entry -> {
                    Map<String, Object> cooldown = entry.getValue();
                    Long lastPushTime = getLongValue(cooldown.get("lastPushTime"));
                    return lastPushTime == null || (now - lastPushTime) > expirationTime;
                });

                cooldownStore.putAll(data);
                log.info("Loaded {} cooldown records from file", cooldownStore.size());
            }
        } catch (IOException e) {
            log.error("Failed to load cooldown data from file", e);
        }
    }

    /**
     * 保存冷却数据到文件
     */
    private void saveCooldownData() {
        try {
            File file = new File(COOLDOWN_FILE_PATH);
            File parentDir = file.getParentFile();

            // 确保目录存在
            if (parentDir != null && !parentDir.exists()) {
                parentDir.mkdirs();
            }

            // 清理过期数据后再保存
            long now = System.currentTimeMillis();
            long expirationTime = 24 * 60 * 60 * 1000; // 24小时

            Map<String, Map<String, Object>> dataToSave = new HashMap<>();
            cooldownStore.forEach((key, value) -> {
                Long lastPushTime = getLongValue(value.get("lastPushTime"));
                if (lastPushTime != null && (now - lastPushTime) <= expirationTime) {
                    dataToSave.put(key, value);
                }
            });

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, dataToSave);
            log.debug("Saved {} cooldown records to file", dataToSave.size());
        } catch (IOException e) {
            log.error("Failed to save cooldown data to file", e);
        }
    }

    /**
     * 安全地从Object转换为Long
     */
    private Long getLongValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Long) {
            return (Long) value;
        }
        if (value instanceof Integer) {
            return ((Integer) value).longValue();
        }
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 构建系统提示词
     */
    private String buildSystemPrompt() {
        return "你是职业规划平台的智能助手\"星途\"。" +
                "你需要根据用户当前的页面状态和行为，判断是否需要主动介入提供帮助。\n\n" +
                "六大触发场景：\n" +
                "1. 信息录入页停留超5分钟且表单未完成 → 提示上传简历自动提取\n" +
                "2. 深度问卷已开始但未提交 → 提示完成问卷\n" +
                "3. 能力画像生成完成，展示超30秒未离开 → 引导去岗位探索\n" +
                "4. 岗位探索页浏览超3个岗位但未选定目标 → 提示帮助对比分析\n" +
                "5. 已选定目标岗位超30秒未进入路径规划 → 引导去路径规划\n" +
                "6. 路径规划完成后超30秒未进入报告 → 引导去生成报告\n\n" +
                "禁止推送的情况：\n" +
                "- 正在生成能力画像或路径规划时（profileGenerating或pathPlanGenerating为true）\n" +
                "- 用户刚进入页面不到10秒\n" +
                "- 用户正在积极操作（最近操作时间在30秒内）\n\n" +
                "输出格式：严格JSON，包含以下字段：\n" +
                "{\n" +
                "  \"shouldPush\": true/false,\n" +
                "  \"message\": \"主动消息内容\",\n" +
                "  \"buttons\": [{\"label\": \"按钮文字\", \"action\": \"go:page-name\"}]\n" +
                "}\n\n" +
                "如果不需要推送，返回 {\"shouldPush\": false}";
    }

    /**
     * 构建用户提示词
     */
    private String buildUserPrompt(ActivitySignalDTO signal) {
        StringBuilder sb = new StringBuilder();
        sb.append("当前页面：").append(signal.getPage()).append("\n");

        long now = System.currentTimeMillis();
        long pageStayTime = (now - signal.getPageEnteredAt()) / 1000;
        long timeSinceLastAction = (now - signal.getLastActionAt()) / 1000;

        sb.append("页面停留时长：").append(pageStayTime).append("秒\n");
        sb.append("距离最后操作：").append(timeSinceLastAction).append("秒\n");

        if (signal.getRecentActions() != null && !signal.getRecentActions().isEmpty()) {
            sb.append("最近操作：").append(String.join(", ", signal.getRecentActions())).append("\n");
        }

        sb.append("\n页面状态：\n");
        Map<String, Object> pageState = signal.getPageState();
        if (pageState != null) {
            pageState.forEach((key, value) -> {
                sb.append("- ").append(key).append(": ").append(value).append("\n");
            });
        }

        sb.append("\n请判断是否需要主动介入，并输出JSON格式的决策。");

        return sb.toString();
    }

    /**
     * 解析大模型返回的决策JSON
     */
    private Map<String, Object> parseDecision(String aiResponse) {
        try {
            // 尝试提取JSON
            int jsonStart = aiResponse.indexOf('{');
            int jsonEnd = aiResponse.lastIndexOf('}');

            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                String jsonStr = aiResponse.substring(jsonStart, jsonEnd + 1);
                JsonNode json = objectMapper.readTree(jsonStr);

                Map<String, Object> result = new HashMap<>();
                result.put("shouldPush", json.path("shouldPush").asBoolean(false));
                result.put("message", json.path("message").asText(""));

                List<Map<String, String>> buttons = new ArrayList<>();
                JsonNode buttonsNode = json.path("buttons");
                if (buttonsNode.isArray()) {
                    for (JsonNode btn : buttonsNode) {
                        Map<String, String> button = new HashMap<>();
                        button.put("label", btn.path("label").asText(""));
                        button.put("action", btn.path("action").asText(""));
                        buttons.add(button);
                    }
                }
                result.put("buttons", buttons);

                return result;
            }
        } catch (Exception e) {
            log.warn("解析AI决策JSON失败", e);
        }

        return Map.of("shouldPush", false);
    }
}
