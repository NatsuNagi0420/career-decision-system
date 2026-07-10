package com.careerdecision.backend.profile;

import com.careerdecision.backend.user.UserInfo;

import java.time.LocalDateTime;
import java.util.List;

public record UserProfileResponse(
        long userId,
        String displayName,
        String identityType,
        String school,
        String major,
        String degree,
        String targetRole,
        List<String> targetCities,
        String expectedSalary,
        List<String> skills,
        List<String> certificates,
        List<String> experiences,
        List<String> values,
        boolean completed,
        LocalDateTime updatedAt
) {
    static UserProfileResponse empty(UserInfo user) {
        return new UserProfileResponse(
                user.id(),
                user.username(),
                null,
                null,
                null,
                null,
                null,
                List.of(),
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                false,
                null
        );
    }
}
