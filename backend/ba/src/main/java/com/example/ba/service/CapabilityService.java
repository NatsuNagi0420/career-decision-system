/**
 * 文件说明：能力画像与职业路径业务接口。
 * 职责：定义生成用户能力画像以及职业路径规划的核心服务方法。
 */
package com.example.ba.service;

import com.example.ba.dto.CapabilityProfileRequestDTO;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

public interface CapabilityService {
    Map<String, Object> generateProfile(CapabilityProfileRequestDTO req);
    Map<String, Object> generateCareerPath(CapabilityProfileRequestDTO req);
    Map<String, Object> generateProfileWithChain(CapabilityProfileRequestDTO req, SseEmitter emitter);
    Map<String, Object> generateCareerPathWithChain(CapabilityProfileRequestDTO req, SseEmitter emitter);
}

