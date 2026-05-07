/**
 * 文件说明：认证上下文工具类。
 * 职责：基于 ThreadLocal 存取当前请求线程对应的用户 ID，
 *       便于在业务层无侵入地获取登录用户身份信息。
 */
package com.example.ba.utils;

public class AuthContext {
    private static final ThreadLocal<Long> USER_ID = new ThreadLocal<>();

    public static void setUserId(Long userId) {
        USER_ID.set(userId);
    }

    public static Long getUserId() {
        return USER_ID.get();
    }

    public static void clear() {
        USER_ID.remove();
    }
}

