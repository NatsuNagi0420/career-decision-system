/**
 * 文件说明：能力画像相关控制器。
 * 职责：对外提供能力画像草稿生成接口。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.CapabilityProfileRequestDTO;
import com.example.ba.service.CapabilityService;
import com.example.ba.utils.AuthContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/capability")
@CrossOrigin
public class CapabilityController {

    @Autowired
    private CapabilityService capabilityService;

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
}
