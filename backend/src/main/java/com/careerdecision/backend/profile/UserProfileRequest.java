package com.careerdecision.backend.profile;

import jakarta.validation.constraints.Size;

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
        @Size(max = 16) List<@Size(max = 80) String> values
) {
}
