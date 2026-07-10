package com.careerdecision.backend.job;

import com.careerdecision.backend.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/jobs")
@Validated
public class JobController {
    private final JobService jobService;

    public JobController(JobService jobService) {
        this.jobService = jobService;
    }

    @GetMapping
    public ApiResponse<JobPageResponse<JobSummaryResponse>> search(
            @RequestParam(required = false) @Size(max = 80) String keyword,
            @RequestParam(required = false) @Size(max = 80) String city,
            @RequestParam(required = false) @Size(max = 80) String location,
            @RequestParam(required = false) @Size(max = 80) String direction,
            @RequestParam(required = false) @Size(max = 80) String tag,
            @RequestParam(required = false) Integer salaryMin,
            @RequestParam(required = false) Integer salaryMax,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        String selectedCity = city == null || city.isBlank() ? location : city;
        JobSearchCriteria criteria = new JobSearchCriteria(
                keyword,
                selectedCity,
                direction,
                tag,
                salaryMin,
                salaryMax,
                page,
                size
        );
        return ApiResponse.success(jobService.search(criteria));
    }

    @GetMapping("/facets")
    public ApiResponse<JobFacetsResponse> facets() {
        return ApiResponse.success(jobService.facets());
    }

    @GetMapping("/{id}")
    public ApiResponse<JobDetailResponse> detail(@PathVariable long id) {
        return ApiResponse.success(jobService.detail(id));
    }

    @PostMapping("/recommendations")
    public ApiResponse<List<JobMatchResponse>> recommendations(@Valid @RequestBody JobRecommendationRequest request) {
        return ApiResponse.success(jobService.recommend(request));
    }
}
