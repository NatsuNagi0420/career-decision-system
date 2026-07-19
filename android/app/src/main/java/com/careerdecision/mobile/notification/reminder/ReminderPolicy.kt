package com.careerdecision.mobile.notification.reminder

import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

data class ReminderTask(
    val taskId: Long,
    val userId: Long,
    val title: String,
    val status: String,
    val dueAt: String?,
    val deferredTo: String? = null
)

data class ScheduledTaskReminder(
    val task: ReminderTask,
    val dueAt: Instant,
    val notifyAt: Instant
)

data class ReminderContent(
    val title: String,
    val body: String
)

object ReminderPolicy {
    private val actionableStatuses = setOf("todo", "in_progress", "deferred")
    private val dueTimeFormatter = DateTimeFormatter.ofPattern("M月d日 HH:mm")
    private val deliveryGrace = Duration.ofHours(2)

    fun taskSchedule(
        task: ReminderTask,
        now: Instant,
        zoneId: ZoneId,
        leadMinutes: Int
    ): ScheduledTaskReminder? {
        if (!isActionable(task)) return null
        val dueAt = effectiveDueInstant(task, zoneId) ?: return null
        if (!dueAt.isAfter(now)) return null
        val notifyAt = dueAt.minus(Duration.ofMinutes(leadMinutes.coerceAtLeast(0).toLong()))
            .takeIf { it.isAfter(now) }
            ?: now
        return ScheduledTaskReminder(task, dueAt, notifyAt)
    }

    fun isActionable(task: ReminderTask): Boolean =
        task.status.trim().lowercase() in actionableStatuses

    fun effectiveDueInstant(task: ReminderTask, zoneId: ZoneId): Instant? {
        val preferredValue = if (task.status.equals("deferred", ignoreCase = true)) {
            task.deferredTo
        } else {
            task.dueAt
        }
        return parseInstant(preferredValue, zoneId)
            ?: parseInstant(task.dueAt, zoneId)
    }

    fun parseInstant(value: String?, zoneId: ZoneId): Instant? {
        val cleanValue = value?.trim().orEmpty()
        if (cleanValue.isEmpty()) return null
        return runCatching { Instant.parse(cleanValue) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(cleanValue).toInstant() }.getOrNull()
            ?: runCatching { LocalDateTime.parse(cleanValue).atZone(zoneId).toInstant() }.getOrNull()
    }

    fun isDeliveryRelevant(now: Instant, dueAt: Instant): Boolean =
        !now.isAfter(dueAt.plus(deliveryGrace))

    fun nextWeeklyReviewAt(
        now: ZonedDateTime,
        dayOfWeek: DayOfWeek,
        hour: Int
    ): ZonedDateTime {
        var candidate = now
            .with(TemporalAdjusters.nextOrSame(dayOfWeek))
            .with(LocalTime.of(hour.coerceIn(0, 23), 0))
        if (!candidate.isAfter(now)) candidate = candidate.plusWeeks(1)
        return candidate
    }

    fun nextDailySummaryAt(now: ZonedDateTime, hour: Int): ZonedDateTime {
        var candidate = now.with(LocalTime.of(hour.coerceIn(0, 23), 0))
        if (!candidate.isAfter(now)) candidate = candidate.plusDays(1)
        return candidate
    }

    fun dailySummaryContent(tasks: List<ReminderTask>): ReminderContent? {
        val actionable = tasks.filter(::isActionable)
        if (actionable.isEmpty()) return null
        val preview = actionable.take(3).joinToString("、") { task ->
            task.title.trim().ifEmpty { "未命名任务" }
        }
        val remaining = actionable.size - 3
        val suffix = if (remaining > 0) "，另有 $remaining 项" else ""
        return ReminderContent(
            title = "今天有 ${actionable.size} 项行动待推进",
            body = "$preview$suffix。先完成最重要的一项。"
        )
    }

    fun taskContent(taskTitle: String, dueAt: Instant, now: Instant, zoneId: ZoneId): ReminderContent {
        val remaining = Duration.between(now, dueAt)
        val notificationTitle = when {
            remaining.isNegative || remaining.isZero -> "任务已到截止时间"
            remaining <= Duration.ofMinutes(15) -> "任务即将截止"
            remaining <= Duration.ofHours(1) -> "任务将在 1 小时内截止"
            else -> "任务截止时间临近"
        }
        val safeTaskTitle = taskTitle.trim().ifEmpty { "未命名任务" }
        val formattedDueAt = dueAt.atZone(zoneId).format(dueTimeFormatter)
        return ReminderContent(notificationTitle, "$safeTaskTitle · $formattedDueAt 截止")
    }

    val weeklyReviewContent = ReminderContent(
        title = "本周复盘待完成",
        body = "记录本周成果、阻碍与下一步，让行动计划继续推进。"
    )
}
