package com.careerdecision.backend.common;

import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.MDC;

public final class TraceContext {
    private static final int MAX_TRACE_ID_LENGTH = 128;
    private static final Pattern SAFE_TRACE_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}");
    private static final ThreadLocal<String> CURRENT_TRACE_ID = new ThreadLocal<>();

    private TraceContext() {
    }

    public static String get() {
        return CURRENT_TRACE_ID.get();
    }

    public static String getOrCreate() {
        String current = CURRENT_TRACE_ID.get();
        if (current == null || current.isBlank()) {
            current = set(UUID.randomUUID().toString());
        }
        return current;
    }

    public static String resolve(String preferredTraceId) {
        return preferredTraceId == null || preferredTraceId.isBlank()
                ? getOrCreate()
                : set(preferredTraceId);
    }

    public static String set(String traceId) {
        String safeTraceId = isSafe(traceId) ? traceId : UUID.randomUUID().toString();
        CURRENT_TRACE_ID.set(safeTraceId);
        MDC.put("traceId", safeTraceId);
        return safeTraceId;
    }

    public static boolean isSafe(String traceId) {
        return traceId != null
                && !traceId.isBlank()
                && traceId.length() <= MAX_TRACE_ID_LENGTH
                && SAFE_TRACE_ID.matcher(traceId).matches();
    }

    public static void clear() {
        MDC.remove("traceId");
        CURRENT_TRACE_ID.remove();
    }
}
