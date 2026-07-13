package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.careerdecision.mobile.ui.AppUiState
import com.careerdecision.mobile.ui.PlanMilestoneUi
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3Button
import com.careerdecision.mobile.ui.design.M3ButtonVariant
import com.careerdecision.mobile.ui.design.M3Card
import com.careerdecision.mobile.ui.design.M3Dialog
import com.careerdecision.mobile.ui.design.M3Divider
import com.careerdecision.mobile.ui.design.M3EmptyState
import com.careerdecision.mobile.ui.design.M3LinearProgress
import com.careerdecision.mobile.ui.design.M3SectionTitle
import com.careerdecision.mobile.ui.design.M3SegmentedControl
import com.careerdecision.mobile.ui.design.M3TextArea
import com.careerdecision.mobile.ui.format.CareerDateTime

@Composable
fun GoalScreen(
    state: AppUiState,
    onOpenWeb: () -> Unit,
    onSubmitConfidence: (String, String) -> Unit
) {
    val goal = state.goal
    var showFeedback by rememberSaveable { mutableStateOf(false) }
    var feedbackVersionAtOpen by rememberSaveable {
        mutableLongStateOf(state.goalFeedbackSubmissionVersion)
    }

    LaunchedEffect(state.goalFeedbackSubmissionVersion) {
        if (showFeedback && state.goalFeedbackSubmissionVersion > feedbackVersionAtOpen) {
            showFeedback = false
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = CareerSpacing.PageHorizontal,
            vertical = CareerSpacing.PageVertical
        ),
        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Large)
    ) {
        item {
            M3SectionTitle(
                title = "目标",
                supportingText = "回看选择依据、整体进度和下一次复查点"
            )
        }

        if (goal?.planId == null) {
            item {
                M3EmptyState(
                    title = "还没有已确认的职业目标",
                    description = "先在 Web 完成候选比较和目标确认，Android 会同步后续行动。",
                    icon = CareerIcons.Goal,
                    actionLabel = "前往 Web 决策",
                    onAction = onOpenWeb
                )
            }
        } else {
            item {
                M3Card(emphasized = true) {
                    Text(
                        "当前主目标",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        goal.targetRole.orEmpty(),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    goal.backupTarget?.takeIf { it.isNotBlank() }?.let {
                        Text("备选目标：$it", color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                    val dates = listOfNotNull(
                        CareerDateTime.date(goal.confirmedAt)?.let { "确认于 $it" },
                        CareerDateTime.date(goal.reviewDate)?.let { "复查日期 $it" }
                    )
                    if (dates.isNotEmpty()) {
                        Text(
                            dates.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                    M3Divider()
                    goal.decisionReason?.takeIf { it.isNotBlank() }?.let {
                        Text("选择理由", style = MaterialTheme.typography.labelLarge)
                        Text(it, style = MaterialTheme.typography.bodyMedium)
                    }
                    goal.mainRisks?.takeIf { it.isNotBlank() }?.let {
                        Text("主要风险与差距", style = MaterialTheme.typography.labelLarge)
                        Text(it, style = MaterialTheme.typography.bodyMedium)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("决策证据 ${goal.evidenceCount} 条")
                        Text("行动成果 ${goal.resultCount} 条")
                    }
                    M3LinearProgress(goal.progressPercent)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${goal.completedTaskCount} / ${goal.taskCount} 项任务")
                        Text("${goal.progressPercent}%", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                ) {
                    M3Button(
                        text = if (state.goalFeedbackLoading) "正在提交" else "记录信心变化",
                        onClick = {
                            feedbackVersionAtOpen = state.goalFeedbackSubmissionVersion
                            showFeedback = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !state.goalFeedbackLoading,
                        loading = state.goalFeedbackLoading,
                        icon = CareerIcons.Review
                    )
                    M3Button(
                        text = "Web 深度编辑",
                        onClick = onOpenWeb,
                        modifier = Modifier.fillMaxWidth(),
                        variant = M3ButtonVariant.Outlined,
                        icon = CareerIcons.ExternalLink
                    )
                }
            }
            item {
                M3SectionTitle(
                    title = "计划里程碑",
                    supportingText = state.planDetail?.overview?.takeIf { it.isNotBlank() }
                        ?: "按周查看整体路径，当前周会被明确标记"
                )
            }
            if (state.milestones.isEmpty()) {
                item {
                    M3EmptyState(
                        title = "里程碑正在同步",
                        description = "刷新后仍未出现时，可在 Web 检查行动计划。",
                        icon = CareerIcons.Milestone
                    )
                }
            } else {
                items(state.milestones, key = { it.weekNo }) { milestone ->
                    MilestoneRow(milestone)
                }
            }
        }
    }

    if (showFeedback) {
        ConfidenceFeedbackDialog(
            busy = state.goalFeedbackLoading,
            onDismiss = {
                if (!state.goalFeedbackLoading) showFeedback = false
            },
            onConfirm = { trend, reason ->
                onSubmitConfidence(trend, reason)
            }
        )
    }
}

@Composable
private fun MilestoneRow(milestone: PlanMilestoneUi) {
    M3Card(emphasized = milestone.current) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)) {
                Text(
                    "第 ${milestone.weekNo} 周${if (milestone.current) " · 当前" else ""}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(milestone.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.width(CareerSpacing.Medium))
            Text("${milestone.completedTasks}/${milestone.totalTasks}", fontWeight = FontWeight.SemiBold)
        }
        Text(
            milestone.goal,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        M3LinearProgress(milestone.progressPercent)
    }
}

@Composable
private fun ConfidenceFeedbackDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String, String) -> Unit
) {
    var trend by rememberSaveable { mutableStateOf("stable") }
    var reason by rememberSaveable { mutableStateOf("") }
    val choices = listOf("increased" to "上升", "stable" to "不变", "decreased" to "下降")

    M3Dialog(
        title = "目标信心变化",
        onDismiss = onDismiss,
        confirmLabel = if (busy) "正在提交" else "提交",
        onConfirm = { onConfirm(trend, reason.trim()) },
        confirmEnabled = reason.isNotBlank() && !busy
    ) {
        if (busy) {
            Text("正在保存反馈...", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
        M3SegmentedControl(choices, trend, { trend = it })
        M3TextArea(
            value = reason,
            onValueChange = { reason = it },
            label = "变化原因",
            supportingText = "记录具体证据或阻碍，便于下次复查"
        )
    }
}
