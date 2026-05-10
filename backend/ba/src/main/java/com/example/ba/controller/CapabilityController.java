/**
 * 文件说明：能力画像相关控制器。
 * 职责：对外提供能力画像草稿生成接口。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.CapabilityProfileRequestDTO;
import com.example.ba.service.CapabilityService;
import com.example.ba.utils.AiUtils;
import com.example.ba.utils.AuthContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
@RequestMapping("/api/capability")
@CrossOrigin
public class CapabilityController {

    @Autowired
    private CapabilityService capabilityService;

    private final ExecutorService executorService = Executors.newCachedThreadPool();

    @PostMapping("/profile/draft")
    public Result<Map<String, Object>> profileDraft(@RequestBody CapabilityProfileRequestDTO req) {
        try {
            Long userId = AuthContext.getUserId();
            if (req != null && userId != null) {
                req.setUserId(userId);
            }
            Map<String, Object> out = capabilityService.generateProfile(req);
            return Result.success(out);
        } catch (Exception e) {
            return Result.error("生成能力画像失败: " + e.getMessage());
        }
    }

    @PostMapping(value = "/profile/stream", produces = "text/event-stream;charset=UTF-8")
    public SseEmitter profileStream(@RequestBody CapabilityProfileRequestDTO req) {
        SseEmitter emitter = new SseEmitter(120_000L);

        Long userId = AuthContext.getUserId();
        if (req != null && userId != null) {
            req.setUserId(userId);
        }

        executorService.execute(() -> {
            try {
                Map<String, Object> result = capabilityService.generateProfileWithChain(req, emitter);
                AiUtils.sendSseEvent(emitter, "complete", result);
                emitter.complete();
            } catch (Exception e) {
                AiUtils.sendSseEvent(emitter, "error", Map.of("message", e.getMessage()));
                emitter.complete();
            }
        });

        return emitter;
    }
}
