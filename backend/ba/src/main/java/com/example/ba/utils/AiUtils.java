/**
 * 文件说明：大模型调用工具类。
 * 职责：封装调用 OpenAI 兼容接口的大模型 HTTP 请求构造、环境变量解析、
 *       以及对话/补全结果的解析与错误处理逻辑。
 */
package com.example.ba.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

/**
 * 大模型调用工具类
 * 封装了调用 OpenAI 兼容格式 API 的核心逻辑
 */
@Component
public class AiUtils {

    @Value("${ai.api.key}")
    private String apiKey;

    @Value("${ai.api.base-url}")
    private String baseUrl;

    @Value("${ai.api.model}")
    private String model;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private String resolveApiKey() {
        if (apiKey != null && !apiKey.isBlank()) return apiKey;

        String[] envKeys = new String[]{
                "AI_API_KEY",
                "ANTHROPIC_AUTH_TOKEN",
                "OPENAI_API_KEY"
        };
        for (String k : envKeys) {
            String v = System.getenv(k);
            if (v != null && !v.isBlank()) return v;
        }

        String[] propKeys = new String[]{
                "ai.api.key",
                "AI_API_KEY",
                "ANTHROPIC_AUTH_TOKEN",
                "OPENAI_API_KEY"
        };
        for (String k : propKeys) {
            String v = System.getProperty(k);
            if (v != null && !v.isBlank()) return v;
        }

        return "";
    }

    private String resolveBaseUrl() {
        if (baseUrl != null && !baseUrl.isBlank()) return baseUrl;
        String v = System.getenv("AI_API_BASE_URL");
        if (v != null && !v.isBlank()) return v;
        v = System.getenv("ANTHROPIC_BASE_URL");
        if (v != null && !v.isBlank()) return v;
        return "";
    }

    private String resolveModel() {
        if (model != null && !model.isBlank()) return model;
        String v = System.getenv("AI_API_MODEL");
        if (v != null && !v.isBlank()) return v;
        v = System.getenv("ANTHROPIC_MODEL");
        if (v != null && !v.isBlank()) return v;
        return "";
    }

    private String resolveChatCompletionsUrl() {
        String base = resolveBaseUrl();
        if (base == null || base.isBlank()) {
            return "";
        }

        String url = base.trim();
        if (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }

        if (url.endsWith("/v1/chat/completions")) {
            return url;
        }

        if (url.endsWith("/v1")) {
            return url + "/chat/completions";
        }

        if (url.contains("/v1/")) {
            return url;
        }

        return url + "/v1/chat/completions";
    }

    private String resolveAnthropicMessagesUrl() {
        String base = resolveBaseUrl();
        if (base == null || base.isBlank()) {
            return "";
        }

        String url = base.trim();
        if (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }

        if (url.endsWith("/v1/messages")) {
            return url;
        }

        if (url.endsWith("/v1")) {
            return url + "/messages";
        }

        if (url.contains("/v1/")) {
            return url;
        }

        return url + "/v1/messages";
    }

    private boolean shouldUseAnthropic() {
        String m = resolveModel().toLowerCase();
        if (m.contains("claude")) return true;

        String url = resolveBaseUrl().toLowerCase();
        if (url.contains("anthropic")) return true;
        if (url.contains("/v1/messages")) return true;

        return false;
    }

    private String extractOpenAiContent(String response) throws Exception {
        JsonNode root = objectMapper.readTree(response);
        return root.path("choices").get(0).path("message").path("content").asText();
    }

    private String extractAnthropicContent(String response) throws Exception {
        JsonNode root = objectMapper.readTree(response);
        JsonNode contentArr = root.path("content");
        if (contentArr.isArray() && contentArr.size() > 0) {
            JsonNode first = contentArr.get(0);
            String text = first.path("text").asText(null);
            if (text != null) return text;
        }
        return root.path("completion").asText();
    }

