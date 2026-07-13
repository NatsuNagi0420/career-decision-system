package com.careerdecision.mobile.ui

data class PlanMilestoneUi(
    val weekNo: Int,
    val title: String,
    val goal: String,
    val completedTasks: Int,
    val totalTasks: Int,
    val current: Boolean
) {
    val progressPercent: Int
        get() = if (totalTasks == 0) 0 else completedTasks * 100 / totalTasks
}

data class ProfileUi(
    val displayName: String = "",
    val school: String = "",
    val major: String = "",
    val grade: String = "",
    val city: String = "",
    val currentConfusion: String = "",
    val existingDirections: List<String> = emptyList(),
    val weeklyAvailableMinutes: Int = 300,
    val onboardingCompleted: Boolean = true,
    val profileVersion: Int = 1,
    val externalAiConsent: Boolean = false
)

data class OnboardingForm(
    val displayName: String,
    val school: String,
    val major: String,
    val grade: String,
    val city: String,
    val currentConfusion: String,
    val existingDirections: List<String>,
    val weeklyAvailableMinutes: Int
)

data class MentorMessageUi(
    val localId: String,
    val requestId: String?,
    val role: String,
    val content: String,
    val generationMode: String? = null,
    val confidence: Double? = null,
    val evidence: List<String> = emptyList(),
    val uncertainties: List<String> = emptyList(),
    val nextStep: String? = null,
    val pending: Boolean = false,
    val failed: Boolean = false,
    val createdAt: String? = null
)
