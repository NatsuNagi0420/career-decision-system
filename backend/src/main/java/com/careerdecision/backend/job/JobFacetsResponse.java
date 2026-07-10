package com.careerdecision.backend.job;

import java.util.List;

public record JobFacetsResponse(
        List<JobFacetItem> cities,
        List<JobFacetItem> directions,
        List<JobFacetItem> tags
) {
}
