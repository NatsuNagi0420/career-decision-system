/**
 * 文件说明：全局职业规划助手控制器。
 * 职责：对接 AiUtils 调用大模型，提供基于页面上下文的对话接口，
 *       当前主要暴露 /api/assistant/chat 用于前端助手窗口。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.AssistantChatDTO;
import com.example.ba.utils.AiUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
@RequestMapping("/api/assistant")
@CrossOrigin
public class AssistantController {

    private static final Logger log = LoggerFactory.getLogger(AssistantController.class);

    @Autowired
    private AiUtils aiUtils;

    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping("/chat")
    public Result<Map<String, Object>> chat(@RequestBody AssistantChatDTO dto) {
        try {
            String page = dto.getPage() == null ? "" : dto.getPage();
            String userMessage = dto.getMessage() == null ? "" : dto.getMessage();
            Map<String, Object> context = dto.getContext();

            String systemPrompt = "你是职业规划平台的全局助手\"星途\"。" +
                    "你需要基于当前步骤页面与上下文数据，给出简洁、可执行的建议。" +
                    "不要杜撰用户姓名、地点、岗位；如果未知就说未知。" +
                    "当你建议用户进行下一步操作时，请在回答末尾单独输出一行 JSON，且只能包含 buttons 字段，格式：" +
                    "{\"buttons\":[{\"label\":\"去岗位探索\",\"action\":\"go:job-exploration\"}]}。" +
                    "action 只能使用：go:capability-profile、go:job-exploration、go:path-planning、go:report。" +
                    "如果不需要按钮，输出 {\"buttons\":[]}。";

            String contextText = context == null ? "{}" : context.toString();
            String prompt = "当前页面: " + page + "\n上下文: " + contextText + "\n用户: " + userMessage;

            String reply = aiUtils.getChatResponse(systemPrompt, prompt);
            log.debug("AI reply received, length: {}", reply != null ? reply.length() : 0);

            if (reply != null) {
                String r = reply.trim();
                if (r.startsWith("AI 调用失败") || r.contains("SERVICE_UNAVAILABLE") || r.contains("system_memory_overloaded")) {
                    reply = "AI 服务当前繁忙，请稍后重试。\n{\"buttons\":[ ]}";
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("reply", reply);
            return Result.success(data);
        } catch (Exception e) {
            return Result.error("对话失败: " + e.getMessage());
        }
    }

    @PostMapping(value = "/chat/stream", produces = "text/event-stream;charset=UTF-8")
    public SseEmitter chatStream(@RequestBody AssistantChatDTO dto) {
        log.info("Stream chat request - page: {}, message: {}", dto.getPage(), dto.getMessage());

        SseEmitter emitter = new SseEmitter(60_000L);

        String page = dto.getPage() == null ? "" : dto.getPage();
        String userMessage = dto.getMessage() == null ? "" : dto.getMessage();
        Map<String, Object> context = dto.getContext();

        String systemPrompt = "你是职业规划平台的全局助手\"星途\"。" +
                "你需要基于当前步骤页面与上下文数据，给出简洁、可执行的建议。" +
                "不要杜撰用户姓名、地点、岗位；如果未知就说未知。" +
                "当你建议用户进行下一步操作时，请在回答末尾单独输出一行 JSON，且只能包含 buttons 字段，格式：" +
                "{\"buttons\":[{\"label\":\"去岗位探索\",\"action\":\"go:job-exploration\"}]}。" +
                "action 只能使用：go:capability-profile、go:job-exploration、go:path-planning、go:report。" +
                "如果不需要按钮，输出 {\"buttons\":[]}。";

        String contextText = context == null ? "{}" : context.toString();
        String prompt = "当前页面: " + page + "\n上下文: " + contextText + "\n用户: " + userMessage;

        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "user", "content", prompt));

        executorService.execute(() -> {
            try {
                log.debug("Starting async AI call");
                StringBuilder fullReply = new StringBuilder();

                aiUtils.streamChatResponse(
                        systemPrompt,
                        messages,
                        token -> {
                            fullReply.append(token);
                            AiUtils.sendSseEvent(emitter, "token", Map.of("text", token));
                        },
                        error -> {
                            log.error("AI call error: {}", error.getMessage(), error);
                            AiUtils.sendSseEvent(emitter, "error", Map.of("message", error.getMessage()));
                            emitter.complete();
                        }
                );

                String reply = fullReply.toString();
                log.debug("AI reply completed, length: {}", reply.length());

                Map<String, Object> buttons = parseButtonsFromReply(reply);
                if (buttons != null && !buttons.isEmpty()) {
                    AiUtils.sendSseEvent(emitter, "buttons", buttons);
                }

                AiUtils.sendSseEvent(emitter, "done", Map.of());
                emitter.complete();
                log.info("Stream chat request completed");
            } catch (Exception e) {
                log.error("Async execution error: {}", e.getMessage(), e);
                AiUtils.sendSseEvent(emitter, "error", Map.of("message", e.getMessage()));
                emitter.complete();
            }
        });

        return emitter;
    }

    private Map<String, Object> parseButtonsFromReply(String reply) {
        try {
            log.debug("Parsing buttons from reply, length: {}", reply.length());

            // 查找包含 "buttons" 的 JSON 对象
            int buttonsPos = reply.indexOf("\"buttons\"");
            if (buttonsPos < 0) {
                log.debug("No 'buttons' keyword found in reply");
                return null;
            }

            // 从 "buttons" 往前找最近的 {
            int jsonStart = reply.lastIndexOf('{', buttonsPos);
            if (jsonStart < 0) {
                log.debug("No opening brace found before 'buttons'");
                return null;
            }

            // 从 jsonStart 往后找匹配的 }
            int braceCount = 0;
            int jsonEnd = -1;
            for (int i = jsonStart; i < reply.length(); i++) {
                char c = reply.charAt(i);
                if (c == '{') braceCount++;
                else if (c == '}') {
                    braceCount--;
                    if (braceCount == 0) {
                        jsonEnd = i;
                        break;
                    }
                }
            }

            if (jsonEnd < 0) {
                log.debug("No matching closing brace found");
                return null;
            }

            String jsonStr = reply.substring(jsonStart, jsonEnd + 1);
            log.debug("Extracted JSON: {}", jsonStr);
            JsonNode json = objectMapper.readTree(jsonStr);

            if (json.has("buttons")) {
                log.debug("Found buttons field");
                Map<String, Object> result = new HashMap<>();
                result.put("buttons", objectMapper.convertValue(json.get("buttons"), List.class));
                log.debug("Parsed buttons: {}", result);
                return result;
            } else {
                log.debug("No buttons field in JSON");
            }
        } catch (Exception e) {
            log.error("Failed to parse buttons: {}", e.getMessage(), e);
        }
        return null;
    }
}
