package com.careerdecision.backend.user;

import com.careerdecision.backend.config.AuthProperties;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class UserServiceTest {
    @Test
    void loginCreatesStrongHashedTokenWithConfiguredExpiration() {
        FakeUserMapper mapper = new FakeUserMapper("secret123");
        UserService service = new UserService(mapper, new AuthProperties(3, 15));

        LocalDateTime before = LocalDateTime.now();
        LoginResponse response = service.login(new UserLoginRequest(" Alice ", "secret123"));
        LocalDateTime after = LocalDateTime.now();

        assertThat(response.token()).matches("[A-Za-z0-9_-]{43}");
        assertThat(response.refreshToken()).matches("[A-Za-z0-9_-]{43}");
        assertThat(response.refreshToken()).isNotEqualTo(response.token());

        TokenWrite access = mapper.lastToken("access");
        TokenWrite refresh = mapper.lastToken("refresh");
        assertThat(access.tokenHash).hasSize(64);
        assertThat(access.tokenHash).doesNotContain(response.token());
        assertThat(access.tokenPrefix).isEqualTo(response.token().substring(0, 12));
        assertThat(access.expiresAt)
                .isAfterOrEqualTo(before.plusDays(3).minusSeconds(1))
                .isBeforeOrEqualTo(after.plusDays(3).plusSeconds(1));
        assertThat(refresh.tokenHash).hasSize(64);
        assertThat(refresh.tokenHash).doesNotContain(response.refreshToken());
        assertThat(refresh.tokenPrefix).isEqualTo(response.refreshToken().substring(0, 12));
        assertThat(refresh.expiresAt)
                .isAfterOrEqualTo(before.plusDays(15).minusSeconds(1))
                .isBeforeOrEqualTo(after.plusDays(15).plusSeconds(1));
    }

    @Test
    void refreshRotatesRefreshTokenAndIssuesNewAccessToken() {
        FakeUserMapper mapper = new FakeUserMapper("secret123");
        UserService service = new UserService(mapper, new AuthProperties(2, 30));
        LoginResponse login = service.login(new UserLoginRequest("alice", "secret123"));
        String firstRefreshHash = mapper.lastToken("refresh").tokenHash;

        LoginResponse refreshed = service.refresh(new RefreshTokenRequest(login.refreshToken()));

        assertThat(refreshed.token()).matches("[A-Za-z0-9_-]{43}");
        assertThat(refreshed.refreshToken()).matches("[A-Za-z0-9_-]{43}");
        assertThat(refreshed.token()).isNotEqualTo(login.token());
        assertThat(refreshed.refreshToken()).isNotEqualTo(login.refreshToken());
        assertThat(mapper.revokedRefreshTokenHashes).contains(firstRefreshHash);
        assertThat(mapper.tokensByType("access")).hasSize(2);
        assertThat(mapper.tokensByType("refresh")).hasSize(2);
    }

    private static final class FakeUserMapper implements UserMapper {
        private final UserRecord user;
        private final List<TokenWrite> tokens = new ArrayList<>();
        private final List<String> revokedRefreshTokenHashes = new ArrayList<>();

        private FakeUserMapper(String password) {
            user = new UserRecord();
            user.setId(100L);
            user.setUsername("alice");
            user.setEmail("alice@example.com");
            user.setPasswordHash(new BCryptPasswordEncoder().encode(password));
        }

        @Override
        public int countByUsername(String username) {
            return 0;
        }

        @Override
        public int countByEmail(String email) {
            return 0;
        }

        @Override
        public int countByPhone(String phone) {
            return 0;
        }

        @Override
        public void insertUser(UserRecord user) {
        }

        @Override
        public UserRecord findByUsername(String username) {
            return "alice".equals(username) ? user : null;
        }

        @Override
        public void insertToken(long userId, String tokenHash, String tokenPrefix, String tokenType, LocalDateTime expiresAt) {
            tokens.add(new TokenWrite(userId, tokenHash, tokenPrefix, tokenType, expiresAt));
        }

        @Override
        public UserRecord findActiveUserByTokenHash(String tokenHash) {
            return null;
        }

        @Override
        public int revokeToken(long userId, String tokenHash) {
            return 0;
        }

        @Override
        public UserRecord findActiveUserByRefreshTokenHash(String tokenHash) {
            return tokens.stream()
                    .anyMatch(token -> token.tokenHash.equals(tokenHash)
                            && "refresh".equals(token.tokenType)
                            && !revokedRefreshTokenHashes.contains(tokenHash))
                    ? user
                    : null;
        }

        @Override
        public int revokeRefreshToken(String tokenHash) {
            if (findActiveUserByRefreshTokenHash(tokenHash) == null) {
                return 0;
            }
            revokedRefreshTokenHashes.add(tokenHash);
            return 1;
        }

        @Override
        public int revokeRefreshTokensForUser(long userId) {
            tokens.stream()
                    .filter(token -> token.userId == userId)
                    .filter(token -> "refresh".equals(token.tokenType))
                    .map(TokenWrite::tokenHash)
                    .forEach(revokedRefreshTokenHashes::add);
            return 1;
        }

        private TokenWrite lastToken(String tokenType) {
            return tokens.stream()
                    .filter(token -> token.tokenType.equals(tokenType))
                    .reduce((first, second) -> second)
                    .orElseThrow();
        }

        private List<TokenWrite> tokensByType(String tokenType) {
            return tokens.stream()
                    .filter(token -> token.tokenType.equals(tokenType))
                    .toList();
        }
    }

    private record TokenWrite(
            long userId,
            String tokenHash,
            String tokenPrefix,
            String tokenType,
            LocalDateTime expiresAt
    ) {
    }
}
