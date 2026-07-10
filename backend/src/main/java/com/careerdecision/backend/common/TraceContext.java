package com.careerdecision.backend.common;

import java.util.UUID;

public final class TraceContext {
    private static final ThreadLocal<String> CURRENT_TRACE_ID = new ThreadLocal<>();

    private TraceContext() {
    }

    public static String get() {
        return CURRENT_TRACE_ID.get();
    }

    public static String getOrCreate() {
        String current = CURRENT_TRACE_ID.get();
        if (current == null || current.isBlank()) {
            current = UUID.randomUUID().toString();
            CURRENT_TRACE_ID.set(current);
        }
        return current;
    }

    public static String resolve(String preferredTraceId) {
        if (preferredTraceId != null && !preferredTraceId.isBlank()) {
            CURRENT_TRACE_ID.set(preferredTraceId);
            return preferredTraceId;
        }
        return getOrCreate();
    }

    public static void set(String traceId) {
        if (traceId != null && !traceId.isBlank()) {
            CURRENT_TRACE_ID.set(traceId);
        }
    }

    public static void clear() {
        CURRENT_TRACE_ID.remove();
    }
}
