package com.careerdecision.backend.decision;

import java.time.LocalDateTime;

public record DecisionJobSampleRow(
        Long id, Long candidateId, Long jobId, String title, String company,
        String city, String salaryText, String note, LocalDateTime reviewedAt, LocalDateTime createdAt
) { }
