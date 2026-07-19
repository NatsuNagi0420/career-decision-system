package com.careerdecision.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RenameChatSessionRequest(
        @NotBlank @Size(max = 80) String title
) { }
