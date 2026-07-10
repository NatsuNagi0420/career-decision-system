package com.careerdecision.backend.job;

import java.util.List;

public record JobPageResponse<T>(
        List<T> items,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext,
        boolean hasPrevious
) {
    static <T> JobPageResponse<T> of(List<T> items, int page, int size, long totalElements) {
        int totalPages = totalElements == 0 ? 0 : (int) Math.ceil((double) totalElements / size);
        return new JobPageResponse<>(
                items,
                page,
                size,
                totalElements,
                totalPages,
                page + 1 < totalPages,
                page > 0 && totalPages > 0
        );
    }
}