    private String callOpenAiChatCompletions(String systemPrompt, String userPrompt) {
        try {
            String key = resolveApiKey();
            if (key.isBlank()) {
                return "AI 调用失败: 未配置 ai.api.key（可通过环境变量 AI_API_KEY 或 ANTHROPIC_AUTH_TOKEN 设置）";
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + key);

            ObjectNode requestBody = objectMapper.createObjectNode();
            requestBody.put("model", resolveModel());
            requestBody.put("temperature", systemPrompt == null ? 0.7 : 0.3);

            ArrayNode messages = requestBody.putArray("messages");
            if (systemPrompt != null && !systemPrompt.isBlank()) {
                ObjectNode sysMsg = messages.addObject();
                sysMsg.put("role", "system");
                sysMsg.put("content", systemPrompt);
            }

            ObjectNode userMsg = messages.addObject();
            userMsg.put("role", "user");
            userMsg.put("content", userPrompt);

            HttpEntity<String> entity = new HttpEntity<>(requestBody.toString(), headers);
            String response = restTemplate.postForObject(resolveChatCompletionsUrl(), entity, String.class);
            return extractOpenAiContent(response);
        } catch (HttpStatusCodeException e) {
            return "AI 调用失败: " + e.getStatusCode() + " " + e.getResponseBodyAsString();
        } catch (Exception e) {
            return "AI 调用失败: " + e.getMessage();
        }
    }

    private String callAnthropicMessages(String systemPrompt, String userPrompt) {
        try {
            String key = resolveApiKey();
            if (key.isBlank()) {
                return "AI 调用失败: 未配置 ai.api.key（可通过环境变量 AI_API_KEY 或 ANTHROPIC_AUTH_TOKEN 设置）";
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            headers.set("x-api-key", key);
            headers.set("Authorization", "Bearer " + key);
            headers.set("anthropic-version", "2023-06-01");

            ObjectNode requestBody = objectMapper.createObjectNode();
            requestBody.put("model", resolveModel());
            requestBody.put("max_tokens", 1024);
            requestBody.put("temperature", systemPrompt == null ? 0.7 : 0.3);

            if (systemPrompt != null && !systemPrompt.isBlank()) {
                requestBody.put("system", systemPrompt);
            }

            ArrayNode messages = requestBody.putArray("messages");
            ObjectNode userMsg = messages.addObject();
            userMsg.put("role", "user");
            userMsg.put("content", userPrompt);

            HttpEntity<String> entity = new HttpEntity<>(requestBody.toString(), headers);
            String response = restTemplate.exchange(resolveAnthropicMessagesUrl(), HttpMethod.POST, entity, String.class).getBody();
            return extractAnthropicContent(response);
        } catch (HttpStatusCodeException e) {
            return "AI 调用失败: " + e.getStatusCode() + " " + e.getResponseBodyAsString();
        } catch (Exception e) {
            return "AI 调用失败: " + e.getMessage();
        }
    }

    /**
     * 发送简单 Prompt 并获取大模型回答
     * @param prompt 提示词
     * @return 大模型的文本回答
     */
    public String getChatResponse(String prompt) {
        try {
            if (resolveApiKey().isBlank()) {
                return "AI 调用失败: 未配置 ai.api.key（可通过环境变量 AI_API_KEY 或 ANTHROPIC_AUTH_TOKEN 设置）";
            }

            if (shouldUseAnthropic()) {
                String r = callAnthropicMessages(null, prompt);
                if (!r.startsWith("AI 调用失败")) return r;
            }

            String openai = callOpenAiChatCompletions(null, prompt);
            if (!openai.startsWith("AI 调用失败")) return openai;

            String anthropic = callAnthropicMessages(null, prompt);
            return anthropic;
        } catch (Exception e) {
            return "AI 调用失败: " + e.getMessage();
        }
    }

    /**
     * 发送系统角色 + 用户提示词的组合请求
     * @param systemPrompt 系统角色定义
     * @param userPrompt 用户输入内容
     * @return 大模型的文本回答
     */
    public String getChatResponse(String systemPrompt, String userPrompt) {
        try {
            if (resolveApiKey().isBlank()) {
                return "AI 调用失败: 未配置 ai.api.key（可通过环境变量 AI_API_KEY 或 ANTHROPIC_AUTH_TOKEN 设置）";
            }

            if (shouldUseAnthropic()) {
                String r = callAnthropicMessages(systemPrompt, userPrompt);
                if (!r.startsWith("AI 调用失败")) return r;
            }

            String openai = callOpenAiChatCompletions(systemPrompt, userPrompt);
            if (!openai.startsWith("AI 调用失败")) return openai;

            String anthropic = callAnthropicMessages(systemPrompt, userPrompt);
            return anthropic;
        } catch (Exception e) {
            return "AI 调用失败: " + e.getMessage();
        }
    }
}
