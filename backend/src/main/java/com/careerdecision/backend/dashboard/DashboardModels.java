package com.careerdecision.backend.dashboard;

import com.careerdecision.backend.action.ActionPlanModels.TodayResponse;

import java.time.LocalDateTime;
import java.time.LocalDate;

public final class DashboardModels {
    private DashboardModels() {
    }

    public record DashboardResponse(
            String state,
            String primaryAction,
            String primaryActionLabel,
            String primaryActionPath,
            boolean onboardingCompleted,
            ProfileSnapshot profile,
            ProjectSnapshot currentProject,
            TodayResponse today,
            ExecutionRiskSnapshot executionRisk,
            AgentAdviceSnapshot latestAgentAdvice,
            ReviewSnapshot latestReview,
            LocalDateTime generatedAt
    ) {
    }

    public record ProfileSnapshot(
            String displayName,
            String school,
            String major,
            String grade,
            String city,
            boolean externalAiConsent,
            LocalDateTime updatedAt
    ) {
    }

    public record ProjectSnapshot(
            long id,
            String title,
            String question,
            String status,
            String currentStage,
            int candidateCount,
            int jobSampleCount,
            int openQuestionCount,
            String primaryTarget,
            String backupTarget,
            String decisionReason,
            String mainRisks,
            LocalDate reviewDate,
            LocalDateTime confirmedAt,
            int evidenceCount,
            int resultCount,
            LocalDateTime updatedAt
    ) {
    }

    public record ReviewSnapshot(
            long id,
            long planId,
            int weekNo,
            String status,
            LocalDateTime updatedAt
    ) {
    }

    public record ExecutionRiskSnapshot(
            int overdueTaskCount,
            int deferredTaskCount,
            int completedWithoutEvidenceCount,
            int recentResultCount
    ) {
        public boolean hasRisk() {
            return overdueTaskCount > 0 || deferredTaskCount > 0 || completedWithoutEvidenceCount > 0;
        }
    }

    public record AgentAdviceSnapshot(
            long id,
            String agentType,
            String generationMode,
            String conclusion,
            String nextStep,
            LocalDateTime createdAt
    ) {
    }
}
