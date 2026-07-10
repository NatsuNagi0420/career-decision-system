package com.careerdecision.backend.resume;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record ResumeAnalysisArchiveRequest(
        @Size(max = 120) String targetRole,
        @NotBlank @Size(max = 20000) String resumeText,
        @Positive Long agentRunId,
        @NotNull @Valid ResumeAnalysisPayload analysis
) {
}
