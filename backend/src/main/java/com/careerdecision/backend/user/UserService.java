package com.careerdecision.backend.user;

import com.careerdecision.backend.config.AuthProperties;
import com.careerdecision.backend.exception.BusinessException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class UserService {
    private static final int TOKEN_RANDOM_BYTES = 32;
    private static final String ACCESS_TOKEN_TYPE = "access";
    private static final String REFRESH_TOKEN_TYPE = "refresh";

    private final UserMapper userMapper;
    private final AuthProperties authProperties;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom secureRandom = new SecureRandom();

    public UserService(UserMapper userMapper, AuthProperties authProperties) {
        this.userMapper = userMapper;
        this.authProperties = authProperties;
    }

    public UserInfo register(UserRegisterRequest request) {
        if (!request.password().equals(request.confirmPassword())) {
            throw new BusinessException(40001, "Password confirmation does not match.");
        }
        String usernameKey = normalize(request.username());
        if (userMapper.countByUsername(usernameKey) > 0) {
            throw new BusinessException(40002, "Username already exists.");
        }
        String email = emptyToNull(request.email());
        if (email != null && userMapper.countByEmail(email) > 0) {
            throw new BusinessException(40003, "Email already exists.");
        }
        String phone = emptyToNull(request.phone());
        if (phone != null && userMapper.countByPhone(phone) > 0) {
            throw new BusinessException(40004, "Phone already exists.");
        }

        UserRecord user = new UserRecord();
        user.setUsername(request.username().trim());
        user.setEmail(email);
        user.setPhone(phone);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        userMapper.insertUser(user);
        return UserInfo.from(user);
    }

    public LoginResponse login(UserLoginRequest request) {
        UserRecord user = userMapper.findByUsername(normalize(request.username()));
        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BusinessException(401, "Invalid username or password.");
        }

        return issueLoginResponse(user);
    }

    public UserInfo currentUser(String authorizationHeader) {
        String token = extractBearerToken(authorizationHeader);
        UserRecord user = userMapper.findActiveUserByTokenHash(hashToken(token));
        if (user == null) {
            throw new BusinessException(401, "Unauthorized.");
        }
        return UserInfo.from(user);
    }

    public void logout(long userId, String authorizationHeader) {
        String token = extractBearerToken(authorizationHeader);
        if (userMapper.revokeToken(userId, hashToken(token)) == 0) {
            throw new BusinessException(401, "Unauthorized.");
        }
        userMapper.revokeRefreshTokensForUser(userId);
    }

    public LoginResponse refresh(RefreshTokenRequest request) {
        String refreshToken = request.refreshToken().trim();
        String refreshTokenHash = hashToken(refreshToken);
        UserRecord user = userMapper.findActiveUserByRefreshTokenHash(refreshTokenHash);
        if (user == null) {
            throw new BusinessException(401, "Invalid refresh token.");
        }
        if (userMapper.revokeRefreshToken(refreshTokenHash) == 0) {
            throw new BusinessException(401, "Invalid refresh token.");
        }
        return issueLoginResponse(user);
    }

    private LoginResponse issueLoginResponse(UserRecord user) {
        String accessToken = generateToken();
        String refreshToken = generateToken();
        LocalDateTime now = LocalDateTime.now();
        userMapper.insertToken(
                user.getId(),
                hashToken(accessToken),
                tokenPrefix(accessToken),
                ACCESS_TOKEN_TYPE,
                now.plusDays(authProperties.normalizedTokenExpireDays())
        );
        userMapper.insertToken(
                user.getId(),
                hashToken(refreshToken),
                tokenPrefix(refreshToken),
                REFRESH_TOKEN_TYPE,
                now.plusDays(authProperties.normalizedRefreshTokenExpireDays())
        );
        return new LoginResponse(accessToken, refreshToken, UserInfo.from(user));
    }

    private String tokenPrefix(String token) {
        return token.substring(0, Math.min(12, token.length()));
    }

    private String extractBearerToken(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw new BusinessException(401, "Unauthorized.");
        }
        return authorizationHeader.substring("Bearer ".length()).trim();
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private String emptyToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available.", ex);
        }
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_RANDOM_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
