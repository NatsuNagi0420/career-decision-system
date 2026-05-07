/**
 * 文件说明：职业路径规划控制器。
 * 职责：基于输入信息生成职业路径图谱。
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
@RequestMapping("/api/path-plan")
@CrossOrigin
public class PathPlanController {
    @Autowired
    private CapabilityService capabilityService;

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
}