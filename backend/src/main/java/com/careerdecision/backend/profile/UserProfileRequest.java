package com.careerdecision.backend.profile;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public record UserProfileRequest(
        @Size(max = 80) String displayName,
        @Size(max = 40) String identityType,
        @Size(max = 120) String school,
        @Size(max = 120) String major,
        @Size(max = 40) String degree,
        @Size(max = 120) String targetRole,
        @Size(max = 12) List<@Size(max = 80) String> targetCities,
        @Size(max = 60) String expectedSalary,
        @Size(max = 24) List<@Size(max = 80) String> skills,
        @Size(max = 20) List<@Size(max = 120) String> certificates,
        @Size(max = 20) List<@Size(max = 160) String> experiences,
        @Size(max = 16) List<@Size(max = 80) String> values,
        @Size(max = 12) List<@Size(max = 80) String> preferredIndustries,
        @Size(max = 12) List<@Size(max = 80) String> preferredWorkModes,
        @Size(max = 16) List<@Size(max = 160) String> constraints,
        Boolean externalAiConsent,
        @Size(max = 40) String grade,
        LocalDate graduationDate,
        @Size(max = 80) String city,
        @Size(max = 500) String currentConfusion,
        @Size(max = 5) List<@Size(max = 120) String> existingDirections,
        @Min(0) @Max(10080) Integer weeklyAvailableMinutes,
        Boolean completeOnboarding,
        @Min(1) Integer expectedVersion
) {
    public UserProfileRequest(
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
            List<String> values
    ) {
        this(displayName, identityType, school, major, degree, targetRole, targetCities,
                expectedSalary, skills, certificates, experiences, values,
                null, null, null, null, null, null, null, null,
                null, null, null, null);
    }
}
