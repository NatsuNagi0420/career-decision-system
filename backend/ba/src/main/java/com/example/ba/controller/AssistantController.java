/**
 * 文件说明：全局职业规划助手控制器。
 * 职责：对接 AiUtils 调用大模型，提供基于页面上下文的对话接口，
 *       当前主要暴露 /api/assistant/chat 用于前端助手窗口。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.AssistantChatDTO;
import com.example.ba.utils.AiUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/assistant")
@CrossOrigin
public class AssistantController {

    @Autowired
    private AiUtils aiUtils;

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
            System.out.println("DEBUG AI_REPLY = " + reply);

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
}
