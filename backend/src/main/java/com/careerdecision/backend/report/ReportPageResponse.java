package com.careerdecision.backend.report;

import java.util.List;

public record ReportPageResponse(
        List<ReportSnapshot> items,
        int page,
        int size,
        long total,
        int totalPages
) {
}
