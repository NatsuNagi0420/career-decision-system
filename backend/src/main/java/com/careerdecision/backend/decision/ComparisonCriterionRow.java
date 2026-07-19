package com.careerdecision.backend.decision;

public record ComparisonCriterionRow(
        Long id, String code, String name, String description,
        Integer importance, Integer sortOrder, String criterionKind, String sourceType
) { }
