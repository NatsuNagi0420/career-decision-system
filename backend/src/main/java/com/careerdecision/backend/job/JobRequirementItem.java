package com.careerdecision.backend.job;

public record JobRequirementItem(
        Long id,
        Long jobId,
        String itemType,
        String originalText,
        String normalizedKey,
        double confidence,
        String extractionMethod,
        String extractorVersion,
        int sortOrder
) {
}
