package com.careerdecision.mobile.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HistoryContentTest {
    @Test
    fun decisionSnapshotExposesDecisionEvidenceAndPlanWithoutChangingArchiveContract() {
        val snapshot = HistoryContentParser.decisionSnapshot(
            """
            {
              "projectVersion": 7,
              "capturedAt": "2026-07-14T08:00:00Z",
              "project": {
                "question": "先验证后端开发还是数据分析？",
                "targets": [
                  {"targetType":"primary","targetName":"后端开发","decisionReason":"已有项目证据"},
                  {"targetType":"backup","targetName":"数据分析"}
                ],
                "candidates": [
                  {"name":"后端开发","recommendationReason":"技能可迁移","uncertainties":"岗位样本较少"}
                ],
                "evidence": [
                  {"title":"完成接口项目","sourceType":"task_result","credibility":"high","stance":"support"}
                ]
              },
              "actionPlan": {
                "durationWeeks": 4,
                "progressPercent": 25,
                "completedTaskCount": 2,
                "taskCount": 8
              }
            }
            """.trimIndent()
        )

        requireNotNull(snapshot)
        assertEquals("先验证后端开发还是数据分析？", snapshot.question)
        assertEquals(7, snapshot.projectVersion)
        assertEquals("后端开发", snapshot.primaryTarget?.name)
        assertEquals("数据分析", snapshot.backupTarget?.name)
        assertEquals("岗位样本较少", snapshot.candidates.single().uncertainties)
        assertEquals("完成接口项目", snapshot.evidence.single().title)
        assertEquals(25, snapshot.actionPlan?.progressPercent)
    }

    @Test
    fun malformedAndLegacyContentsHaveReadableFallbacks() {
        assertNull(HistoryContentParser.decisionSnapshot("not-json"))

        val plain = HistoryContentParser.legacyReport("保留的旧版报告正文")
        assertEquals("保留的旧版报告正文", plain.fallbackText)

        val structured = HistoryContentParser.legacyReport(
            """{"content":{"summary":"旧报告摘要","evidenceHighlights":["完成课程项目"],"risksAndAlternatives":["样本不足"]}}"""
        )
        assertEquals("旧报告摘要", structured.summary)
        assertTrue(structured.evidenceHighlights.contains("完成课程项目"))
        assertTrue(structured.risksAndAlternatives.contains("样本不足"))
    }
}
