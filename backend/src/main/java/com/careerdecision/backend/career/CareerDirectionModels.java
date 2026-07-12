package com.careerdecision.backend.career;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class CareerDirectionModels {
    private CareerDirectionModels() {
    }

    public record DirectionRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Size(max = 80) String category,
            @NotBlank @Size(max = 800) String summary,
            @Size(max = 12) List<@Size(max = 160) String> typicalWork,
            @Size(max = 12) List<@Size(max = 100) String> commonSkills,
            @Size(max = 12) List<@Size(max = 160) String> growthPath,
            @Size(max = 12) List<@Size(max = 200) String> misconceptions,
            @Size(max = 12) List<@Size(max = 80) String> majorTags,
            @Size(max = 12) List<@Size(max = 80) String> industryTags,
            @Size(max = 12) List<@Size(max = 80) String> workTypes
    ) {
    }

    public record DirectionResponse(
            long id,
            String code,
            String name,
            String category,
            String summary,
            List<String> typicalWork,
            List<String> commonSkills,
            List<String> growthPath,
            List<String> misconceptions,
            List<String> majorTags,
            List<String> industryTags,
            List<String> workTypes,
            boolean custom,
            boolean favorite,
            LocalDateTime updatedAt
    ) {
    }

    public record DirectionRow(
            Long id,
            Long ownerUserId,
            String code,
            String name,
            String category,
            String summary,
            String typicalWorkJson,
            String commonSkillsJson,
            String growthPathJson,
            String misconceptionsJson,
            String majorTagsJson,
            String industryTagsJson,
            String workTypesJson,
            Integer favorite,
            LocalDateTime updatedAt
    ) {
    }
}
