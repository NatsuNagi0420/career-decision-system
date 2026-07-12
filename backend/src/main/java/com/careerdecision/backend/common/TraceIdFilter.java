package com.careerdecision.backend.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
public class TraceIdFilter extends OncePerRequestFilter {
    public static final String REQUEST_ID_HEADER = "X-Request-ID";
    public static final String TRACE_ID_HEADER = "X-Trace-ID";
    private static final Logger log = LoggerFactory.getLogger(TraceIdFilter.class);

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String traceId = firstSafe(
                request.getHeader(REQUEST_ID_HEADER),
                request.getHeader(TRACE_ID_HEADER),
                UUID.randomUUID().toString()
        );
        TraceContext.set(traceId);
        MDC.put("traceId", traceId);
        long startedNanos = System.nanoTime();
        Throwable unhandledError = null;
        try {
            filterChain.doFilter(request, response);
        } catch (IOException | ServletException | RuntimeException | Error ex) {
            unhandledError = ex;
            throw ex;
        } finally {
            String completedTraceId = TraceContext.getOrCreate();
            response.setHeader(TRACE_ID_HEADER, completedTraceId);
            long durationMs = Math.max(0L, (System.nanoTime() - startedNanos) / 1_000_000L);
            int status = response.getStatus();
            if (unhandledError != null) {
                log.warn(
                        "HTTP request failed method={} path={} status={} durationMs={} errorType={} traceId={}",
                        request.getMethod(), request.getRequestURI(), status, durationMs,
                        unhandledError.getClass().getSimpleName(), completedTraceId
                );
            } else {
                log.info(
                        "HTTP request completed method={} path={} status={} durationMs={} traceId={}",
                        request.getMethod(), request.getRequestURI(), status, durationMs, completedTraceId
                );
            }
            MDC.remove("traceId");
            TraceContext.clear();
        }
    }

    private String firstSafe(String... values) {
        for (String value : values) {
            if (TraceContext.isSafe(value)) {
                return value;
            }
        }
        return UUID.randomUUID().toString();
    }
}
