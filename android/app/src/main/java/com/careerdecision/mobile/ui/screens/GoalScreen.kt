package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.careerdecision.mobile.ui.AppUiState

@Composable
fun GoalScreen(
    state: AppUiState,
    onOpenWeb: () -> Unit,
    onSubmitConfidence: (String, String) -> Unit
) {
    val goal = state.goal
    var showFeedback by remember { mutableStateOf(false) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 18.dp, 16.dp, 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text("目标", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }
        if (goal?.planId == null) {
            item {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Outlined.Flag, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(10.dp))
                        Text("还没有已确认的职业目标")
                        Spacer(Modifier.height(18.dp))
                        Button(onClick = onOpenWeb) {
                            Icon(Icons.Outlined.OpenInBrowser, contentDescription = null)
                            Spacer(Modifier.width(7.dp))
                            Text("前往 Web 决策")
                        }
                    }
                }
            }
        } else {
            item {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("当前主目标", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        Text(goal.targetRole.orEmpty(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        if (!goal.backupTarget.isNullOrBlank()) {
                            Text("备选目标：${goal.backupTarget}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (!goal.confirmedAt.isNullOrBlank() || !goal.reviewDate.isNullOrBlank()) {
                            Text(
                                listOfNotNull(
                                    goal.confirmedAt?.take(10)?.let { "确认于 $it" },
                                    goal.reviewDate?.let { "复查日期 $it" }
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (!goal.decisionReason.isNullOrBlank()) {
                            HorizontalDivider()
                            Text("选择理由", style = MaterialTheme.typography.labelLarge)
                            Text(goal.decisionReason, style = MaterialTheme.typography.bodyMedium)
                        }
                        if (!goal.mainRisks.isNullOrBlank()) {
                            Text("主要风险与差距", style = MaterialTheme.typography.labelLarge)
                            Text(
                                goal.mainRisks,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("决策证据 ${goal.evidenceCount} 条")
                            Text("行动成果 ${goal.resultCount} 条")
                        }
                        LinearProgressIndicator(
                            progress = { goal.progressPercent.coerceIn(0, 100) / 100f },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${goal.completedTaskCount} / ${goal.taskCount} 项任务")
                            Text("${goal.progressPercent}%", fontWeight = FontWeight.Bold)
                        }
                        if (!goal.startDate.isNullOrBlank() || !goal.endDate.isNullOrBlank()) {
                            Text(
                                "${goal.startDate.orEmpty()} 至 ${goal.endDate.orEmpty()} · ${goal.durationWeeks} 周",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            item {
                Button(
                    onClick = { showFeedback = true },
                    enabled = !state.goalFeedbackLoading,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (state.goalFeedbackLoading) "正在提交" else "记录目标信心变化")
                }
            }
            item {
                Button(onClick = onOpenWeb, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.OpenInBrowser, contentDescription = null)
                    Spacer(Modifier.width(7.dp))
                    Text("在 Web 中查看或调整决策")
                }
            }
            item {
                Text("当前周任务", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
            items(state.tasks, key = { it.taskId }) { task ->
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.7f))
                ) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(task.title, fontWeight = FontWeight.SemiBold)
                            Text(
                                task.acceptanceCriteria,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(statusLabel(task.status), color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }

    if (showFeedback) {
        ConfidenceFeedbackDialog(
            onDismiss = { showFeedback = false },
            onConfirm = { trend, reason ->
                onSubmitConfidence(trend, reason)
                showFeedback = false
            }
        )
    }
}

@Composable
private fun ConfidenceFeedbackDialog(
    onDismiss: () -> Unit,
    onConfirm: (String, String) -> Unit
) {
    var trend by remember { mutableStateOf("stable") }
    var reason by remember { mutableStateOf("") }
    val choices = listOf("increased" to "上升", "stable" to "不变", "decreased" to "下降")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("目标信心变化") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    choices.forEachIndexed { index, choice ->
                        SegmentedButton(
                            selected = trend == choice.first,
                            onClick = { trend = choice.first },
                            shape = SegmentedButtonDefaults.itemShape(index, choices.size)
                        ) { Text(choice.second) }
                    }
                }
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("变化原因") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(trend, reason.trim()) }, enabled = reason.isNotBlank()) {
                Text("提交")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

private fun statusLabel(status: String): String = when (status) {
    "todo" -> "待开始"
    "in_progress" -> "进行中"
    "completed" -> "已完成"
    "deferred" -> "已延期"
    "skipped" -> "已跳过"
    else -> status
}
