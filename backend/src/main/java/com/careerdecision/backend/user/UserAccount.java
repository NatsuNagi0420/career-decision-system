package com.careerdecision.backend.user;

import java.time.Instant;

public record UserAccount(
        long id,
        String username,
        String email,
        String phone,
        String passwordHash,
        Instant createdAt
) {
}
