/**
 * 文件说明：AI 配置健康检查控制器。
 * 职责：提供检查大模型 API 配置是否完整的接口，如返回当前 baseUrl、model 等信息，
 *       供前端判断 AI 能力是否可用。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@CrossOrigin
public class AiHealthController {

    @Value("${ai.api.key:}")
    private String apiKey;

    @Value("${ai.api.base-url:}")
    private String baseUrl;

    @Value("${ai.api.model:}")
    private String model;

    @GetMapping("/health")
    public Result<Map<String, Object>> health() {
        Map<String, Object> data = new HashMap<>();
        data.put("configured", apiKey != null && !apiKey.isBlank());
        data.put("baseUrl", baseUrl);
        data.put("model", model);
        return Result.success(data);
    }
}

