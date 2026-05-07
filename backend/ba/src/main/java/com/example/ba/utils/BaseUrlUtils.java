/**
 * 文件说明：请求基准 URL 处理工具类。
 * 职责：根据当前请求上下文动态获取基础访问地址，并将相对路径拼接为完整可访问 URL。
 */
package com.example.ba.utils;

import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * URL 处理工具类：动态获取当前请求的基准地址
 */
public class BaseUrlUtils {

    /**
     * 获取当前请求的基准地址 (协议://IP或域名:端口)
     * 例如: http://localhost:8080 或 http://192.168.1.100:8080
     */
    public static String getBaseUrl() {
        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .toUriString();
    }

    /**
     * 将相对路径转换为绝对路径
     * @param relativePath 相对路径 (如 /uploads/avatar.png)
     * @return 绝对路径 (如 http://localhost:8080/uploads/avatar.png)
     */
    public static String getAbsoluteUrl(String relativePath) {
        if (relativePath == null || relativePath.isEmpty()) {
            return "";
        }
        if (relativePath.startsWith("http")) {
            return relativePath;
        }
        return getBaseUrl() + relativePath;
    }
}
