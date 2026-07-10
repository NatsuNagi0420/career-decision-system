package com.careerdecision.backend.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
public class TraceIdFilter extends OncePerRequestFilter {
    public static final String REQUEST_ID_HEADER = "X-Request-ID";
    public static final String TRACE_ID_HEADER = "X-Trace-ID";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String traceId = firstNonBlank(
                request.getHeader(REQUEST_ID_HEADER),
                request.getHeader(TRACE_ID_HEADER),
                UUID.randomUUID().toString()
        );
        TraceContext.set(traceId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            response.setHeader(TRACE_ID_HEADER, TraceContext.getOrCreate());
            TraceContext.clear();
        }
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return UUID.randomUUID().toString();
    }
}
