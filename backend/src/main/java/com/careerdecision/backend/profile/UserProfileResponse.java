package com.careerdecision.backend.profile;

import com.careerdecision.backend.user.UserInfo;

import java.time.LocalDateTime;
import java.time.LocalDate;
import java.util.List;

public record UserProfileResponse(
        long userId,
        String displayName,
        String identityType,
        String school,
        String major,
        String degree,
        String grade,
        LocalDate graduationDate,
        String city,
        String targetRole,
        List<String> targetCities,
        String expectedSalary,
        String currentConfusion,
        List<String> existingDirections,
        Integer weeklyAvailableMinutes,
        boolean onboardingCompleted,
        Integer profileVersion,
        List<String> skills,
        List<String> certificates,
        List<String> experiences,
        List<String> values,
        List<String> preferredIndustries,
        List<String> preferredWorkModes,
        List<String> constraints,
        boolean externalAiConsent,
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
                null,
                null,
                null,
                List.of(),
                null,
                null,
                List.of(),
                null,
                false,
                1,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                false,
                false,
                null
        );
    }
}
