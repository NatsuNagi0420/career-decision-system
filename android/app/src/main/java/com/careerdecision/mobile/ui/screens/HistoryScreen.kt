package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.careerdecision.mobile.data.HistoryDetail
import com.careerdecision.mobile.data.HistoryFilter
import com.careerdecision.mobile.data.HistoryItem
import com.careerdecision.mobile.network.ArchivedPathMilestone
import com.careerdecision.mobile.network.ArchivedResumeAnalysis
import com.careerdecision.mobile.network.ReportSnapshot
import com.careerdecision.mobile.ui.AppUiState
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSize
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3Card
import com.careerdecision.mobile.ui.design.M3ChoiceChip
import com.careerdecision.mobile.ui.design.M3CircularProgress
import com.careerdecision.mobile.ui.design.M3Dialog
import com.careerdecision.mobile.ui.design.M3Divider
import com.careerdecision.mobile.ui.design.M3EmptyState
import com.careerdecision.mobile.ui.design.M3IconButton
import com.careerdecision.mobile.ui.design.M3StatusBanner
import com.careerdecision.mobile.ui.format.CareerDateTime

private data class HistoryFilterOption(
    val filter: HistoryFilter,
    val label: String
)

private val historyFilterOptions = listOf(
    HistoryFilterOption(HistoryFilter.ALL, "全部"),
    HistoryFilterOption(HistoryFilter.DECISION_SNAPSHOT, "决策快照"),
    HistoryFilterOption(HistoryFilter.LEGACY_REPORT, "旧报告"),
    HistoryFilterOption(HistoryFilter.RESUME_ANALYSIS, "简历分析"),
    HistoryFilterOption(HistoryFilter.LEGACY_PATH_PLAN, "旧路径")
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HistoryListScreen(
    state: AppUiState,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenItem: (HistoryItem) -> Unit
) {
    var filterName by rememberSaveable { mutableStateOf(HistoryFilter.ALL.name) }
    val filter = runCatching { HistoryFilter.valueOf(filterName) }.getOrDefault(HistoryFilter.ALL)
    val filteredItems = state.historyItems.filter { it.matches(filter) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            horizontal = CareerSpacing.PageHorizontal,
            vertical = CareerSpacing.PageVertical
        ),
        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Large)
    ) {
        item {
            HistoryTopBar(
                title = "历史记录",
                supportingText = "决策快照、旧报告、简历分析与旧路径",
                onBack = onBack,
                action = {
                    M3IconButton(
                        icon = CareerIcons.Refresh,
                        label = "刷新历史记录",
                        onClick = onRefresh,
                        enabled = !state.historyLoading
                    )
                }
            )
        }

        if (!state.online && state.historyItems.isNotEmpty()) {
            item {
                M3StatusBanner(
                    text = "当前离线，正在显示最近缓存的历史记录。",
                    icon = CareerIcons.WifiOff
                )
            }
        }

        if (state.historyItems.isNotEmpty()) {
            item {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                    verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                ) {
                    historyFilterOptions.forEach { option ->
                        val count = state.historyItems.count { it.matches(option.filter) }
                        M3ChoiceChip(
                            label = "${option.label} $count",
                            selected = filter == option.filter,
                            onClick = { filterName = option.filter.name }
                        )
                    }
                }
            }
        }

        when {
            state.historyLoading && state.historyItems.isEmpty() -> item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = CareerSize.TouchTarget * 3),
                    contentAlignment = Alignment.Center
                ) {
                    M3CircularProgress(label = "正在加载历史记录")
                }
            }

            state.historyLoadFailed && state.historyItems.isEmpty() -> item {
                M3EmptyState(
                    title = "历史记录加载失败",
                    description = "请检查网络连接后重试，本机缓存不会被清除。",
                    icon = CareerIcons.AlertCircle,
                    actionLabel = "重新加载",
                    onAction = onRefresh
                )
            }

            state.historyItems.isEmpty() -> item {
                M3EmptyState(
                    title = "还没有历史记录",
                    description = "确认职业目标后，可以在决策项目中保存第一份决策快照。",
                    icon = CareerIcons.History
                )
            }

            filteredItems.isEmpty() -> item {
                M3EmptyState(
                    title = "当前类型暂无记录",
                    description = "可以切换其他类型继续查看。",
                    icon = CareerIcons.History
                )
            }
        }

        items(filteredItems, key = HistoryItem::key) { item ->
            HistoryListItem(item = item, onClick = { onOpenItem(item) })
        }
    }
}

