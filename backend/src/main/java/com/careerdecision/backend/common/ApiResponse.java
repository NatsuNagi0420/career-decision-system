package com.careerdecision.backend.common;

import java.time.Instant;

public record ApiResponse<T>(
        int code,
        String message,
        T data,
        long timestamp,
        String traceId
) {
    public static <T> ApiResponse<T> success(T data) {
        return success(data, null);
    }

    public static <T> ApiResponse<T> success(T data, String traceId) {
        return new ApiResponse<>(0, "success", data, Instant.now().toEpochMilli(), TraceContext.resolve(traceId));
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return error(code, message, null);
    }

    public static <T> ApiResponse<T> error(int code, String message, String traceId) {
        return new ApiResponse<>(code, message, null, Instant.now().toEpochMilli(), TraceContext.resolve(traceId));
    }
}
