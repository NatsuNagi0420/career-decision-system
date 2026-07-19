package com.careerdecision.backend.decision;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class DecisionProjectModels {
    private DecisionProjectModels() {
    }

    public record ProjectRequest(
            @Size(max = 160) String title,
            @NotBlank @Size(max = 500) String question,
            LocalDate decisionDeadline,
            @Size(max = 5000) String background,
            @Size(max = 5000) String triggerReason,
            @Size(max = 4) List<@Size(max = 100) String> priorities,
            @Size(max = 5) List<@Size(max = 160) String> mustHaves,
            @Size(max = 5) List<@Size(max = 160) String> dealBreakers,
            @Size(max = 5) List<@Valid InitialCandidateRequest> initialCandidates,
            @Min(0) Integer expectedVersion
    ) {
        public ProjectRequest(
                String title,
                String question,
                LocalDate decisionDeadline,
                String background,
                String triggerReason,
                List<String> priorities,
                List<String> mustHaves,
                List<String> dealBreakers,
                Integer expectedVersion
        ) {
            this(title, question, decisionDeadline, background, triggerReason, priorities,
                    mustHaves, dealBreakers, null, expectedVersion);
        }
    }

    public record InitialCandidateRequest(
            Long directionId,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 20) String sourceType
    ) {
    }

    public record StageRequest(@NotBlank String stage, @Min(0) Integer expectedVersion) {
    }

    public record VersionRequest(@NotNull @Min(0) Integer expectedVersion) {
    }

    public record CandidateRequest(
            Long directionId,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 5000) String recommendationReason,
            @Size(max = 5000) String opposingFactors,
            @Size(max = 5000) String uncertainties,
            @Size(max = 12) List<@Size(max = 300) String> validationActions,
            @Size(max = 20) String sourceType,
            @Min(0) Integer expectedVersion
    ) {
    }

    public record JobSampleRequest(
            @NotNull Long candidateId,
            @NotNull Long jobId,
            @Size(max = 500) String note,
            @Min(0) Integer expectedVersion
    ) {
    }

    public record EvidenceRequest(
            Long candidateId,
            Long personalEvidenceId,
            @NotBlank @Size(max = 160) String title,
            @Size(max = 5000) String detail,
            @Size(max = 40) String sourceType,
            @Size(max = 160) String sourceRef,
            @Size(max = 20) String credibility,
            @Size(max = 20) String stance,
            Boolean syncToProfile,
            @Min(0) Integer expectedVersion
    ) {
        public EvidenceRequest(
                Long candidateId,
                Long personalEvidenceId,
                String title,
                String detail,
                String sourceType,
                String sourceRef,
                String credibility,
                String stance,
                Integer expectedVersion
        ) {
            this(candidateId, personalEvidenceId, title, detail, sourceType, sourceRef,
                    credibility, stance, false, expectedVersion);
        }
    }

    public record CriterionRequest(
            @NotBlank @Size(max = 80) String name,
            @Size(max = 500) String description,
            @Min(1) @Max(5) Integer importance,
            @Min(0) Integer expectedVersion
    ) {
    }

    public record ComparisonRequest(
            @NotNull Long candidateId,
            @Min(1) @Max(5) Integer score,
            @Size(max = 5000) String assessment,
            @Size(max = 20) List<Long> evidenceIds,
            @Size(max = 2000) String uncertainty,
            @Size(max = 2000) String validationAction,
            @Min(0) Integer expectedVersion
    ) {
    }

    public record BatchComparisonItemRequest(
            @NotNull Long criterionId,
            @NotNull Long candidateId,
            @NotBlank @Pattern(regexp = "meets|partial|does_not_meet|unknown|not_found|needs_attention|present|good_fit|trade_off|poor_fit") String verdict,
            @Size(max = 5000) String assessment,
            @Size(max = 20) List<Long> evidenceIds,
            @Size(max = 2000) String uncertainty,
            @Size(max = 2000) String validationAction,
            Boolean confirmed
    ) {
    }

    public record BatchComparisonRequest(
            @NotNull @Size(min = 1, max = 100) List<@Valid BatchComparisonItemRequest> results,
            @Min(0) Integer expectedVersion
    ) {
    }

    public record TargetConfirmationRequest(
            @NotNull Long primaryCandidateId,
            Long backupCandidateId,
            @NotBlank @Size(max = 5000) String decisionReason,
            @Size(max = 5000) String mainRisks,
            LocalDate reviewDate,
            @NotNull Boolean confirmed,
            @Pattern(regexp = "provisional|verified") String verificationStatus,
            @Size(max = 5000) String overrideReason,
            @Min(0) Integer expectedVersion
    ) {
        public TargetConfirmationRequest(
                Long primaryCandidateId,
                Long backupCandidateId,
                String decisionReason,
                String mainRisks,
                LocalDate reviewDate,
                Boolean confirmed,
                Integer expectedVersion
        ) {
            this(primaryCandidateId, backupCandidateId, decisionReason, mainRisks, reviewDate,
                    confirmed, null, null, expectedVersion);
        }
    }

    public record ConfidenceFeedbackRequest(
            @NotBlank @Size(max = 80) String requestId,
            @NotBlank @Pattern(regexp = "increased|stable|decreased") String trend,
            @NotBlank @Size(max = 1000) String reason
    ) {
    }

    public record ConfidenceFeedbackResponse(
            long id,
            long projectId,
            long targetId,
            String trend,
            String reason,
            String requestId,
            LocalDateTime createdAt
    ) {
    }

    public record ProjectSummary(
            long id,
            String title,
            String question,
            String status,
            String currentStage,
            boolean current,
            int version,
            int candidateCount,
            int jobSampleCount,
            String primaryTarget,
            LocalDate decisionDeadline,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    public record CandidateResponse(
            long id,
            Long directionId,
            String name,
            String sourceType,
            String recommendationReason,
            String opposingFactors,
            String uncertainties,
            List<String> validationActions,
            int sortOrder,
            LocalDateTime updatedAt
    ) {
    }

    public record JobSampleResponse(
            long id,
            long candidateId,
            long jobId,
            String title,
            String company,
            String city,
            String salaryText,
            String note,
            LocalDateTime reviewedAt,
            LocalDateTime createdAt
    ) {
    }

    public record EvidenceResponse(
            long id,
            Long candidateId,
            Long personalEvidenceId,
            String title,
            String detail,
            String sourceType,
            String sourceRef,
            String credibility,
            String stance,
            LocalDateTime updatedAt
    ) {
    }

    public record ComparisonResultResponse(
            long id,
            long candidateId,
            Integer score,
            String assessment,
            List<Long> evidenceIds,
            String uncertainty,
            String validationAction,
            String verdict,
            LocalDateTime confirmedAt,
            LocalDateTime updatedAt
    ) {
    }

    public record CriterionResponse(
            long id,
            String code,
            String name,
            String description,
            int importance,
            int sortOrder,
            String criterionKind,
            String sourceType,
            List<ComparisonResultResponse> results
    ) {
    }

    public record TargetResponse(
            long id,
            long candidateId,
            String targetType,
            String targetName,
            String decisionReason,
            String mainRisks,
            LocalDate reviewDate,
            String verificationStatus,
            LocalDateTime verifiedAt,
            String overrideReason,
            LocalDateTime confirmedAt
    ) {
    }

    public record ProjectDetail(
            long id,
            String title,
            String question,
            LocalDate decisionDeadline,
            String background,
            String triggerReason,
            List<String> priorities,
            List<String> mustHaves,
            List<String> dealBreakers,
            String status,
            String currentStage,
            boolean current,
            int version,
            List<CandidateResponse> candidates,
            List<JobSampleResponse> jobSamples,
            List<EvidenceResponse> evidence,
            List<CriterionResponse> criteria,
            List<TargetResponse> targets,
            int flowVersion,
            LocalDateTime comparisonReviewedAt,
            LocalDateTime decidedAt,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    public record CandidateJourney(
            long candidateId,
            String state,
            int evidenceCount,
            int jobSampleCount,
            int comparisonCount,
            List<String> remainingItems
    ) {
    }

    public record JourneyStage(
            String code,
            boolean ready,
            boolean complete,
            List<String> remainingItems
    ) {
    }

    public record JourneyResponse(
            long projectId,
            String currentStage,
            String projectStatus,
            boolean canSaveProvisional,
            boolean canVerify,
            List<JourneyStage> stages,
            List<CandidateJourney> candidates,
            List<String> nextSteps
    ) {
    }
}
