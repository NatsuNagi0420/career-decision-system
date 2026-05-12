package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.service.impl.CapabilityServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 缓存管理控制器
 * 提供缓存统计查询和手动清理功能
 */
@RestController
@RequestMapping("/api/cache")
@CrossOrigin(origins = "*")
public class CacheController {

    @Autowired
    private CapabilityServiceImpl capabilityService;

    /**
     * 获取缓存统计信息
     * GET /api/cache/stats
     */
    @GetMapping("/stats")
    public Result<Map<String, Object>> getCacheStats() {
        return Result.success(capabilityService.getCacheStatistics());
    }

    /**
     * 清空所有缓存
     * DELETE /api/cache/all
     */
    @DeleteMapping("/all")
    public Result<Map<String, Object>> clearAllCache() {
        return Result.success(capabilityService.clearCache());
    }

    /**
     * 清空指定用户的缓存
     * DELETE /api/cache/user/{userId}
     */
    @DeleteMapping("/user/{userId}")
    public Result<Map<String, Object>> clearUserCache(@PathVariable Long userId) {
        return Result.success(capabilityService.clearUserCache(userId));
    }
}
