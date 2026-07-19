package com.careerdecision.mobile.notification.reminder

import android.content.Context
import java.time.DayOfWeek
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ReminderPreferences(
    val enabled: Boolean = false,
    val taskLeadMinutes: Int = DEFAULT_TASK_LEAD_MINUTES,
    val dailySummaryHour: Int = DEFAULT_DAILY_SUMMARY_HOUR,
    val weeklyReviewDay: DayOfWeek = DayOfWeek.SUNDAY,
    val weeklyReviewHour: Int = DEFAULT_WEEKLY_REVIEW_HOUR
) {
    fun normalized(): ReminderPreferences = copy(
        taskLeadMinutes = taskLeadMinutes.coerceIn(MIN_TASK_LEAD_MINUTES, MAX_TASK_LEAD_MINUTES),
        dailySummaryHour = dailySummaryHour.coerceIn(0, 23),
        weeklyReviewHour = weeklyReviewHour.coerceIn(0, 23)
    )

    companion object {
        const val DEFAULT_TASK_LEAD_MINUTES = 60
        const val DEFAULT_DAILY_SUMMARY_HOUR = 9
        const val DEFAULT_WEEKLY_REVIEW_HOUR = 20
        const val MIN_TASK_LEAD_MINUTES = 0
        const val MAX_TASK_LEAD_MINUTES = 7 * 24 * 60
    }
}

internal class ReminderPreferencesStore(context: Context) {
    private val sharedPreferences = context.applicationContext.getSharedPreferences(
        FILE_NAME,
        Context.MODE_PRIVATE
    )
    private val mutablePreferences = MutableStateFlow(read())

    val preferences: StateFlow<ReminderPreferences> = mutablePreferences.asStateFlow()

    @Synchronized
    fun update(value: ReminderPreferences): ReminderPreferences {
        val normalized = value.normalized()
        sharedPreferences.edit()
            .putBoolean(KEY_ENABLED, normalized.enabled)
            .putInt(KEY_TASK_LEAD_MINUTES, normalized.taskLeadMinutes)
            .putInt(KEY_DAILY_SUMMARY_HOUR, normalized.dailySummaryHour)
            .putInt(KEY_WEEKLY_REVIEW_DAY, normalized.weeklyReviewDay.value)
            .putInt(KEY_WEEKLY_REVIEW_HOUR, normalized.weeklyReviewHour)
            .apply()
        mutablePreferences.value = normalized
        return normalized
    }

    private fun read(): ReminderPreferences {
        val dayOfWeek = runCatching {
            DayOfWeek.of(sharedPreferences.getInt(KEY_WEEKLY_REVIEW_DAY, DayOfWeek.SUNDAY.value))
        }.getOrDefault(DayOfWeek.SUNDAY)
        return ReminderPreferences(
            enabled = sharedPreferences.getBoolean(KEY_ENABLED, false),
            taskLeadMinutes = sharedPreferences.getInt(
                KEY_TASK_LEAD_MINUTES,
                ReminderPreferences.DEFAULT_TASK_LEAD_MINUTES
            ),
            dailySummaryHour = sharedPreferences.getInt(
                KEY_DAILY_SUMMARY_HOUR,
                ReminderPreferences.DEFAULT_DAILY_SUMMARY_HOUR
            ),
            weeklyReviewDay = dayOfWeek,
            weeklyReviewHour = sharedPreferences.getInt(
                KEY_WEEKLY_REVIEW_HOUR,
                ReminderPreferences.DEFAULT_WEEKLY_REVIEW_HOUR
            )
        ).normalized()
    }

    private companion object {
        const val FILE_NAME = "career_reminder_preferences"
        const val KEY_ENABLED = "enabled"
        const val KEY_TASK_LEAD_MINUTES = "task_lead_minutes"
        const val KEY_DAILY_SUMMARY_HOUR = "daily_summary_hour"
        const val KEY_WEEKLY_REVIEW_DAY = "weekly_review_day"
        const val KEY_WEEKLY_REVIEW_HOUR = "weekly_review_hour"
    }
}