@Composable
private fun HistoryListItem(item: HistoryItem, onClick: () -> Unit) {
    M3Card(
        modifier = Modifier.clickable(
            role = Role.Button,
            onClickLabel = "查看${item.title}",
            onClick = onClick
        )
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Medium),
            verticalAlignment = Alignment.Top
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)
            ) {
                Text(
                    item.typeLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    item.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    item.summary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                "查看详情",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary
            )
        }
        Text(
            CareerDateTime.dateTime(item.createdAt) ?: "时间未知",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun HistoryDetailScreen(
    state: AppUiState,
    onBack: () -> Unit,
    onRetry: (HistoryItem) -> Unit,
    onDelete: (HistoryItem) -> Unit
) {
    val item = state.selectedHistoryItem
    var showDeleteDialog by rememberSaveable(item?.key) { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            horizontal = CareerSpacing.PageHorizontal,
            vertical = CareerSpacing.PageVertical
        ),
        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Large)
    ) {
        item {
            HistoryTopBar(
                title = "历史详情",
                supportingText = item?.typeLabel,
                onBack = onBack,
                action = item?.let { selected ->
                    {
                        M3IconButton(
                            icon = CareerIcons.Trash,
                            label = if (state.online) "删除历史记录" else "离线时不能删除",
                            onClick = { showDeleteDialog = true },
                            enabled = state.online && !state.historyDeleting
                        )
                    }
                }
            )
        }

        if (!state.online && item != null) {
            item {
                M3StatusBanner(
                    text = "当前离线。已缓存的详情仍可查看，删除需要重新联网。",
                    icon = CareerIcons.WifiOff
                )
            }
        }

        when {
            item == null -> item {
                M3EmptyState(
                    title = "没有可查看的记录",
                    description = "返回历史列表后重新选择一条记录。",
                    icon = CareerIcons.History,
                    actionLabel = "返回历史列表",
                    onAction = onBack
                )
            }

            state.historyDetailLoading -> item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = CareerSize.TouchTarget * 3),
                    contentAlignment = Alignment.Center
                ) {
                    M3CircularProgress(label = "正在加载历史详情")
                }
            }

            state.historyDetailLoadFailed -> item {
                M3EmptyState(
                    title = "历史详情加载失败",
                    description = "请检查网络连接后重试；如果此前查看过该记录，也会尝试读取本机缓存。",
                    icon = CareerIcons.AlertCircle,
                    actionLabel = "重新加载",
                    onAction = { onRetry(item) }
                )
            }

            state.historyDetail?.item?.key == item.key -> item {
                HistoryDetailCard(item = item, detail = state.historyDetail)
            }
        }
    }

    if (showDeleteDialog && item != null) {
        M3Dialog(
            title = "删除“${item.title}”？",
            onDismiss = { if (!state.historyDeleting) showDeleteDialog = false },
            confirmLabel = if (state.historyDeleting) "正在删除" else "删除",
            confirmEnabled = state.online && !state.historyDeleting,
            confirmDestructive = true,
            onConfirm = { onDelete(item) }
        ) {
            Text(item.deletionImpact())
            Text(
                "删除后无法恢复。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )
        }
    }
}

@Composable
private fun HistoryTopBar(
    title: String,
    supportingText: String?,
    onBack: () -> Unit,
    action: (@Composable () -> Unit)?
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
        verticalAlignment = Alignment.CenterVertically
    ) {
        M3IconButton(
            icon = CareerIcons.ArrowLeft,
            label = "返回",
            onClick = onBack
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            supportingText?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        action?.invoke()
    }
}

