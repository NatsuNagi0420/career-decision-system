package com.careerdecision.mobile.network

data class DashboardResponse(
    val state: String,
    val primaryAction: String,
    val primaryActionLabel: String,
    val primaryActionPath: String,
    val onboardingCompleted: Boolean,
    val profile: DashboardProfile?,
    val currentProject: DashboardProject?,
    val today: TodayResponse,
    val latestReview: DashboardReview?,
    val generatedAt: String?
)

data class DashboardProfile(
    val displayName: String?,
    val school: String?,
    val major: String?,
    val grade: String?,
    val city: String?,
    val externalAiConsent: Boolean,
    val updatedAt: String?
)

data class DashboardProject(
    val id: Long,
    val title: String,
    val question: String,
    val status: String,
    val currentStage: String,
    val candidateCount: Int,
    val jobSampleCount: Int,
    val primaryTarget: String?,
    val backupTarget: String?,
    val decisionReason: String?,
    val mainRisks: String?,
    val reviewDate: String?,
    val confirmedAt: String?,
    val evidenceCount: Int,
    val resultCount: Int,
    val updatedAt: String?
)

data class DashboardReview(
    val id: Long,
    val planId: Long,
    val weekNo: Int,
    val status: String,
    val updatedAt: String?
)

data class DecisionProjectEvidence(
    val id: Long,
    val candidateId: Long?,
    val personalEvidenceId: Long?,
    val title: String,
    val detail: String?,
    val sourceType: String?,
    val sourceRef: String?,
    val credibility: String?,
    val stance: String?,
    val updatedAt: String?
)

/**
 * Android currently needs only the evidence section from a decision project.
 * Gson safely ignores the remaining project fields returned by the backend.
 */
data class DecisionProjectDetail(
    val id: Long,
    val evidence: List<DecisionProjectEvidence> = emptyList()
)

data class PersonalEvidence(
    val id: Long,
    val evidenceType: String,
    val title: String,
    val description: String?,
    val roleName: String?,
    val resultSummary: String?,
    val linkUrl: String?,
    val proficiency: String?,
    val lastUsedAt: String?,
    val feedback: String?,
    val sourceType: String?,
    val sourceRefType: String?,
    val sourceRefId: Long?,
    val credibility: String?,
    val visibility: String?,
    val occurredAt: String?,
    val createdAt: String?,
    val updatedAt: String?
)

data class ActionTaskResult(
    val id: Long,
    val description: String,
    val linkUrl: String?,
    val verificationStatus: String,
    val createdAt: String?,
    val updatedAt: String?
)

data class ActionTask(
    val id: Long,
    val weekNo: Int,
    val title: String,
    val taskType: String,
    val content: String?,
    val status: String,
    val dueAt: String?,
    val estimatedMinutes: Int?,
    val acceptanceCriteria: String,
    val startedAt: String?,
    val completedAt: String?,
    val deferredTo: String?,
    val skipReason: String?,
    val sortOrder: Int,
    val version: Int,
    val results: List<ActionTaskResult>,
    val updatedAt: String?
)

data class TodayResponse(
    val planId: Long?,
    val projectId: Long?,
    val targetId: Long?,
    val targetRole: String?,
    val weekNo: Int,
    val completedThisWeek: Int,
    val totalThisWeek: Int,
    val tasks: List<ActionTask>,
    val serverTime: String?
)

data class ActionPlanSummary(
    val id: Long,
    val projectId: Long,
    val targetId: Long,
    val targetRole: String,
    val status: String,
    val durationWeeks: Int,
    val taskCount: Int,
    val completedTaskCount: Int,
    val progressPercent: Int,
    val startDate: String?,
    val endDate: String?,
    val createdAt: String?,
    val updatedAt: String?
)

data class ActionPlanWeek(
    val id: Long,
    val weekNo: Int,
    val title: String,
    val goal: String,
    val tasks: List<ActionTask>
)

data class ActionPlanDetail(
    val id: Long,
    val projectId: Long,
    val targetId: Long,
    val targetRole: String,
    val overview: String?,
    val status: String,
    val durationWeeks: Int,
    val version: Int,
    val startDate: String?,
    val endDate: String?,
    val taskCount: Int,
    val completedTaskCount: Int,
    val progressPercent: Int,
    val weeks: List<ActionPlanWeek>,
    val createdAt: String?,
    val updatedAt: String?
)

data class ActionTaskStatusRequest(
    val status: String,
    val reason: String? = null,
    val deferredTo: String? = null,
    val requestId: String,
    val expectedVersion: Int
)

data class ActionTaskResultRequest(
    val description: String,
    val linkUrl: String? = null,
    val requestId: String
)

data class CoachingRequest(
    val requestId: String,
    val focus: String? = null
)

data class ConfidenceFeedbackRequest(
    val requestId: String,
    val trend: String,
    val reason: String
)

data class ConfidenceFeedbackResponse(
    val id: Long,
    val projectId: Long,
    val targetId: Long,
    val trend: String,
    val reason: String,
    val requestId: String,
    val createdAt: String?
)

data class WeeklyReviewRequest(
    val requestId: String,
    val planId: Long,
    val weekNo: Int,
    val completedSummary: String? = null,
    val evidenceSummary: String? = null,
    val difficulties: String? = null,
    val nextWeekMinutes: Int? = null,
    val confidenceTrend: String? = null,
    val confidenceReason: String? = null
)

data class WeeklyReviewResponse(
    val id: Long,
    val planId: Long,
    val projectId: Long,
    val weekNo: Int,
    val completedSummary: String?,
    val evidenceSummary: String?,
    val difficulties: String?,
    val nextWeekMinutes: Int?,
    val confidenceTrend: String?,
    val confidenceReason: String?,
    val adjustmentProposal: String?,
    val status: String,
    val requestId: String?,
    val submittedAt: String?,
    val createdAt: String?,
    val updatedAt: String?
)

data class EvidenceBasis(
    val statement: String,
    val sourceRefs: List<String> = emptyList()
)

data class SuggestedAction(
    val actionType: String,
    val title: String,
    val rationale: String,
    val acceptanceCriteria: String?
)

data class ActionCoachResponse(
    val generationMode: String,
    val modelName: String?,
    val confidence: Double,
    val conclusion: String,
    val evidenceBasis: List<EvidenceBasis> = emptyList(),
    val counterArguments: List<String> = emptyList(),
    val uncertainties: List<String> = emptyList(),
    val nextActions: List<SuggestedAction> = emptyList(),
    val agentRunId: Long? = null
)
