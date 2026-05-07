/**
 * 文件说明：JSON 工具类。
 * 职责：基于 Jackson 提供对象与 JSON 字符串互转、JSON 转 Map/Bean 等常用序列化与反序列化能力。
 */
package com.example.ba.utils;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

public class JsonUtils {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public static String toJson(Object obj) {
        if (obj == null) return null;
        try {
            return OBJECT_MAPPER.writeValueAsString(obj);
        } catch (Exception e) {
            throw new RuntimeException("JSON 序列化失败: " + e.getMessage());
        }
    }

    public static Map<String, Object> toMap(String json) {
        if (json == null || json.trim().isEmpty()) return null;
        try {
            return OBJECT_MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new RuntimeException("JSON 反序列化失败: " + e.getMessage());
        }
    }

    public static <T> T toBean(String json, Class<T> clazz) {
        if (json == null || json.trim().isEmpty()) return null;
        try {
            return OBJECT_MAPPER.readValue(json, clazz);
        } catch (Exception e) {
            throw new RuntimeException("JSON 反序列化为对象失败: " + e.getMessage());
        }
    }
}