@Composable
private fun HistoryDetailCard(item: HistoryItem, detail: HistoryDetail) {
    M3Card {
        Text(
            item.typeLabel,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
        )
        Text(item.title, style = MaterialTheme.typography.headlineSmall)
        Text(
            CareerDateTime.dateTime(item.createdAt) ?: "时间未知",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        DetailSection(title = "摘要") {
            Text(item.summary, style = MaterialTheme.typography.bodyLarge)
        }

        when (detail) {
            is HistoryDetail.Report -> ReportDetail(detail.report)
            is HistoryDetail.ResumeAnalysis -> ResumeAnalysisDetail(detail.analysis)
            is HistoryDetail.LegacyPathPlan -> LegacyPathPlanDetail(detail.pathPlan.milestones, detail)
        }
    }
}

@Composable
private fun ReportDetail(report: ReportSnapshot) {
    if (report.type == HistoryItem.DECISION_SNAPSHOT_TYPE) {
        val snapshot = HistoryContentParser.decisionSnapshot(report.content)
        if (snapshot != null) {
            DecisionSnapshotDetail(snapshot)
            return
        }
    }

    val legacy = HistoryContentParser.legacyReport(report.content)
    DetailSection(title = "报告内容") {
        Text(legacy.summary ?: legacy.fallbackText ?: "原始报告内容已保留。")
    }
    if (legacy.evidenceHighlights.isNotEmpty()) {
        DetailSection(title = "能力证据") { BulletList(legacy.evidenceHighlights) }
    }
    if (legacy.risksAndAlternatives.isNotEmpty()) {
        DetailSection(title = "风险与备选") { BulletList(legacy.risksAndAlternatives) }
    }
}

@Composable
private fun DecisionSnapshotDetail(snapshot: DecisionSnapshotView) {
    snapshot.question?.let { question ->
        DetailSection(title = "决策问题") { Text(question) }
    }

    if (snapshot.primaryTarget != null || snapshot.backupTarget != null) {
        DetailSection(title = "目标选择") {
            snapshot.primaryTarget?.let { TargetDetail("主目标", it) }
            snapshot.backupTarget?.let { TargetDetail("备选目标", it) }
        }
    }

    DetailSection(title = "快照信息") {
        MetricRow("项目数据版本", snapshot.projectVersion?.let { "v$it" } ?: "未知")
        MetricRow("保存时间", CareerDateTime.dateTime(snapshot.capturedAt) ?: "时间未知")
        MetricRow("行动计划", snapshot.actionPlan?.durationWeeks?.let { "$it 周" } ?: "尚未生成")
    }

    if (snapshot.candidates.isNotEmpty()) {
        DetailSection(title = "候选方向") {
            snapshot.candidates.forEachIndexed { index, candidate ->
                if (index > 0) M3Divider()
                Text(candidate.name, style = MaterialTheme.typography.titleMedium)
                candidate.support?.let { MetricRow("支持", it) }
                candidate.opposition?.let { MetricRow("反对", it) }
                candidate.uncertainties?.let { MetricRow("不确定", it) }
            }
        }
    }

    if (snapshot.evidence.isNotEmpty()) {
        DetailSection(title = "项目证据") {
            snapshot.evidence.forEachIndexed { index, evidence ->
                if (index > 0) M3Divider()
                Text(evidence.title, style = MaterialTheme.typography.titleMedium)
                listOfNotNull(
                    evidence.sourceType?.let(::evidenceSourceLabel),
                    evidence.credibility?.let(::credibilityLabel),
                    evidence.stance?.let(::stanceLabel)
                ).takeIf { it.isNotEmpty() }?.let { labels ->
                    Text(
                        labels.joinToString(" · "),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                evidence.detail?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }

    snapshot.actionPlan?.let { plan ->
        DetailSection(title = "快照中的行动计划") {
            plan.overview?.let { Text(it) }
            MetricRow("完成比例", plan.progressPercent?.let { "$it%" } ?: "未记录")
            MetricRow(
                "任务进度",
                if (plan.completedTaskCount != null && plan.taskCount != null) {
                    "${plan.completedTaskCount} / ${plan.taskCount}"
                } else {
                    "未记录"
                }
            )
        }
    }
}

@Composable
private fun TargetDetail(label: String, target: SnapshotTargetView) {
    Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
    Text(target.name.ifBlank { "未记录" }, style = MaterialTheme.typography.titleMedium)
    target.reason?.let { MetricRow("依据", it) }
    target.risks?.let { MetricRow("风险", it) }
    target.reviewDate?.let { MetricRow("复核日期", CareerDateTime.date(it) ?: it) }
}

@Composable
private fun ResumeAnalysisDetail(analysis: ArchivedResumeAnalysis) {
    DetailSection(title = "分析评分") {
        MetricRow("综合评分", analysis.score?.toString() ?: "未评分")
        MetricRow("ATS 评分", analysis.atsScore?.toString() ?: "未评分")
        MetricRow("关键词匹配", analysis.keywordMatch?.toString() ?: "未评分")
    }
    DetailSection(title = "发现的问题") {
        if (analysis.issues.isEmpty()) Text("没有记录明确问题。") else BulletList(analysis.issues)
    }
    DetailSection(title = "修改建议") {
        if (analysis.suggestions.isEmpty()) Text("没有记录修改建议。") else BulletList(analysis.suggestions)
    }
    if (analysis.improvedFragments.isNotEmpty()) {
        DetailSection(title = "参考改写") { BulletList(analysis.improvedFragments) }
    }
}

@Composable
private fun LegacyPathPlanDetail(
    milestones: List<ArchivedPathMilestone>,
    detail: HistoryDetail.LegacyPathPlan
) {
    val plan = detail.pathPlan
    DetailSection(title = "旧路径概况") {
        MetricRow("目标方向", plan.targetRole.ifBlank { "未记录" })
        MetricRow("任务进度", "${plan.completedTaskCount} / ${plan.taskCount}")
        MetricRow("完成比例", "${plan.progressPercent}%")
        plan.overview?.takeIf(String::isNotBlank)?.let { Text(it) }
    }
    if (milestones.isNotEmpty()) {
        DetailSection(title = "阶段与任务") {
            milestones.forEachIndexed { index, milestone ->
                if (index > 0) M3Divider()
                Text(
                    "阶段 ${index + 1} · ${milestone.duration.ifBlank { "周期未记录" }}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(milestone.title, style = MaterialTheme.typography.titleMedium)
                milestone.tasks.forEach { task ->
                    MetricRow(pathTaskStatusLabel(task.status), task.content)
                }
                if (milestone.acceptance.isNotEmpty()) {
                    Text("验收标准", style = MaterialTheme.typography.labelLarge)
                    BulletList(milestone.acceptance)
                }
            }
        }
    }
}

@Composable
private fun DetailSection(title: String, content: @Composable () -> Unit) {
    M3Divider()
    Column(verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        content()
    }
}

@Composable
private fun MetricRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Medium),
        verticalAlignment = Alignment.Top
    ) {
        Text(
            label,
            modifier = Modifier.weight(0.34f),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(value, modifier = Modifier.weight(0.66f), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun BulletList(items: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
        items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                verticalAlignment = Alignment.Top
            ) {
                Text("•", color = MaterialTheme.colorScheme.primary)
                Text(item, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

private fun evidenceSourceLabel(value: String): String = when (value) {
    "user" -> "用户填写"
    "assessment" -> "测评"
    "resume" -> "简历解析"
    "task_result" -> "任务成果"
    "ai" -> "AI 推断"
    else -> value
}

private fun credibilityLabel(value: String): String = when (value) {
    "high" -> "高可信"
    "medium" -> "中可信"
    "low" -> "低可信"
    else -> value
}

private fun stanceLabel(value: String): String = when (value) {
    "support" -> "支持"
    "oppose" -> "反对"
    "neutral" -> "中性"
    else -> value
}

private fun pathTaskStatusLabel(value: String): String = when (value) {
    "done", "completed" -> "已完成"
    "in_progress" -> "进行中"
    "deferred" -> "已延期"
    "skipped" -> "已跳过"
    else -> "待完成"
}
