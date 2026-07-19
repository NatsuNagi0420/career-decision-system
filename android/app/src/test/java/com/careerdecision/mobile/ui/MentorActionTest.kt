package com.careerdecision.mobile.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MentorActionTest {
    @Test
    fun mapsAllowlistedActionsAndSuppliesAccessibleFallbackLabels() {
        assertEquals(
            MentorActionDestination.Today,
            mentorActionUi("查看计划", "go:action-plans")?.destination
        )
        assertEquals(
            "查看目标",
            mentorActionUi("", "go:decision-projects")?.label
        )
        assertEquals(
            MentorActionDestination.ExploreWeb,
            mentorActionUi("浏览岗位", "go:explore")?.destination
        )
    }

    @Test
    fun ignoresUnknownServerActions() {
        assertNull(mentorActionUi("执行未知操作", "write:unknown"))
    }
}
