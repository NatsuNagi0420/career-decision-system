package com.careerdecision.backend.resume;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ResumeAnalysisPayload(
        @Min(0) @Max(100) Integer score,
        @Min(0) @Max(100) Integer atsScore,
        @Min(0) @Max(100) Integer keywordMatch,
        @Size(max = 30) List<@Size(max = 500) String> issues,
        @Size(max = 30) List<@Size(max = 500) String> suggestions,
        @Size(max = 20) List<@Size(max = 1000) String> improvedFragments
) {
}
