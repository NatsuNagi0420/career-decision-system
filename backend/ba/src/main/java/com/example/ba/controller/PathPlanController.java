/**
 * 文件说明：职业路径规划控制器。
 * 职责：基于输入信息生成职业路径图谱。
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
@RequestMapping("/api/path-plan")
@CrossOrigin
public class PathPlanController {

    private static final Logger log = LoggerFactory.getLogger(PathPlanController.class);

    @Autowired
    private CapabilityService capabilityService;

    @Autowired
    @Qualifier("sseExecutor")
    private ExecutorService executorService;

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
        // 创建 SseEmitter（5分钟超时）
        SseEmitter emitter = new SseEmitter(5 * 60 * 1000L);

        Long userId = AuthContext.getUserId();
        if (req == null) {
            req = new CapabilityProfileRequestDTO();
        }
        req.setUserId(userId);

        final CapabilityProfileRequestDTO finalReq = req;

        // 设置超时回调
        emitter.onTimeout(() -> {
            log.warn("职业路径规划SSE连接超时: userId={}", userId);
            try {
                emitter.complete();
            } catch (Exception e) {
                log.debug("完成超时连接时出错: {}", e.getMessage());
            }
        });

        // 设置错误回调
        emitter.onError((ex) -> {
            log.error("职业路径规划SSE连接异常: userId={}", userId, ex);
            try {
                emitter.complete();
            } catch (Exception e) {
                log.debug("完成异常连接时出错: {}", e.getMessage());
            }
        });

        // 设置完成回调
        emitter.onCompletion(() -> {
            log.info("职业路径规划SSE连接关闭: userId={}", userId);
        });

        // 异步执行业务逻辑
        executorService.execute(() -> {
            try {
                log.info("开始生成职业路径: userId={}", userId);
                AiUtils.sendSseEvent(emitter, "start", Map.of("message", "开始生成职业路径"));

                Map<String, Object> result = capabilityService.generateCareerPathWithChain(finalReq, emitter);

                AiUtils.sendSseEvent(emitter, "complete", result);
                emitter.complete();
                log.info("职业路径生成完成: userId={}", userId);

            } catch (BusinessException e) {
                log.warn("职业路径规划业务异常: userId={}, message={}", userId, e.getMessage());
                AiUtils.sendSseError(emitter, e.getMessage());

            } catch (Exception e) {
                log.error("职业路径规划系统异常: userId={}", userId, e);
                AiUtils.sendSseError(emitter, "系统错误，请稍后重试");
            }
        });

        return emitter;
    }
}