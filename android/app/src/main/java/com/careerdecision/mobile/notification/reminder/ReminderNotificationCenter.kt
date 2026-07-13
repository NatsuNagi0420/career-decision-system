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
            notification(content, TASK_CHANNEL_ID, taskNotificationId(userId, taskId))
        )
    }

    @SuppressLint("MissingPermission")
    fun showWeeklyReviewReminder(userId: Long, content: ReminderContent) {
        notificationManager.notify(
            weeklyNotificationId(userId),
            notification(content, REVIEW_CHANNEL_ID, weeklyNotificationId(userId))
        )
    }

    private fun notification(content: ReminderContent, channelId: String, requestCode: Int): Notification =
        Notification.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setStyle(Notification.BigTextStyle().bigText(content.body))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(todayPendingIntent(requestCode))
            .build()

    private fun todayPendingIntent(requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_DESTINATION, DESTINATION_TODAY)
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

    private fun weeklyNotificationId(userId: Long): Int = positiveHash("weekly:$userId")

    private fun positiveHash(value: String): Int = value.hashCode() and Int.MAX_VALUE

    companion object {
        const val TASK_CHANNEL_ID = "career_task_reminders_v1"
        const val REVIEW_CHANNEL_ID = "career_weekly_review_reminders_v1"
        const val EXTRA_DESTINATION = "notification_destination"
        const val DESTINATION_TODAY = "today"
    }
}
