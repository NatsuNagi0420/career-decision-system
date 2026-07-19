package com.careerdecision.mobile.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GoalPresentationTest {
    @Test
    fun splitsRiskTextIntoStableGapItems() {
        assertEquals(
            listOf("缺少真实项目", "岗位样本不足", "英文表达待验证"),
            goalGapItems("• 缺少真实项目；岗位样本不足\n- 英文表达待验证")
        )
        assertTrue(goalGapItems(null).isEmpty())
    }
}
