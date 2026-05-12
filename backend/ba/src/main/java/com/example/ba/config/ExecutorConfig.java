/**
 * 文件说明：线程池配置类。
 * 职责：为 SSE 异步任务提供统一的线程池配置，避免无限制创建线程。
 */
package com.example.ba.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * 线程池配置类
 * 为 SSE 异步任务提供统一的线程池配置
 */
@Configuration
public class ExecutorConfig {

    private static final Logger log = LoggerFactory.getLogger(ExecutorConfig.class);

    /**
     * SSE 任务专用线程池
     * 核心线程数: 5
     * 最大线程数: 20
     * 空闲线程存活时间: 60秒
     * 任务队列容量: 100
     * 拒绝策略: CallerRunsPolicy（调用者线程执行）
     */
    @Bean(name = "sseExecutor", destroyMethod = "shutdown")
    public ExecutorService sseExecutor() {
        ThreadPoolExecutor executor = new ThreadPoolExecutor(
            5,  // 核心线程数
            20, // 最大线程数
            60L, TimeUnit.SECONDS, // 空闲线程存活时间
            new LinkedBlockingQueue<>(100), // 任务队列
            new ThreadPoolExecutor.CallerRunsPolicy() // 拒绝策略：调用者运行
        );

        log.info("SSE线程池已初始化: corePoolSize=5, maxPoolSize=20, queueCapacity=100");
        return executor;
    }
}
