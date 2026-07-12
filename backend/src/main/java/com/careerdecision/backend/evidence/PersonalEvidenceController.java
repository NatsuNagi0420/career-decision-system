package com.careerdecision.backend.evidence;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.evidence.PersonalEvidenceModels.EvidenceRequest;
import com.careerdecision.backend.evidence.PersonalEvidenceModels.EvidenceResponse;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/personal-evidence")
public class PersonalEvidenceController {
    private final PersonalEvidenceService service;

    public PersonalEvidenceController(PersonalEvidenceService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<List<EvidenceResponse>> list(
            @CurrentUser UserInfo user,
            @RequestParam(required = false) String type
    ) {
        return ApiResponse.success(service.list(user.id(), type));
    }

    @GetMapping("/{id}")
    public ApiResponse<EvidenceResponse> detail(@CurrentUser UserInfo user, @PathVariable long id) {
        return ApiResponse.success(service.detail(user.id(), id));
    }

    @PostMapping
    public ApiResponse<EvidenceResponse> create(
            @CurrentUser UserInfo user,
            @Valid @RequestBody EvidenceRequest request
    ) {
        return ApiResponse.success(service.create(user.id(), request));
    }

    @PutMapping("/{id}")
    public ApiResponse<EvidenceResponse> update(
            @CurrentUser UserInfo user,
            @PathVariable long id,
            @Valid @RequestBody EvidenceRequest request
    ) {
        return ApiResponse.success(service.update(user.id(), id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> hide(@CurrentUser UserInfo user, @PathVariable long id) {
        service.hide(user.id(), id);
        return ApiResponse.success(null);
    }
}
