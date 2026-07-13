package com.careerdecision.mobile.notification.reminder

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.careerdecision.mobile.data.local.CachedTaskEntity
import java.time.Clock
import java.time.DayOfWeek
import java.time.Duration
import java.time.ZoneId
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.StateFlow

interface ReminderGateway {
    val preferences: StateFlow<ReminderPreferences>

    fun initializeChannels()
    fun permissionStatus(): NotificationPermissionStatus
    fun reconcileTaskReminders(userId: Long, tasks: List<CachedTaskEntity>)
    fun scheduleWeeklyReview(userId: Long)
    fun cancelWeeklyReview(userId: Long)
    fun updatePreferences(preferences: ReminderPreferences)
    fun updateEnabled(enabled: Boolean)
    fun updateTaskLeadMinutes(minutes: Int)
    fun updateWeeklyReviewSchedule(dayOfWeek: DayOfWeek, hour: Int)
    fun cancelAll(userId: Long)
}

class WorkManagerReminderGateway(
    context: Context,
    private val clock: Clock = Clock.systemDefaultZone(),
    private val zoneId: ZoneId = ZoneId.systemDefault()
) : ReminderGateway {
    private val applicationContext = context.applicationContext
    private val workManager = WorkManager.getInstance(applicationContext)
    private val notificationCenter = ReminderNotificationCenter(applicationContext)
    private val preferenceStore = ReminderPreferencesStore(applicationContext)
    private val scheduleState = applicationContext.getSharedPreferences(
        SCHEDULE_STATE_FILE,
        Context.MODE_PRIVATE
    )
    private val taskSnapshots = ConcurrentHashMap<Long, List<CachedTaskEntity>>()

    override val preferences: StateFlow<ReminderPreferences> = preferenceStore.preferences

    override fun initializeChannels() = notificationCenter.ensureChannels()

    override fun permissionStatus(): NotificationPermissionStatus =
        ReminderPermission.status(applicationContext)

    override fun reconcileTaskReminders(userId: Long, tasks: List<CachedTaskEntity>) {
        val userTasks = tasks.filter { it.userId == userId }
        taskSnapshots[userId] = userTasks
        val currentPreferences = preferences.value
        val now = clock.instant()
        val schedules = if (currentPreferences.enabled) {
            userTasks.mapNotNull { task ->
                ReminderPolicy.taskSchedule(
                    task = task.toReminderTask(),
                    now = now,
                    zoneId = zoneId,
                    leadMinutes = currentPreferences.taskLeadMinutes
                )
            }
        } else {
            emptyList()
        }
        val scheduledIds = schedules.mapTo(mutableSetOf()) { it.task.taskId.toString() }
        val previousIds = scheduledTaskIds(userId)
        (previousIds - scheduledIds).mapNotNull(String::toLongOrNull).forEach { taskId ->
            workManager.cancelUniqueWork(taskWorkName(userId, taskId))
        }
        schedules.forEach { enqueueTaskReminder(it, currentPreferences.taskLeadMinutes) }
        saveScheduledTaskIds(userId, scheduledIds)
    }

    override fun scheduleWeeklyReview(userId: Long) {
        saveWeeklyUsers(weeklyUsers() + userId.toString())
        if (!preferences.value.enabled) {
            workManager.cancelUniqueWork(weeklyWorkName(userId))
            return
        }
        enqueueWeeklyReview(userId, preferences.value)
    }

    override fun cancelWeeklyReview(userId: Long) {
        workManager.cancelUniqueWork(weeklyWorkName(userId))
        saveWeeklyUsers(weeklyUsers() - userId.toString())
    }

    override fun updatePreferences(preferences: ReminderPreferences) {
        val updated = preferenceStore.update(preferences)
        val taskEntries = taskSnapshots.entries.map { it.key to it.value }
        if (updated.enabled) {
            taskEntries.forEach { (userId, tasks) -> reconcileTaskReminders(userId, tasks) }
            weeklyUsers().mapNotNull(String::toLongOrNull).forEach { enqueueWeeklyReview(it, updated) }
        } else {
            taskEntries.forEach { (userId, _) -> cancelScheduledTasks(userId) }
            weeklyUsers().mapNotNull(String::toLongOrNull).forEach {
                workManager.cancelUniqueWork(weeklyWorkName(it))
            }
        }
    }

    override fun updateEnabled(enabled: Boolean) {
        updatePreferences(preferences.value.copy(enabled = enabled))
    }

    override fun updateTaskLeadMinutes(minutes: Int) {
        updatePreferences(preferences.value.copy(taskLeadMinutes = minutes))
    }

    override fun updateWeeklyReviewSchedule(dayOfWeek: DayOfWeek, hour: Int) {
        updatePreferences(
            preferences.value.copy(
                weeklyReviewDay = dayOfWeek,
                weeklyReviewHour = hour
            )
        )
    }

    override fun cancelAll(userId: Long) {
        taskSnapshots.remove(userId)
        cancelScheduledTasks(userId)
        cancelWeeklyReview(userId)
    }

    private fun enqueueTaskReminder(schedule: ScheduledTaskReminder, leadMinutes: Int) {
        val delay = Duration.between(clock.instant(), schedule.notifyAt).toMillis().coerceAtLeast(0)
        val request = OneTimeWorkRequestBuilder<TaskReminderWorker>()
            .setInputData(
                Data.Builder()
                    .putLong(ReminderWorkData.USER_ID, schedule.task.userId)
                    .putLong(ReminderWorkData.TASK_ID, schedule.task.taskId)
                    .putLong(ReminderWorkData.DUE_AT_MILLIS, schedule.dueAt.toEpochMilli())
                    .putInt(ReminderWorkData.LEAD_MINUTES, leadMinutes)
                    .build()
            )
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(taskWorkTag(schedule.task.userId))
            .build()
        workManager.enqueueUniqueWork(
            taskWorkName(schedule.task.userId, schedule.task.taskId),
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    @Suppress("DEPRECATION")
    private fun enqueueWeeklyReview(userId: Long, currentPreferences: ReminderPreferences) {
        val now = clock.instant().atZone(zoneId)
        val nextReviewAt = ReminderPolicy.nextWeeklyReviewAt(
            now,
            currentPreferences.weeklyReviewDay,
            currentPreferences.weeklyReviewHour
        )
        val delay = Duration.between(now, nextReviewAt).toMillis().coerceAtLeast(0)
        val request = PeriodicWorkRequestBuilder<WeeklyReviewReminderWorker>(7, TimeUnit.DAYS)
            .setInputData(Data.Builder().putLong(ReminderWorkData.USER_ID, userId).build())
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(weeklyWorkTag(userId))
            .build()
        workManager.enqueueUniquePeriodicWork(
            weeklyWorkName(userId),
            ExistingPeriodicWorkPolicy.REPLACE,
            request
        )
    }

    private fun cancelScheduledTasks(userId: Long) {
        scheduledTaskIds(userId).mapNotNull(String::toLongOrNull).forEach { taskId ->
            workManager.cancelUniqueWork(taskWorkName(userId, taskId))
        }
        saveScheduledTaskIds(userId, emptySet())
    }

    private fun scheduledTaskIds(userId: Long): Set<String> =
        scheduleState.getStringSet(taskIdsKey(userId), emptySet()).orEmpty().toSet()

    private fun saveScheduledTaskIds(userId: Long, taskIds: Set<String>) {
        scheduleState.edit().putStringSet(taskIdsKey(userId), taskIds).apply()
    }

    private fun weeklyUsers(): Set<String> =
        scheduleState.getStringSet(KEY_WEEKLY_USERS, emptySet()).orEmpty().toSet()

    private fun saveWeeklyUsers(userIds: Set<String>) {
        scheduleState.edit().putStringSet(KEY_WEEKLY_USERS, userIds).apply()
    }

    private fun CachedTaskEntity.toReminderTask() = ReminderTask(
        taskId = taskId,
        userId = userId,
        title = title,
        status = status,
        dueAt = dueAt,
        deferredTo = deferredTo
    )

    private companion object {
        const val SCHEDULE_STATE_FILE = "career_reminder_schedule"
        const val KEY_WEEKLY_USERS = "weekly_users"

        fun taskIdsKey(userId: Long) = "task_ids_$userId"
        fun taskWorkName(userId: Long, taskId: Long) = "career-task-reminder-$userId-$taskId"
        fun taskWorkTag(userId: Long) = "career-task-reminders-$userId"
        fun weeklyWorkName(userId: Long) = "career-weekly-review-$userId"
        fun weeklyWorkTag(userId: Long) = "career-weekly-review-$userId"
    }
}

internal object ReminderWorkData {
    const val USER_ID = "user_id"
    const val TASK_ID = "task_id"
    const val DUE_AT_MILLIS = "due_at_millis"
    const val LEAD_MINUTES = "lead_minutes"
}
