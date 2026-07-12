package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddLink
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.RateReview
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.careerdecision.mobile.data.local.CachedTaskEntity
import com.careerdecision.mobile.ui.AppUiState
import java.time.LocalDateTime

private enum class TaskDialogMode { Complete, Defer, Skip }
private val actionableStatuses = setOf("todo", "in_progress", "deferred")

@Composable
fun TodayScreen(
    state: AppUiState,
    onRefresh: () -> Unit,
    onOpenWeb: () -> Unit,
    onUpdateTask: (CachedTaskEntity, String, String?, String?, String?, String?) -> Unit,
    onSubmitReview: (String, String?, String?, Int?, String, String?) -> Unit
) {
    var selectedTask by remember { mutableStateOf<CachedTaskEntity?>(null) }
    var dialogMode by remember { mutableStateOf<TaskDialogMode?>(null) }
    var showReviewDialog by remember { mutableStateOf(false) }
    val goal = state.goal
    val actionableTasks = state.tasks.filter { it.status in actionableStatuses }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 18.dp, 16.dp, 28.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("今日", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text(
                        goal?.targetRole ?: "还没有行动目标",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = onRefresh, enabled = !state.refreshing) {
                    if (state.refreshing) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Outlined.Refresh, contentDescription = "同步")
                }
            }
        }

        if (!state.online || state.pendingCount > 0) {
            item {
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.CloudOff, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            if (state.pendingCount > 0) "${state.pendingCount} 项操作等待同步" else "当前使用本地数据",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }

        if (goal?.planId != null) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("总计划进度", style = MaterialTheme.typography.labelLarge)
                        Text("${goal.progressPercent}%", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                    LinearProgressIndicator(
                        progress = { goal.progressPercent.coerceIn(0, 100) / 100f },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        "${goal.completedTaskCount} / ${goal.taskCount} 项完成",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        item {
            Text(
                if (actionableTasks.isEmpty()) "本周任务" else "本周待办 ${actionableTasks.size}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        if (actionableTasks.isEmpty()) {
            item { EmptyToday(hasGoal = goal?.planId != null, onOpenWeb = onOpenWeb) }
        } else {
            itemsIndexed(actionableTasks, key = { _, task -> task.taskId }) { index, task ->
                TaskRow(
                    task = task,
                    primary = index == 0,
                    busy = state.busyTaskId == task.taskId,
                    onStart = { onUpdateTask(task, "in_progress", null, null, null, null) },
                    onComplete = { selectedTask = task; dialogMode = TaskDialogMode.Complete },
                    onDefer = { selectedTask = task; dialogMode = TaskDialogMode.Defer },
                    onSkip = { selectedTask = task; dialogMode = TaskDialogMode.Skip }
                )
            }
        }

        if (goal?.planId != null) {
            item {
                OutlinedButton(
                    onClick = { showReviewDialog = true },
                    enabled = !state.reviewLoading,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (state.reviewLoading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Outlined.RateReview, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("快速提交第 ${goal.currentWeek} 周复盘")
                }
            }
        }
    }

    val task = selectedTask
    val mode = dialogMode
    if (task != null && mode != null) {
        TaskActionDialog(
            task = task,
            mode = mode,
            onDismiss = { selectedTask = null; dialogMode = null },
            onConfirm = { reason, deferredTo, description, link ->
                val status = when (mode) {
                    TaskDialogMode.Complete -> "completed"
                    TaskDialogMode.Defer -> "deferred"
                    TaskDialogMode.Skip -> "skipped"
                }
                onUpdateTask(task, status, reason, deferredTo, description, link)
                selectedTask = null
                dialogMode = null
            }
        )
    }


    if (showReviewDialog) {
        WeeklyReviewDialog(
            weekNo = goal?.currentWeek ?: 1,
            onDismiss = { showReviewDialog = false },
            onConfirm = { completed, evidence, difficulties, minutes, trend, reason ->
                onSubmitReview(completed, evidence, difficulties, minutes, trend, reason)
                showReviewDialog = false
            }
        )
    }
}

@Composable
private fun WeeklyReviewDialog(
    weekNo: Int,
    onDismiss: () -> Unit,
    onConfirm: (String, String?, String?, Int?, String, String?) -> Unit
) {
    var completed by remember { mutableStateOf("") }
    var evidence by remember { mutableStateOf("") }
    var difficulties by remember { mutableStateOf("") }
    var confidenceReason by remember { mutableStateOf("") }
    var confidenceTrend by remember { mutableStateOf("stable") }
    var nextWeekHours by remember { mutableIntStateOf(5) }
    val canSubmit = completed.isNotBlank() || evidence.isNotBlank() || difficulties.isNotBlank()
    val trends = listOf("increased" to "更有信心", "stable" to "基本不变", "decreased" to "有所下降")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("第 $weekNo 周快速复盘") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("复杂的任务调整可在 Web 端继续处理。", color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    value = completed,
                    onValueChange = { completed = it },
                    label = { Text("本周完成了什么") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = evidence,
                    onValueChange = { evidence = it },
                    label = { Text("产生了哪些成果") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = difficulties,
                    onValueChange = { difficulties = it },
                    label = { Text("遇到的困难") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                Text("目标信心变化", style = MaterialTheme.typography.labelLarge)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    trends.forEach { (value, label) ->
                        FilterChip(
                            selected = confidenceTrend == value,
                            onClick = { confidenceTrend = value },
                            label = { Text(label) }
                        )
                    }
                }
                OutlinedTextField(
                    value = confidenceReason,
                    onValueChange = { confidenceReason = it },
                    label = { Text("信心变化原因（选填）") },
                    modifier = Modifier.fillMaxWidth()
                )
                Text("下周可投入时间", style = MaterialTheme.typography.labelLarge)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = { nextWeekHours = (nextWeekHours - 1).coerceAtLeast(0) }) { Text("−") }
                    Text(
                        "$nextWeekHours 小时",
                        modifier = Modifier.padding(horizontal = 20.dp),
                        fontWeight = FontWeight.Bold
                    )
                    OutlinedButton(onClick = { nextWeekHours = (nextWeekHours + 1).coerceAtMost(168) }) { Text("+") }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(
                        completed.trim(),
                        evidence.trim().takeIf { it.isNotBlank() },
                        difficulties.trim().takeIf { it.isNotBlank() },
                        nextWeekHours * 60,
                        confidenceTrend,
                        confidenceReason.trim().takeIf { it.isNotBlank() }
                    )
                },
                enabled = canSubmit
            ) { Text("提交复盘") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

@Composable
private fun TaskRow(
    task: CachedTaskEntity,
    primary: Boolean,
    busy: Boolean,
    onStart: () -> Unit,
    onComplete: () -> Unit,
    onDefer: () -> Unit,
    onSkip: () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (primary) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            if (primary) 2.dp else 1.dp,
            if (primary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline.copy(alpha = 0.7f)
        )
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (primary) {
                Text(
                    "今日主任务",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                )
            }
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(task.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        listOfNotNull(task.taskType.takeIf { it.isNotBlank() }, task.estimatedMinutes?.let { "$it 分钟" })
                            .joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Box {
                    IconButton(onClick = { menuOpen = true }, enabled = !busy) {
                        Icon(Icons.Outlined.MoreVert, contentDescription = "更多任务操作")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(text = { Text("延期") }, onClick = { menuOpen = false; onDefer() })
                        DropdownMenuItem(text = { Text("跳过") }, onClick = { menuOpen = false; onSkip() })
                    }
                }
            }
            if (!task.content.isNullOrBlank()) {
                Text(
                    task.content,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(5.dp)) {
                Text(
                    "验收：${task.acceptanceCriteria}",
                    modifier = Modifier.padding(10.dp),
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (task.status != "in_progress") {
                    OutlinedButton(onClick = onStart, enabled = !busy) {
                        Icon(Icons.Outlined.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("开始")
                    }
                }
                Button(onClick = onComplete, enabled = !busy) {
                    if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Outlined.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("完成")
                }
                if (task.resultCount > 0) {
                    Text(
                        "${task.resultCount} 个成果",
                        modifier = Modifier.align(Alignment.CenterVertically),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyToday(hasGoal: Boolean, onOpenWeb: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Outlined.TaskAlt, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))
            Text(if (hasGoal) "本周没有待处理任务" else "请先在 Web 端确认目标并生成计划")
            if (!hasGoal) {
                Spacer(Modifier.height(14.dp))
                Button(onClick = onOpenWeb) {
                    Text("前往 Web 完成决策")
                }
            }
        }
    }
}

@Composable
private fun TaskActionDialog(
    task: CachedTaskEntity,
    mode: TaskDialogMode,
    onDismiss: () -> Unit,
    onConfirm: (String?, String?, String?, String?) -> Unit
) {
    var reason by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var link by remember { mutableStateOf("") }
    var deferredDays by remember { mutableIntStateOf(1) }
    val needsReason = mode == TaskDialogMode.Defer || mode == TaskDialogMode.Skip
    val canSubmit = !needsReason || reason.isNotBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                when (mode) {
                    TaskDialogMode.Complete -> "完成任务"
                    TaskDialogMode.Defer -> "延期任务"
                    TaskDialogMode.Skip -> "跳过任务"
                }
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(task.title, fontWeight = FontWeight.SemiBold)
                if (mode == TaskDialogMode.Complete) {
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text("成果说明（可选）") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = link,
                        onValueChange = { link = it },
                        leadingIcon = { Icon(Icons.Outlined.AddLink, contentDescription = null) },
                        label = { Text("成果链接（可选）") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        label = { Text("原因") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (mode == TaskDialogMode.Defer) {
                        Text("延期天数", style = MaterialTheme.typography.labelLarge)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(onClick = { deferredDays = (deferredDays - 1).coerceAtLeast(1) }) { Text("−") }
                            Text(
                                "$deferredDays 天",
                                modifier = Modifier.padding(horizontal = 20.dp),
                                fontWeight = FontWeight.Bold
                            )
                            OutlinedButton(onClick = { deferredDays = (deferredDays + 1).coerceAtMost(30) }) { Text("+") }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val deferredTo = if (mode == TaskDialogMode.Defer) {
                        LocalDateTime.now().plusDays(deferredDays.toLong()).withSecond(0).withNano(0).toString()
                    } else null
                    onConfirm(reason.takeIf { it.isNotBlank() }, deferredTo, description, link)
                },
                enabled = canSubmit
            ) { Text("确认") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}
