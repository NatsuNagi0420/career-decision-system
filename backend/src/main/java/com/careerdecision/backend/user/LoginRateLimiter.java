package com.careerdecision.backend.user;

import com.careerdecision.backend.config.LoginRateLimitProperties;
import com.careerdecision.backend.exception.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class LoginRateLimiter {
    private final LoginRateLimitProperties properties;
    private final Clock clock;
    private final ConcurrentMap<String, AttemptWindow> attempts = new ConcurrentHashMap<>();

    @Autowired
    public LoginRateLimiter(LoginRateLimitProperties properties) {
        this(properties, Clock.systemUTC());
    }

    LoginRateLimiter(LoginRateLimitProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public void assertAllowed(String username, HttpServletRequest request) {
        if (!properties.normalizedEnabled()) {
            return;
        }

        String key = key(username, request);
        AttemptWindow window = attempts.get(key);
        if (window == null) {
            return;
        }

        synchronized (window) {
            if (isExpired(window, now())) {
                attempts.remove(key, window);
                return;
            }
            if (window.failures >= properties.normalizedMaxAttempts()) {
                throw new BusinessException(42901, "Too many login attempts. Please try again later.");
            }
        }
    }

    public void recordFailure(String username, HttpServletRequest request) {
        if (!properties.normalizedEnabled()) {
            return;
        }

        String key = key(username, request);
        Instant now = now();
        attempts.compute(key, (ignored, current) -> {
            if (current == null || isExpired(current, now)) {
                return new AttemptWindow(1, now);
            }
            synchronized (current) {
                current.failures += 1;
                return current;
            }
        });
    }

    public void recordSuccess(String username, HttpServletRequest request) {
        if (!properties.normalizedEnabled()) {
            return;
        }
        attempts.remove(key(username, request));
    }

    private boolean isExpired(AttemptWindow window, Instant now) {
        return Duration.between(window.windowStartedAt, now).getSeconds() >= properties.normalizedWindowSeconds();
    }

    private Instant now() {
        return clock.instant();
    }

    private String key(String username, HttpServletRequest request) {
        return clientIp(request) + "|" + normalizedUsername(username);
    }

    private String normalizedUsername(String username) {
        if (username == null || username.isBlank()) {
            return "anonymous";
        }
        String normalized = username.trim().toLowerCase(Locale.ROOT);
        return normalized.length() <= 128 ? normalized : normalized.substring(0, 128);
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = firstHeaderValue(request.getHeader("X-Forwarded-For"));
        if (forwardedFor != null) {
            return forwardedFor;
        }
        String realIp = firstHeaderValue(request.getHeader("X-Real-IP"));
        if (realIp != null) {
            return realIp;
        }
        String remoteAddr = request.getRemoteAddr();
        return remoteAddr == null || remoteAddr.isBlank() ? "unknown" : remoteAddr.trim();
    }

    private String firstHeaderValue(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String first = value.split(",", 2)[0].trim();
        return first.isBlank() ? null : first;
    }

    private static final class AttemptWindow {
        private int failures;
        private final Instant windowStartedAt;

        private AttemptWindow(int failures, Instant windowStartedAt) {
            this.failures = failures;
            this.windowStartedAt = windowStartedAt;
        }
    }
}
