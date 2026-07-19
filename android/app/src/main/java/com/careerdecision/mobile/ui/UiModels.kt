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
    val actions: List<MentorActionUi> = emptyList(),
    val hasActions: Boolean = false,
    val pending: Boolean = false,
    val failed: Boolean = false,
    val createdAt: String? = null
)

data class MentorActionUi(
    val label: String,
    val action: String,
    val destination: MentorActionDestination
)

enum class MentorActionDestination {
    Today,
    Goal,
    Profile,
    History,
    ExploreWeb
}

internal fun mentorActionUi(label: String, action: String): MentorActionUi? {
    val destination = when (action) {
        "go:dashboard", "go:action-plans", "go:path-planning" -> MentorActionDestination.Today
        "go:decision-projects" -> MentorActionDestination.Goal
        "go:profile", "go:resume" -> MentorActionDestination.Profile
        "go:history", "go:career-report" -> MentorActionDestination.History
        "go:explore", "go:jobs" -> MentorActionDestination.ExploreWeb
        else -> return null
    }
    return MentorActionUi(
        label = label.trim().ifEmpty { mentorActionFallbackLabel(destination) },
        action = action,
        destination = destination
    )
}

private fun mentorActionFallbackLabel(destination: MentorActionDestination): String = when (destination) {
    MentorActionDestination.Today -> "查看今日行动"
    MentorActionDestination.Goal -> "查看目标"
    MentorActionDestination.Profile -> "查看个人档案"
    MentorActionDestination.History -> "查看历史记录"
    MentorActionDestination.ExploreWeb -> "浏览职业与岗位"
}

data class MentorSessionUi(
    val id: Long,
    val title: String,
    val preview: String,
    val messageCount: Int,
    val updatedAt: String?
)
