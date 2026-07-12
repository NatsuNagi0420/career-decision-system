package com.careerdecision.backend.evidence;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class PersonalEvidenceModels {
    private PersonalEvidenceModels() {
    }

    public record EvidenceRequest(
            @NotBlank @Size(max = 40) String evidenceType,
            @NotBlank @Size(max = 160) String title,
            @Size(max = 5000) String description,
            @Size(max = 160) String roleName,
            @Size(max = 5000) String resultSummary,
            @Size(max = 1000) String linkUrl,
            @Size(max = 40) String proficiency,
            LocalDate lastUsedAt,
            @Size(max = 5000) String feedback,
            @Size(max = 40) String sourceType,
            @Size(max = 40) String sourceRefType,
            Long sourceRefId,
            @Size(max = 20) String credibility,
            LocalDate occurredAt
    ) {
    }

    public record EvidenceResponse(
            long id,
            String evidenceType,
            String title,
            String description,
            String roleName,
            String resultSummary,
            String linkUrl,
            String proficiency,
            LocalDate lastUsedAt,
            String feedback,
            String sourceType,
            String sourceRefType,
            Long sourceRefId,
            String credibility,
            String visibility,
            LocalDate occurredAt,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }
}
