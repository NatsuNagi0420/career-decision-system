package com.careerdecision.mobile.notification.reminder

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderPolicyTest {
    private val shanghai = ZoneId.of("Asia/Shanghai")

    @Test
    fun remindersRequireExplicitOptIn() {
        assertFalse(ReminderPreferences().enabled)
    }

    @Test
    fun schedulesTaskBeforeLocalDueTime() {
        val schedule = ReminderPolicy.taskSchedule(
            task = task(dueAt = "2026-07-12T20:00:00"),
            now = Instant.parse("2026-07-12T10:00:00Z"),
            zoneId = shanghai,
            leadMinutes = 60
        )

        requireNotNull(schedule)
        assertEquals(Instant.parse("2026-07-12T12:00:00Z"), schedule.dueAt)
        assertEquals(Instant.parse("2026-07-12T11:00:00Z"), schedule.notifyAt)
    }

    @Test
    fun schedulesImmediatelyWhenTaskIsAlreadyInsideLeadWindow() {
        val now = Instant.parse("2026-07-12T11:30:00Z")
        val schedule = ReminderPolicy.taskSchedule(
            task = task(dueAt = "2026-07-12T20:00:00"),
            now = now,
            zoneId = shanghai,
            leadMinutes = 60
        )

        assertEquals(now, requireNotNull(schedule).notifyAt)
    }

    @Test
    fun deferredTaskUsesDeferredTime() {
        val schedule = ReminderPolicy.taskSchedule(
            task = task(
                status = "deferred",
                dueAt = "2026-07-12T20:00:00",
                deferredTo = "2026-07-13T20:00:00"
            ),
            now = Instant.parse("2026-07-12T10:00:00Z"),
            zoneId = shanghai,
            leadMinutes = 30
        )

        assertEquals(Instant.parse("2026-07-13T12:00:00Z"), requireNotNull(schedule).dueAt)
        assertEquals(Instant.parse("2026-07-13T11:30:00Z"), schedule.notifyAt)
    }

    @Test
    fun ignoresFinishedPastAndInvalidTasks() {
        val now = Instant.parse("2026-07-12T13:00:00Z")

        assertNull(ReminderPolicy.taskSchedule(task(status = "completed"), now, shanghai, 60))
        assertNull(ReminderPolicy.taskSchedule(task(dueAt = "2026-07-12T20:00:00"), now, shanghai, 60))
        assertNull(ReminderPolicy.taskSchedule(task(dueAt = "not-a-time"), now, shanghai, 60))
    }

    @Test
    fun parsesOffsetAndUtcTimestampsWithoutApplyingDeviceZoneTwice() {
        assertEquals(
            Instant.parse("2026-07-12T12:00:00Z"),
            ReminderPolicy.parseInstant("2026-07-12T20:00:00+08:00", ZoneId.of("Europe/London"))
        )
        assertEquals(
            Instant.parse("2026-07-12T12:00:00Z"),
            ReminderPolicy.parseInstant("2026-07-12T12:00:00Z", shanghai)
        )
    }

    @Test
    fun weeklyReviewUsesNextConfiguredLocalSlot() {
        val beforeSlot = ZonedDateTime.parse("2026-07-12T19:00:00+08:00[Asia/Shanghai]")
        val atSlot = ZonedDateTime.parse("2026-07-12T20:00:00+08:00[Asia/Shanghai]")

        assertEquals(
            ZonedDateTime.parse("2026-07-12T20:00:00+08:00[Asia/Shanghai]"),
            ReminderPolicy.nextWeeklyReviewAt(beforeSlot, DayOfWeek.SUNDAY, 20)
        )
        assertEquals(
            ZonedDateTime.parse("2026-07-19T20:00:00+08:00[Asia/Shanghai]"),
            ReminderPolicy.nextWeeklyReviewAt(atSlot, DayOfWeek.SUNDAY, 20)
        )
    }

    @Test
    fun dailySummaryUsesNextLocalSlotAndCombinesActionableTasks() {
        val beforeSlot = ZonedDateTime.parse("2026-07-12T08:30:00+08:00[Asia/Shanghai]")
        val atSlot = ZonedDateTime.parse("2026-07-12T09:00:00+08:00[Asia/Shanghai]")

        assertEquals(
            ZonedDateTime.parse("2026-07-12T09:00:00+08:00[Asia/Shanghai]"),
            ReminderPolicy.nextDailySummaryAt(beforeSlot, 9)
        )
        assertEquals(
            ZonedDateTime.parse("2026-07-13T09:00:00+08:00[Asia/Shanghai]"),
            ReminderPolicy.nextDailySummaryAt(atSlot, 9)
        )

        val content = requireNotNull(
            ReminderPolicy.dailySummaryContent(
                listOf(
                    task().copy(title = "整理岗位样本"),
                    task().copy(taskId = 602, title = "补充项目证据", status = "in_progress"),
                    task().copy(taskId = 603, title = "已完成事项", status = "completed")
                )
            )
        )
        assertEquals("今天有 2 项行动待推进", content.title)
        assertTrue(content.body.contains("整理岗位样本、补充项目证据"))
    }

    @Test
    fun taskCopyStatesDeadlineAndKeepsLateDeliveryBounded() {
        val dueAt = Instant.parse("2026-07-12T12:00:00Z")
        val content = ReminderPolicy.taskContent(
            "整理岗位样本",
            dueAt,
            Instant.parse("2026-07-12T11:50:00Z"),
            shanghai
        )

        assertEquals("任务即将截止", content.title)
        assertEquals("整理岗位样本 · 7月12日 20:00 截止", content.body)
        assertTrue(ReminderPolicy.isDeliveryRelevant(Instant.parse("2026-07-12T14:00:00Z"), dueAt))
        assertFalse(ReminderPolicy.isDeliveryRelevant(Instant.parse("2026-07-12T14:00:01Z"), dueAt))
    }

    private fun task(
        status: String = "todo",
        dueAt: String? = "2026-07-13T20:00:00",
        deferredTo: String? = null
    ) = ReminderTask(
        taskId = 601,
        userId = 7,
        title = "整理岗位样本",
        status = status,
        dueAt = dueAt,
        deferredTo = deferredTo
    )
}
