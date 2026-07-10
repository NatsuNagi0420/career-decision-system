package com.careerdecision.backend.user;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

@Mapper
public interface UserMapper {
    @Select("""
            SELECT COUNT(1)
            FROM users
            WHERE LOWER(username) = LOWER(#{username})
              AND deleted = 0
            """)
    int countByUsername(@Param("username") String username);

    @Select("""
            SELECT COUNT(1)
            FROM users
            WHERE email = #{email}
              AND deleted = 0
            """)
    int countByEmail(@Param("email") String email);

    @Select("""
            SELECT COUNT(1)
            FROM users
            WHERE phone = #{phone}
              AND deleted = 0
            """)
    int countByPhone(@Param("phone") String phone);

    @Insert("""
            INSERT INTO users (username, email, phone, password_hash, status, deleted)
            VALUES (#{username}, #{email}, #{phone}, #{passwordHash}, 'active', 0)
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertUser(UserRecord user);

    @Select("""
            SELECT id, username, email, phone, password_hash, avatar_url, status, deleted, created_at, updated_at
            FROM users
            WHERE LOWER(username) = LOWER(#{username})
              AND deleted = 0
            LIMIT 1
            """)
    UserRecord findByUsername(@Param("username") String username);

    @Insert("""
            INSERT INTO user_tokens (user_id, token_hash, token_prefix, token_type, expires_at)
            VALUES (#{userId}, #{tokenHash}, #{tokenPrefix}, #{tokenType}, #{expiresAt})
            """)
    void insertToken(
            @Param("userId") long userId,
            @Param("tokenHash") String tokenHash,
            @Param("tokenPrefix") String tokenPrefix,
            @Param("tokenType") String tokenType,
            @Param("expiresAt") LocalDateTime expiresAt
    );

    @Select("""
            SELECT u.id, u.username, u.email, u.phone, u.password_hash, u.avatar_url, u.status, u.deleted, u.created_at, u.updated_at
            FROM users u
            JOIN user_tokens t ON t.user_id = u.id
            WHERE t.token_hash = #{tokenHash}
              AND t.token_type = 'access'
              AND t.revoked_at IS NULL
              AND t.expires_at > CURRENT_TIMESTAMP
              AND u.deleted = 0
              AND u.status = 'active'
            LIMIT 1
            """)
    UserRecord findActiveUserByTokenHash(@Param("tokenHash") String tokenHash);

    @Update("""
            UPDATE user_tokens
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE user_id = #{userId}
              AND token_hash = #{tokenHash}
              AND revoked_at IS NULL
            """)
    int revokeToken(
            @Param("userId") long userId,
            @Param("tokenHash") String tokenHash
    );

    @Select("""
            SELECT u.id, u.username, u.email, u.phone, u.password_hash, u.avatar_url, u.status, u.deleted, u.created_at, u.updated_at
            FROM users u
            JOIN user_tokens t ON t.user_id = u.id
            WHERE t.token_hash = #{tokenHash}
              AND t.token_type = 'refresh'
              AND t.revoked_at IS NULL
              AND t.expires_at > CURRENT_TIMESTAMP
              AND u.deleted = 0
              AND u.status = 'active'
            LIMIT 1
            """)
    UserRecord findActiveUserByRefreshTokenHash(@Param("tokenHash") String tokenHash);

    @Update("""
            UPDATE user_tokens
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE token_hash = #{tokenHash}
              AND token_type = 'refresh'
              AND revoked_at IS NULL
            """)
    int revokeRefreshToken(@Param("tokenHash") String tokenHash);

    @Update("""
            UPDATE user_tokens
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE user_id = #{userId}
              AND token_type = 'refresh'
              AND revoked_at IS NULL
            """)
    int revokeRefreshTokensForUser(@Param("userId") long userId);
}
