package com.careerdecision.backend.report;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DecisionSnapshotRequest(
        @NotBlank @Size(max = 80) String requestId
) {
}
