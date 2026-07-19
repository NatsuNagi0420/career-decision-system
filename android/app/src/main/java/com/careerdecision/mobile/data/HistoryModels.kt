package com.careerdecision.mobile.data

import com.careerdecision.mobile.network.ArchivedPathPlan
import com.careerdecision.mobile.network.ArchivedResumeAnalysis
import com.careerdecision.mobile.network.PathPlanSnapshot
import com.careerdecision.mobile.network.ReportSnapshot
import com.careerdecision.mobile.network.ResumeAnalysisSnapshot

enum class HistoryResourceType {
    REPORT,
    RESUME_ANALYSIS,
    LEGACY_PATH_PLAN
}

enum class HistoryFilter {
    ALL,
    DECISION_SNAPSHOT,
    LEGACY_REPORT,
    RESUME_ANALYSIS,
    LEGACY_PATH_PLAN
}

data class HistoryItem(
    val key: String,
    val resourceType: HistoryResourceType,
    val id: String,
    val title: String,
    val typeLabel: String,
    val summary: String,
    val createdAt: String?,
    val reportType: String? = null
) {
    fun matches(filter: HistoryFilter): Boolean = when (filter) {
        HistoryFilter.ALL -> true
        HistoryFilter.DECISION_SNAPSHOT -> reportType == DECISION_SNAPSHOT_TYPE
        HistoryFilter.LEGACY_REPORT ->
            resourceType == HistoryResourceType.REPORT && reportType != DECISION_SNAPSHOT_TYPE
        HistoryFilter.RESUME_ANALYSIS -> resourceType == HistoryResourceType.RESUME_ANALYSIS
        HistoryFilter.LEGACY_PATH_PLAN -> resourceType == HistoryResourceType.LEGACY_PATH_PLAN
    }

    fun deletionImpact(): String = when (resourceType) {
        HistoryResourceType.REPORT -> "此操作只删除历史记录，不影响当前决策项目和行动计划。"
        HistoryResourceType.RESUME_ANALYSIS -> "该分析结果会被删除，个人档案不会受影响。"
        HistoryResourceType.LEGACY_PATH_PLAN -> "旧路径计划会从历史中移除，当前行动计划不会受影响。"
    }

    companion object {
        const val DECISION_SNAPSHOT_TYPE = "decision_snapshot"
    }
}

sealed interface HistoryDetail {
    val item: HistoryItem

    data class Report(
        override val item: HistoryItem,
        val report: ReportSnapshot
    ) : HistoryDetail

    data class ResumeAnalysis(
        override val item: HistoryItem,
        val analysis: ArchivedResumeAnalysis
    ) : HistoryDetail

    data class LegacyPathPlan(
        override val item: HistoryItem,
        val pathPlan: ArchivedPathPlan
    ) : HistoryDetail
}

internal fun ReportSnapshot.toHistoryItem(): HistoryItem = HistoryItem(
    key = "report-$id",
    resourceType = HistoryResourceType.REPORT,
    id = id,
    title = title,
    typeLabel = if (type == HistoryItem.DECISION_SNAPSHOT_TYPE) {
        "决策快照 v${snapshotVersion ?: 1}"
    } else {
        "旧版职业报告"
    },
    summary = summary,
    createdAt = createdAt,
    reportType = type
)

internal fun ResumeAnalysisSnapshot.toHistoryItem(): HistoryItem = HistoryItem(
    key = "resume-$id",
    resourceType = HistoryResourceType.RESUME_ANALYSIS,
    id = id.toString(),
    title = targetRole?.takeIf(String::isNotBlank)?.let { "${it}简历分析" } ?: "简历分析",
    typeLabel = "简历分析",
    summary = "综合评分 ${score ?: "未评分"}，发现 $issueCount 个问题。",
    createdAt = createdAt
)

internal fun PathPlanSnapshot.toHistoryItem(): HistoryItem = HistoryItem(
    key = "path-$id",
    resourceType = HistoryResourceType.LEGACY_PATH_PLAN,
    id = id.toString(),
    title = targetRole.takeIf(String::isNotBlank)?.let { "${it}路径计划" } ?: "旧版路径计划",
    typeLabel = "旧版路径计划",
    summary = overview?.takeIf(String::isNotBlank) ?: "$milestoneCount 个阶段，$taskCount 项任务。",
    createdAt = createdAt
)
