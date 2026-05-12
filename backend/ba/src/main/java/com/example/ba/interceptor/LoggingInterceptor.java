/**
 * 文件说明：日志拦截器。
 * 职责：为每个请求添加 requestId 和 userId 到 MDC，自动记录请求信息和性能数据。
 */
package com.example.ba.interceptor;

import com.example.ba.utils.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.UUID;

/**
 * 日志拦截器
 * 为每个请求添加 requestId 和 userId 到 MDC，便于日志追踪
 */
@Component
public class LoggingInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(LoggingInterceptor.class);
    private static final Logger perfLog = LoggerFactory.getLogger("PERF");

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 生成请求ID
        String requestId = UUID.randomUUID().toString().substring(0, 8);
        MDC.put("requestId", requestId);

        // 获取用户ID
        Long userId = AuthContext.getUserId();
        if (userId != null) {
            MDC.put("userId", String.valueOf(userId));
        }

        // 记录请求开始时间
        request.setAttribute("startTime", System.currentTimeMillis());

        // 记录请求信息
        log.info("请求开始: {} {} from {}",
                request.getMethod(),
                request.getRequestURI(),
                request.getRemoteAddr());

        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        try {
            // 计算请求耗时
            Long startTime = (Long) request.getAttribute("startTime");
            if (startTime != null) {
                long duration = System.currentTimeMillis() - startTime;

                // 记录请求完成信息
                log.info("请求完成: {} {} - 状态码: {} - 耗时: {}ms",
                        request.getMethod(),
                        request.getRequestURI(),
                        response.getStatus(),
                        duration);

                // 记录性能日志
                perfLog.info("method={} uri={} status={} duration={}ms",
                        request.getMethod(),
                        request.getRequestURI(),
                        response.getStatus(),
                        duration);

                // 慢请求告警（超过3秒）
                if (duration > 3000) {
                    log.warn("慢请求告警: {} {} 耗时 {}ms",
                            request.getMethod(),
                            request.getRequestURI(),
                            duration);
                }
            }

            // 如果有异常，记录异常信息
            if (ex != null) {
                log.error("请求异常: {} {}", request.getMethod(), request.getRequestURI(), ex);
            }

        } finally {
            // 清理 MDC，避免内存泄漏
            MDC.clear();
        }
    }
}
