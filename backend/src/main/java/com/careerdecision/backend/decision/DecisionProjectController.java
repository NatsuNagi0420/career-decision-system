package com.careerdecision.backend.decision;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.CandidateRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ComparisonRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ConfidenceFeedbackRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ConfidenceFeedbackResponse;
import com.careerdecision.backend.decision.DecisionProjectModels.CriterionRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.EvidenceRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.JobSampleRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectDetail;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.ProjectSummary;
import com.careerdecision.backend.decision.DecisionProjectModels.StageRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.TargetConfirmationRequest;
import com.careerdecision.backend.decision.DecisionProjectModels.VersionRequest;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@RestController
@Validated
@RequestMapping("/api/v1/decision-projects")
public class DecisionProjectController {
    private final DecisionProjectService service;

    public DecisionProjectController(DecisionProjectService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<List<ProjectSummary>> list(@CurrentUser UserInfo user) {
        return ApiResponse.success(service.list(user.id()));
    }

    @PostMapping
    public ApiResponse<ProjectDetail> create(@CurrentUser UserInfo user, @Valid @RequestBody ProjectRequest request) {
        return ApiResponse.success(service.create(user.id(), request));
    }

    @GetMapping("/{projectId}")
    public ApiResponse<ProjectDetail> detail(@CurrentUser UserInfo user, @PathVariable long projectId) {
        return ApiResponse.success(service.detail(user.id(), projectId));
    }

    @PutMapping("/{projectId}")
    public ApiResponse<ProjectDetail> update(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody ProjectRequest request
    ) {
        return ApiResponse.success(service.update(user.id(), projectId, request));
    }

    @DeleteMapping("/{projectId}")
    public ApiResponse<Void> archive(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @RequestParam @Min(0) int expectedVersion
    ) {
        service.archive(user.id(), projectId, expectedVersion);
        return ApiResponse.success(null);
    }

    @PostMapping("/{projectId}/current")
    public ApiResponse<ProjectDetail> makeCurrent(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody VersionRequest request
    ) {
        return ApiResponse.success(service.makeCurrent(user.id(), projectId, request.expectedVersion()));
    }

    @PatchMapping("/{projectId}/stage")
    public ApiResponse<ProjectDetail> moveStage(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody StageRequest request
    ) {
        return ApiResponse.success(service.moveStage(
                user.id(), projectId, request.stage(), request.expectedVersion()
        ));
    }

    @PostMapping("/{projectId}/candidates")
    public ApiResponse<ProjectDetail> addCandidate(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody CandidateRequest request
    ) {
        return ApiResponse.success(service.addCandidate(user.id(), projectId, request));
    }

    @PutMapping("/{projectId}/candidates/{candidateId}")
    public ApiResponse<ProjectDetail> updateCandidate(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long candidateId,
            @Valid @RequestBody CandidateRequest request
    ) {
        return ApiResponse.success(service.updateCandidate(user.id(), projectId, candidateId, request));
    }

    @DeleteMapping("/{projectId}/candidates/{candidateId}")
    public ApiResponse<ProjectDetail> removeCandidate(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long candidateId,
            @RequestParam(required = false) Integer expectedVersion
    ) {
        return ApiResponse.success(service.removeCandidate(
                user.id(), projectId, candidateId, expectedVersion
        ));
    }

    @PostMapping("/{projectId}/job-samples")
    public ApiResponse<ProjectDetail> addJobSample(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody JobSampleRequest request
    ) {
        return ApiResponse.success(service.addJobSample(user.id(), projectId, request));
    }

    @DeleteMapping("/{projectId}/job-samples/{sampleId}")
    public ApiResponse<ProjectDetail> removeJobSample(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long sampleId,
            @RequestParam(required = false) Integer expectedVersion
    ) {
        return ApiResponse.success(service.removeJobSample(
                user.id(), projectId, sampleId, expectedVersion
        ));
    }

    @PostMapping("/{projectId}/evidence")
    public ApiResponse<ProjectDetail> addEvidence(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody EvidenceRequest request
    ) {
        return ApiResponse.success(service.addEvidence(user.id(), projectId, request));
    }

    @PutMapping("/{projectId}/evidence/{evidenceId}")
    public ApiResponse<ProjectDetail> updateEvidence(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long evidenceId,
            @Valid @RequestBody EvidenceRequest request
    ) {
        return ApiResponse.success(service.updateEvidence(user.id(), projectId, evidenceId, request));
    }

    @DeleteMapping("/{projectId}/evidence/{evidenceId}")
    public ApiResponse<ProjectDetail> hideEvidence(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long evidenceId,
            @RequestParam(required = false) Integer expectedVersion
    ) {
        return ApiResponse.success(service.hideEvidence(
                user.id(), projectId, evidenceId, expectedVersion
        ));
    }

    @PostMapping("/{projectId}/criteria")
    public ApiResponse<ProjectDetail> addCriterion(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody CriterionRequest request
    ) {
        return ApiResponse.success(service.addCriterion(user.id(), projectId, request));
    }

    @PutMapping("/{projectId}/criteria/{criterionId}")
    public ApiResponse<ProjectDetail> updateCriterion(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long criterionId,
            @Valid @RequestBody CriterionRequest request
    ) {
        return ApiResponse.success(service.updateCriterion(user.id(), projectId, criterionId, request));
    }

    @DeleteMapping("/{projectId}/criteria/{criterionId}")
    public ApiResponse<ProjectDetail> removeCriterion(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long criterionId,
            @RequestParam(required = false) Integer expectedVersion
    ) {
        return ApiResponse.success(service.removeCriterion(
                user.id(), projectId, criterionId, expectedVersion
        ));
    }

    @PutMapping("/{projectId}/criteria/{criterionId}/results")
    public ApiResponse<ProjectDetail> saveComparison(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long criterionId,
            @Valid @RequestBody ComparisonRequest request
    ) {
        return ApiResponse.success(service.saveComparison(user.id(), projectId, criterionId, request));
    }

    @PostMapping("/{projectId}/targets/confirm")
    public ApiResponse<ProjectDetail> confirmTargets(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @Valid @RequestBody TargetConfirmationRequest request
    ) {
        return ApiResponse.success(service.confirmTargets(user.id(), projectId, request));
    }

    @PostMapping("/{projectId}/targets/{targetId}/confidence-feedback")
    public ApiResponse<ConfidenceFeedbackResponse> recordConfidence(
            @CurrentUser UserInfo user,
            @PathVariable long projectId,
            @PathVariable long targetId,
            @Valid @RequestBody ConfidenceFeedbackRequest request
    ) {
        return ApiResponse.success(service.recordConfidence(user.id(), projectId, targetId, request));
    }
}
