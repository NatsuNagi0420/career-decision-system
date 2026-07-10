package com.careerdecision.backend.user;

import com.careerdecision.backend.config.LoginRateLimitProperties;
import com.careerdecision.backend.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LoginRateLimiterTest {
    @Test
    void blocksWhenFailuresReachConfiguredLimit() {
        MutableClock clock = new MutableClock();
        LoginRateLimiter limiter = new LoginRateLimiter(
                new LoginRateLimitProperties(true, 2, 60),
                clock
        );
        MockHttpServletRequest request = request("203.0.113.10");

        limiter.recordFailure(" Alice ", request);
        assertThatCode(() -> limiter.assertAllowed("alice", request)).doesNotThrowAnyException();

        limiter.recordFailure("alice", request);
        assertThatThrownBy(() -> limiter.assertAllowed("ALICE", request))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).code())
                .isEqualTo(42901);
    }

    @Test
    void clearsFailuresAfterSuccessfulLogin() {
        MutableClock clock = new MutableClock();
        LoginRateLimiter limiter = new LoginRateLimiter(
                new LoginRateLimitProperties(true, 1, 60),
                clock
        );
        MockHttpServletRequest request = request("203.0.113.11");

        limiter.recordFailure("alice", request);
        limiter.recordSuccess("alice", request);

        assertThatCode(() -> limiter.assertAllowed("alice", request)).doesNotThrowAnyException();
    }

    @Test
    void allowsLoginAfterWindowExpires() {
        MutableClock clock = new MutableClock();
        LoginRateLimiter limiter = new LoginRateLimiter(
                new LoginRateLimitProperties(true, 1, 60),
                clock
        );
        MockHttpServletRequest request = request("203.0.113.12");

        limiter.recordFailure("alice", request);
        clock.advanceSeconds(60);

        assertThatCode(() -> limiter.assertAllowed("alice", request)).doesNotThrowAnyException();
    }

    @Test
    void separatesAttemptsByClientIp() {
        MutableClock clock = new MutableClock();
        LoginRateLimiter limiter = new LoginRateLimiter(
                new LoginRateLimitProperties(true, 1, 60),
                clock
        );

        limiter.recordFailure("alice", request("203.0.113.13"));

        assertThatCode(() -> limiter.assertAllowed("alice", request("203.0.113.14"))).doesNotThrowAnyException();
    }

    private MockHttpServletRequest request(String remoteAddr) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        return request;
    }

    private static final class MutableClock extends Clock {
        private Instant instant = Instant.parse("2026-06-11T00:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }

        private void advanceSeconds(long seconds) {
            instant = instant.plusSeconds(seconds);
        }
    }
}
