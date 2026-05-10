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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * 大模型调用工具类
 * 封装了调用 OpenAI 兼容格式 API 的核心逻辑
 */
@Component
public class AiUtils {

    private static final Logger log = LoggerFactory.getLogger(AiUtils.class);

    @Value("${ai.api.key}")
    private String apiKey;

    @Value("${ai.api.base-url}")
    private String baseUrl;

    @Value("${ai.api.model}")
    private String model;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(60))
            .build();

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

    /**
     * 支持多轮对话历史的非流式调用
     * @param systemPrompt 系统角色定义
     * @param history 对话历史，格式: List<Map<String, String>>，每个 Map 包含 role 和 content
     * @param currentUserPrompt 当前用户消息
     * @return AI 回复文本
     */
    public String getChatResponseWithHistory(
            String systemPrompt,
            List<Map<String, String>> history,
            String currentUserPrompt
    ) {
        try {
            if (resolveApiKey().isBlank()) {
                return "AI 调用失败: 未配置 ai.api.key（可通过环境变量 AI_API_KEY 或 ANTHROPIC_AUTH_TOKEN 设置）";
            }

            if (shouldUseAnthropic()) {
                String r = callAnthropicMessagesWithHistory(systemPrompt, history, currentUserPrompt);
                if (!r.startsWith("AI 调用失败")) return r;
            }

            String openai = callOpenAiChatCompletionsWithHistory(systemPrompt, history, currentUserPrompt);
            if (!openai.startsWith("AI 调用失败")) return openai;

            String anthropic = callAnthropicMessagesWithHistory(systemPrompt, history, currentUserPrompt);
            return anthropic;
        } catch (Exception e) {
            return "AI 调用失败: " + e.getMessage();
        }
    }

    private String callOpenAiChatCompletionsWithHistory(String systemPrompt, List<Map<String, String>> history, String currentUserPrompt) {
        try {
            String key = resolveApiKey();
            if (key.isBlank()) {
                return "AI 调用失败: 未配置 ai.api.key";
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

            if (history != null) {
                for (Map<String, String> msg : history) {
                    ObjectNode historyMsg = messages.addObject();
                    historyMsg.put("role", msg.get("role"));
                    historyMsg.put("content", msg.get("content"));
                }
            }

            ObjectNode userMsg = messages.addObject();
            userMsg.put("role", "user");
            userMsg.put("content", currentUserPrompt);

            HttpEntity<String> entity = new HttpEntity<>(requestBody.toString(), headers);
            String response = restTemplate.postForObject(resolveChatCompletionsUrl(), entity, String.class);
            return extractOpenAiContent(response);
        } catch (HttpStatusCodeException e) {
            return "AI 调用失败: " + e.getStatusCode() + " " + e.getResponseBodyAsString();
        } catch (Exception e) {
            return "AI 调用失败: " + e.getMessage();
        }
    }

    private String callAnthropicMessagesWithHistory(String systemPrompt, List<Map<String, String>> history, String currentUserPrompt) {
        try {
            String key = resolveApiKey();
            if (key.isBlank()) {
                return "AI 调用失败: 未配置 ai.api.key";
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

            if (history != null) {
                for (Map<String, String> msg : history) {
                    ObjectNode historyMsg = messages.addObject();
                    historyMsg.put("role", msg.get("role"));
                    historyMsg.put("content", msg.get("content"));
                }
            }

            ObjectNode userMsg = messages.addObject();
            userMsg.put("role", "user");
            userMsg.put("content", currentUserPrompt);

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
     * 流式调用大模型，逐 token 回调
     * @param systemPrompt 系统角色定义
     * @param messages 完整消息列表（包含历史）
     * @param onToken 每个增量 token 的回调，传入增量文本
     * @param onError 错误回调
     */
    public void streamChatResponse(
            String systemPrompt,
            List<Map<String, String>> messages,
            Consumer<String> onToken,
            Consumer<Throwable> onError
    ) {
        try {
            String key = resolveApiKey();

            if (key.isBlank()) {
                onError.accept(new RuntimeException("未配置 ai.api.key"));
                return;
            }

            if (shouldUseAnthropic()) {
                streamAnthropicMessages(systemPrompt, messages, onToken, onError);
            } else {
                streamOpenAiChatCompletions(systemPrompt, messages, onToken, onError);
            }
        } catch (Exception e) {
            log.error("streamChatResponse 异常", e);
            onError.accept(e);
        }
    }

    private void streamOpenAiChatCompletions(
            String systemPrompt,
            List<Map<String, String>> messages,
            Consumer<String> onToken,
            Consumer<Throwable> onError
    ) {
        try {
            System.out.println("=== streamOpenAiChatCompletions 开始 ===");
            String key = resolveApiKey();
            ObjectNode requestBody = objectMapper.createObjectNode();
            requestBody.put("model", resolveModel());
            requestBody.put("temperature", systemPrompt == null ? 0.7 : 0.3);
            requestBody.put("stream", true);

            ArrayNode messagesArray = requestBody.putArray("messages");

            if (systemPrompt != null && !systemPrompt.isBlank()) {
                ObjectNode sysMsg = messagesArray.addObject();
                sysMsg.put("role", "system");
                sysMsg.put("content", systemPrompt);
            }

            if (messages != null) {
                for (Map<String, String> msg : messages) {
                    ObjectNode msgNode = messagesArray.addObject();
                    msgNode.put("role", msg.get("role"));
                    msgNode.put("content", msg.get("content"));
                }
            }

            String url = resolveChatCompletionsUrl();
            log.info("Requesting URL: {}", url);
            log.info("Using model: {}", resolveModel());

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + key)
                    .timeout(Duration.ofSeconds(60))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody.toString()))
                    .build();

            HttpResponse<java.io.InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());

            int statusCode = response.statusCode();

            if (statusCode != 200) {
                String errorBody = new String(response.body().readAllBytes());
                log.error("AI API 错误: HTTP {} - {}", statusCode, errorBody);
                onError.accept(new RuntimeException("HTTP " + statusCode + ": " + errorBody));
                return;
            }

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("data: ")) {
                        String data = line.substring(6).trim();
                        if (data.equals("[DONE]")) {
                            break;
                        }

                        try {
                            JsonNode json = objectMapper.readTree(data);
                            JsonNode delta = json.path("choices").get(0).path("delta");
                            String content = delta.path("content").asText(null);
                            if (content != null && !content.isEmpty()) {
                                onToken.accept(content);
                            }
                        } catch (Exception e) {
                            log.debug("Failed to parse SSE chunk: {}", data);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("streamOpenAiChatCompletions 异常", e);
            onError.accept(e);
        }
    }

    private void streamAnthropicMessages(
            String systemPrompt,
            List<Map<String, String>> messages,
            Consumer<String> onToken,
            Consumer<Throwable> onError
    ) {
        try {
            String key = resolveApiKey();
            ObjectNode requestBody = objectMapper.createObjectNode();
            requestBody.put("model", resolveModel());
            requestBody.put("max_tokens", 1024);
            requestBody.put("temperature", systemPrompt == null ? 0.7 : 0.3);
            requestBody.put("stream", true);

            if (systemPrompt != null && !systemPrompt.isBlank()) {
                requestBody.put("system", systemPrompt);
            }

            ArrayNode messagesArray = requestBody.putArray("messages");
            if (messages != null) {
                for (Map<String, String> msg : messages) {
                    ObjectNode msgNode = messagesArray.addObject();
                    msgNode.put("role", msg.get("role"));
                    msgNode.put("content", msg.get("content"));
                }
            }

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(resolveAnthropicMessagesUrl()))
                    .header("Content-Type", "application/json")
                    .header("x-api-key", key)
                    .header("Authorization", "Bearer " + key)
                    .header("anthropic-version", "2023-06-01")
                    .timeout(Duration.ofSeconds(60))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody.toString()))
                    .build();

            HttpResponse<java.io.InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("data: ")) {
                        String data = line.substring(6).trim();

                        try {
                            JsonNode json = objectMapper.readTree(data);
                            String type = json.path("type").asText();

                            if ("content_block_delta".equals(type)) {
                                String text = json.path("delta").path("text").asText(null);
                                if (text != null && !text.isEmpty()) {
                                    onToken.accept(text);
                                }
                            }
                        } catch (Exception e) {
                            log.debug("Failed to parse Anthropic SSE chunk: {}", data);
                        }
                    }
                }
            }
        } catch (Exception e) {
            onError.accept(e);
        }
    }

    /**
     * 发送 SSE 事件的统一工具方法
     * @param emitter SseEmitter 实例
     * @param eventName 事件名称（token/step/progress/complete/error）
     * @param data 事件数据对象
     */
    public static void sendSseEvent(SseEmitter emitter, String eventName, Object data) {
        if (emitter == null) return;
        try {
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(data, MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            log.debug("SSE client disconnected: {}", e.getMessage());
        }
    }
}
