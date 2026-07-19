package com.careerdecision.mobile.notification.reminder

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.careerdecision.mobile.CareerApplication
import com.careerdecision.mobile.data.local.ActionDatabase
import java.time.Instant
import java.time.ZoneId
import kotlin.coroutines.cancellation.CancellationException

class TaskReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val userId = inputData.getLong(ReminderWorkData.USER_ID, INVALID_ID)
        val taskId = inputData.getLong(ReminderWorkData.TASK_ID, INVALID_ID)
        val expectedDueAtMillis = inputData.getLong(ReminderWorkData.DUE_AT_MILLIS, INVALID_ID)
        val expectedLeadMinutes = inputData.getInt(ReminderWorkData.LEAD_MINUTES, -1)
        if (userId == INVALID_ID || taskId == INVALID_ID || expectedDueAtMillis == INVALID_ID) {
            return Result.failure()
        }
        val app = applicationContext as? CareerApplication ?: return Result.failure()
        if (app.repository.currentSession()?.user?.id != userId) return Result.success()
        val currentPreferences = app.reminderGateway.preferences.value
        if (!currentPreferences.enabled || currentPreferences.taskLeadMinutes != expectedLeadMinutes) {
            return Result.success()
        }
        if (app.reminderGateway.permissionStatus() != NotificationPermissionStatus.GRANTED) {
            return Result.success()
        }

        return try {
            val task = ActionDatabase.get(applicationContext)
                .actionDao()
                .tasks(userId)
                .firstOrNull { it.taskId == taskId }
                ?: return Result.success()
            val reminderTask = ReminderTask(
                taskId = task.taskId,
                userId = task.userId,
                title = task.title,
                status = task.status,
                dueAt = task.dueAt,
                deferredTo = task.deferredTo
            )
            if (!ReminderPolicy.isActionable(reminderTask)) return Result.success()
            val zoneId = ZoneId.systemDefault()
            val dueAt = ReminderPolicy.effectiveDueInstant(reminderTask, zoneId)
                ?: return Result.success()
            if (dueAt.toEpochMilli() != expectedDueAtMillis) return Result.success()
            val now = Instant.now()
            if (!ReminderPolicy.isDeliveryRelevant(now, dueAt)) return Result.success()
            ReminderNotificationCenter(applicationContext).showTaskReminder(
                userId,
                taskId,
                ReminderPolicy.taskContent(task.title, dueAt, now, zoneId)
            )
            Result.success()
        } catch (error: SecurityException) {
            Result.success()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.retry()
        }
    }

    private companion object {
        const val INVALID_ID = -1L
    }
}

class WeeklyReviewReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val userId = inputData.getLong(ReminderWorkData.USER_ID, INVALID_ID)
        if (userId == INVALID_ID) return Result.failure()
        val app = applicationContext as? CareerApplication ?: return Result.failure()
        if (app.repository.currentSession()?.user?.id != userId) return Result.success()
        if (!app.reminderGateway.preferences.value.enabled) return Result.success()
        if (app.reminderGateway.permissionStatus() != NotificationPermissionStatus.GRANTED) {
            return Result.success()
        }
        return try {
            val goal = ActionDatabase.get(applicationContext).actionDao().goal(userId)
            if (goal?.planId == null || goal.status != "active") return Result.success()
            ReminderNotificationCenter(applicationContext).showWeeklyReviewReminder(
                userId,
                ReminderPolicy.weeklyReviewContent
            )
            Result.success()
        } catch (error: SecurityException) {
            Result.success()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.retry()
        }
    }

    private companion object {
        const val INVALID_ID = -1L
    }
}

class DailyTaskSummaryWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val userId = inputData.getLong(ReminderWorkData.USER_ID, INVALID_ID)
        val expectedHour = inputData.getInt(ReminderWorkData.DAILY_SUMMARY_HOUR, -1)
        if (userId == INVALID_ID || expectedHour !in 0..23) return Result.failure()
        val app = applicationContext as? CareerApplication ?: return Result.failure()
        if (app.repository.currentSession()?.user?.id != userId) return Result.success()
        val preferences = app.reminderGateway.preferences.value
        if (!preferences.enabled || preferences.dailySummaryHour != expectedHour) return Result.success()
        if (app.reminderGateway.permissionStatus() != NotificationPermissionStatus.GRANTED) {
            return Result.success()
        }
        return try {
            val tasks = ActionDatabase.get(applicationContext).actionDao().tasks(userId).map { task ->
                ReminderTask(
                    taskId = task.taskId,
                    userId = task.userId,
                    title = task.title,
                    status = task.status,
                    dueAt = task.dueAt,
                    deferredTo = task.deferredTo
                )
            }
            val content = ReminderPolicy.dailySummaryContent(tasks) ?: return Result.success()
            ReminderNotificationCenter(applicationContext).showDailySummary(userId, content)
            Result.success()
        } catch (error: SecurityException) {
            Result.success()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.retry()
        }
    }

    private companion object {
        const val INVALID_ID = -1L
    }
}

class ReminderRescheduleWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? CareerApplication ?: return Result.failure()
        val userId = app.repository.currentSession()?.user?.id ?: return Result.success()
        return try {
            val dao = ActionDatabase.get(applicationContext).actionDao()
            val tasks = dao.tasks(userId)
            val goal = dao.goal(userId)
            app.reminderGateway.rescheduleAll(
                userId = userId,
                tasks = tasks,
                hasActivePlan = goal?.planId != null && goal.status == "active"
            )
            Result.success()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.retry()
        }
    }
}
