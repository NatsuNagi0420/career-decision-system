package com.careerdecision.mobile.notification.reminder

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

enum class NotificationPermissionStatus {
    GRANTED,
    REQUEST_REQUIRED,
    DISABLED
}

object ReminderPermission {
    fun status(context: Context): NotificationPermissionStatus {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return NotificationPermissionStatus.REQUEST_REQUIRED
        }
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        return if (notificationManager.areNotificationsEnabled()) {
            NotificationPermissionStatus.GRANTED
        } else {
            NotificationPermissionStatus.DISABLED
        }
    }

    fun openSettings(context: Context) {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

}
