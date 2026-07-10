package com.careerdecision.backend.report;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record ReportArchiveRequest(
        @NotBlank @Size(max = 80) String type,
        @NotBlank @Size(max = 160) String title,
        @NotBlank @Size(max = 2000) String summary,
        @NotBlank @Size(max = 50000) String content,
        @Positive Long agentRunId
) {
}
