/**
 * 文件说明：能力画像相关控制器。
 * 职责：对外提供能力画像草稿生成接口。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.CapabilityProfileRequestDTO;
import com.example.ba.exception.BusinessException;
import com.example.ba.service.CapabilityService;
import com.example.ba.utils.AiUtils;
import com.example.ba.utils.AuthContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.ExecutorService;

@RestController
@RequestMapping("/api/capability")
@CrossOrigin
public class CapabilityController {

    private static final Logger log = LoggerFactory.getLogger(CapabilityController.class);

    @Autowired
    private CapabilityService capabilityService;

    @Autowired
    @Qualifier("sseExecutor")
    private ExecutorService executorService;

    @PostMapping("/profile/draft")
    public Result<Map<String, Object>> profileDraft(@RequestBody CapabilityProfileRequestDTO req) {
        Long userId = AuthContext.getUserId();
        if (req != null && userId != null) {
            req.setUserId(userId);
        }
        Map<String, Object> out = capabilityService.generateProfile(req);
        return Result.success(out);
    }

    @PostMapping(value = "/profile/stream", produces = "text/event-stream;charset=UTF-8")
    public SseEmitter profileStream(@RequestBody CapabilityProfileRequestDTO req) {
        // 创建 SseEmitter（5分钟超时）
        SseEmitter emitter = new SseEmitter(5 * 60 * 1000L);

        Long userId = AuthContext.getUserId();
        if (req != null && userId != null) {
            req.setUserId(userId);
        }

        // 设置超时回调
        emitter.onTimeout(() -> {
            log.warn("能力画像SSE连接超时: userId={}", userId);
            try {
                emitter.complete();
            } catch (Exception e) {
                log.debug("完成超时连接时出错: {}", e.getMessage());
            }
        });

        // 设置错误回调
        emitter.onError((ex) -> {
            log.error("能力画像SSE连接异常: userId={}", userId, ex);
            try {
                emitter.complete();
            } catch (Exception e) {
                log.debug("完成异常连接时出错: {}", e.getMessage());
            }
        });

        // 设置完成回调
        emitter.onCompletion(() -> {
            log.info("能力画像SSE连接关闭: userId={}", userId);
        });

        // 异步执行业务逻辑
        executorService.execute(() -> {
            try {
                log.info("开始生成能力画像: userId={}", userId);
                AiUtils.sendSseEvent(emitter, "start", Map.of("message", "开始生成能力画像"));

                Map<String, Object> result = capabilityService.generateProfileWithChain(req, emitter);

                AiUtils.sendSseEvent(emitter, "complete", result);
                emitter.complete();
                log.info("能力画像生成完成: userId={}", userId);

            } catch (BusinessException e) {
                log.warn("能力画像生成业务异常: userId={}, message={}", userId, e.getMessage());
                AiUtils.sendSseError(emitter, e.getMessage());

            } catch (Exception e) {
                log.error("能力画像生成系统异常: userId={}", userId, e);
                AiUtils.sendSseError(emitter, "系统错误，请稍后重试");
            }
        });

        return emitter;
    }
}
