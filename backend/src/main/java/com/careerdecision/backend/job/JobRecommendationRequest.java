package com.careerdecision.backend.job;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record JobRecommendationRequest(
        @Size(max = 40) Map<String, Object> profile,
        @Size(max = 40) Map<String, Object> assessment,
        @Min(1) @Max(20) Integer limit
) {
}
