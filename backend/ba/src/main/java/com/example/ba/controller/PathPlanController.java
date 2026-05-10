/**
 * 文件说明：职业路径规划控制器。
 * 职责：基于输入信息生成职业路径图谱。
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
@RequestMapping("/api/path-plan")
@CrossOrigin
public class PathPlanController {
    @Autowired
    private CapabilityService capabilityService;

    private final ExecutorService executorService = Executors.newCachedThreadPool();

    @PostMapping("/generate")
    public Result<Map<String, Object>> generate(@RequestBody(required = false) CapabilityProfileRequestDTO req) {
        Long userId = AuthContext.getUserId();
        if (req == null) {
            req = new CapabilityProfileRequestDTO();
        }
        req.setUserId(userId);

        Map<String, Object> path = capabilityService.generateCareerPath(req);
        return Result.success(path);
    }

    @PostMapping(value = "/generate/stream", produces = "text/event-stream;charset=UTF-8")
    public SseEmitter generateStream(@RequestBody(required = false) CapabilityProfileRequestDTO req) {
        SseEmitter emitter = new SseEmitter(120_000L);

        Long userId = AuthContext.getUserId();
        if (req == null) {
            req = new CapabilityProfileRequestDTO();
        }
        req.setUserId(userId);

        final CapabilityProfileRequestDTO finalReq = req;

        executorService.execute(() -> {
            try {
                Map<String, Object> result = capabilityService.generateCareerPathWithChain(finalReq, emitter);
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