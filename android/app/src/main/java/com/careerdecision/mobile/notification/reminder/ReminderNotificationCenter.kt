package com.careerdecision.mobile.notification.reminder

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.careerdecision.mobile.MainActivity
import com.careerdecision.mobile.R

internal class ReminderNotificationCenter(private val context: Context) {
    private val notificationManager = context.getSystemService(NotificationManager::class.java)

    fun ensureChannels() {
        val taskChannel = NotificationChannel(
            TASK_CHANNEL_ID,
            "任务提醒",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "行动任务截止前的提醒"
            setShowBadge(true)
        }
        val reviewChannel = NotificationChannel(
            REVIEW_CHANNEL_ID,
            "周复盘提醒",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "每周行动复盘提醒"
            setShowBadge(true)
        }
        notificationManager.createNotificationChannels(listOf(taskChannel, reviewChannel))
    }

    @SuppressLint("MissingPermission")
    fun showTaskReminder(userId: Long, taskId: Long, content: ReminderContent) {
        notificationManager.notify(
            taskNotificationId(userId, taskId),
            notification(
                content = content,
                channelId = TASK_CHANNEL_ID,
                requestCode = taskNotificationId(userId, taskId),
                destination = "$DESTINATION_TODAY?taskId=$taskId",
                groupKey = TASK_GROUP_KEY
            )
        )
    }

    @SuppressLint("MissingPermission")
    fun showDailySummary(userId: Long, content: ReminderContent) {
        notificationManager.notify(
            dailyNotificationId(userId),
            notification(
                content = content,
                channelId = TASK_CHANNEL_ID,
                requestCode = dailyNotificationId(userId),
                destination = DESTINATION_TODAY,
                groupKey = TASK_GROUP_KEY,
                groupSummary = true
            )
        )
    }

    fun cancelTaskReminder(userId: Long, taskId: Long) {
        notificationManager.cancel(taskNotificationId(userId, taskId))
    }

    fun cancelDailySummary(userId: Long) {
        notificationManager.cancel(dailyNotificationId(userId))
    }

    @SuppressLint("MissingPermission")
    fun showWeeklyReviewReminder(userId: Long, content: ReminderContent) {
        notificationManager.notify(
            weeklyNotificationId(userId),
            notification(
                content = content,
                channelId = REVIEW_CHANNEL_ID,
                requestCode = weeklyNotificationId(userId),
                destination = "$DESTINATION_TODAY?review=true"
            )
        )
    }

    fun cancelWeeklyReviewReminder(userId: Long) {
        notificationManager.cancel(weeklyNotificationId(userId))
    }

    private fun notification(
        content: ReminderContent,
        channelId: String,
        requestCode: Int,
        destination: String,
        groupKey: String? = null,
        groupSummary: Boolean = false
    ): Notification = Notification.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setStyle(Notification.BigTextStyle().bigText(content.body))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(destinationPendingIntent(requestCode, destination))
            .apply {
                if (groupKey != null) {
                    setGroup(groupKey)
                    setGroupSummary(groupSummary)
                }
            }
            .build()

    private fun destinationPendingIntent(requestCode: Int, destination: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_DESTINATION, destination)
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun taskNotificationId(userId: Long, taskId: Long): Int =
        positiveHash("task:$userId:$taskId")

    private fun dailyNotificationId(userId: Long): Int = positiveHash("daily:$userId")

    private fun weeklyNotificationId(userId: Long): Int = positiveHash("weekly:$userId")

    private fun positiveHash(value: String): Int = value.hashCode() and Int.MAX_VALUE

    companion object {
        const val TASK_CHANNEL_ID = "career_task_reminders_v1"
        const val REVIEW_CHANNEL_ID = "career_weekly_review_reminders_v1"
        const val EXTRA_DESTINATION = "notification_destination"
        const val DESTINATION_TODAY = "today"
        private const val TASK_GROUP_KEY = "career_task_reminders"
    }
}
