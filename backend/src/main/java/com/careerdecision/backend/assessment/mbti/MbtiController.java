package com.careerdecision.backend.assessment.mbti;

import com.careerdecision.backend.common.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/assessments/mbti")
public class MbtiController {
    private final MbtiService mbtiService;

    public MbtiController(MbtiService mbtiService) {
        this.mbtiService = mbtiService;
    }

    @GetMapping("/questions")
    public ApiResponse<List<MbtiQuestion>> questions() {
        return ApiResponse.success(mbtiService.questions());
    }

    @PostMapping("/submit")
    public ApiResponse<MbtiResult> submit(@Valid @RequestBody MbtiSubmitRequest request) {
        return ApiResponse.success(mbtiService.submit(request));
    }
}
