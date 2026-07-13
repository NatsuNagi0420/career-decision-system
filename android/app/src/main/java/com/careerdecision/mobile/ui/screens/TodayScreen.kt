package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.careerdecision.mobile.data.local.CachedTaskEntity
import com.careerdecision.mobile.ui.AppUiState
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3ActionChip
import com.careerdecision.mobile.ui.design.M3Button
import com.careerdecision.mobile.ui.design.M3ButtonVariant
import com.careerdecision.mobile.ui.design.M3Card
import com.careerdecision.mobile.ui.design.M3ChoiceChip
import com.careerdecision.mobile.ui.design.M3Dialog
import com.careerdecision.mobile.ui.design.M3EmptyState
import com.careerdecision.mobile.ui.design.M3IconButton
import com.careerdecision.mobile.ui.design.M3LinearProgress
import com.careerdecision.mobile.ui.design.M3MenuAction
import com.careerdecision.mobile.ui.design.M3OverflowMenu
import com.careerdecision.mobile.ui.design.M3SectionTitle
import com.careerdecision.mobile.ui.design.M3StatusBanner
import com.careerdecision.mobile.ui.design.M3TextArea
import com.careerdecision.mobile.ui.design.M3TextField
import com.careerdecision.mobile.ui.format.CareerDateTime
import java.time.LocalDateTime

private enum class TaskDialogMode { Complete, Defer, Skip, Result }
private val actionableStatuses = setOf("todo", "in_progress", "deferred")
private val recentHandledStatuses = setOf("completed", "skipped")
private val recoverableStatuses = setOf("completed", "skipped", "deferred")
private val submittedReviewStatuses = setOf("submitted", "adjustments_applied")

@Composable
fun TodayScreen(
    state: AppUiState,
    onRefresh: () -> Unit,
    onOpenWeb: () -> Unit,
    onUpdateTask: (CachedTaskEntity, String, String?, String?, String?, String?) -> Unit,
    onAddResult: (CachedTaskEntity, String, String?) -> Unit,
    onSubmitReview: (String, String?, String?, Int?, String, String?) -> Unit
) {
    var selectedTaskId by rememberSaveable { mutableStateOf<Long?>(null) }
    var dialogModeName by rememberSaveable { mutableStateOf<String?>(null) }
    var showReviewDialog by rememberSaveable { mutableStateOf(false) }
    var reviewVersionAtOpen by rememberSaveable { mutableLongStateOf(state.reviewSubmissionVersion) }
    var taskVersionAtOpen by rememberSaveable { mutableLongStateOf(state.taskMutationVersion) }
    val goal = state.goal
    val selectedTask = state.tasks.firstOrNull { it.taskId == selectedTaskId }
    val selectedDialogMode = dialogModeName?.let { name ->
        TaskDialogMode.entries.firstOrNull { it.name == name }
    }
    val actionableTasks = state.tasks.filter { it.status in actionableStatuses }
    val recentHandledTasks = state.tasks
        .filter { it.status in recentHandledStatuses }
        .sortedByDescending { it.updatedAt.orEmpty() }
        .take(3)
    val currentReviewSubmitted = goal?.let { currentGoal ->
        state.latestReview?.let { review ->
            review.planId == currentGoal.planId &&
                review.weekNo == currentGoal.currentWeek &&
                review.status in submittedReviewStatuses
        } == true
    } == true
    val currentReviewPending = goal?.let {
        it.planId == state.reviewPendingPlanId && it.currentWeek == state.reviewPendingWeek
    } == true

    LaunchedEffect(state.reviewSubmissionVersion) {
        if (showReviewDialog && state.reviewSubmissionVersion > reviewVersionAtOpen) {
            showReviewDialog = false
        }
    }
    LaunchedEffect(state.taskMutationVersion) {
        if (selectedTaskId != null && state.taskMutationVersion > taskVersionAtOpen) {
            selectedTaskId = null
            dialogModeName = null
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                M3SectionTitle(
                    title = "今日",
                    supportingText = goal?.targetRole ?: "还没有行动目标",
                    modifier = Modifier.weight(1f)
                )
                M3IconButton(
                    icon = CareerIcons.Refresh,
                    label = "同步最新行动",
                    onClick = onRefresh,
                    enabled = !state.refreshing
                )
            }
        }

        if (!state.online || state.pendingCount > 0) {
            item {
                M3StatusBanner(
                    text = if (state.pendingCount > 0) {
                        "${state.pendingCount} 项操作等待同步"
                    } else {
                        "当前显示最近一次本地数据"
                    },
                    icon = CareerIcons.CloudOff
                )
            }
        }

        if (goal?.planId != null) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("总计划进度", style = MaterialTheme.typography.labelLarge)
                        Text("${goal.progressPercent}%", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                    }
                    M3LinearProgress(goal.progressPercent)
                    Text(
                        "${goal.completedTaskCount} / ${goal.taskCount} 项完成",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        item {
            M3SectionTitle(
                title = if (actionableTasks.isEmpty()) "本周行动" else "本周待办 ${actionableTasks.size}",
                supportingText = actionableTasks.firstOrNull()?.let { "先完成当前最重要的一项" }
            )
        }

        if (actionableTasks.isEmpty()) {
            item {
                M3EmptyState(
                    title = if (goal?.planId != null) "本周没有待处理任务" else "还没有行动计划",
                    description = if (goal?.planId != null) {
                        "可以提交本周复盘，或在 Web 调整后续计划。"
                    } else {
                        "先在 Web 确认目标并生成行动计划。"
                    },
                    icon = CareerIcons.Today,
                    actionLabel = if (goal?.planId == null) "前往 Web 完成决策" else null,
                    onAction = if (goal?.planId == null) onOpenWeb else null
                )
            }
        } else {
            itemsIndexed(actionableTasks, key = { _, task -> task.taskId }) { index, task ->
                TaskCard(
                    task = task,
                    primary = index == 0,
                    busy = state.busyTaskId == task.taskId,
                    onStart = { onUpdateTask(task, "in_progress", null, null, null, null) },
                    onComplete = {
                        taskVersionAtOpen = state.taskMutationVersion
                        selectedTaskId = task.taskId
                        dialogModeName = TaskDialogMode.Complete.name
                    },
                    onResult = {
                        taskVersionAtOpen = state.taskMutationVersion
                        selectedTaskId = task.taskId
                        dialogModeName = TaskDialogMode.Result.name
                    },
                    onDefer = {
                        taskVersionAtOpen = state.taskMutationVersion
                        selectedTaskId = task.taskId
                        dialogModeName = TaskDialogMode.Defer.name
                    },
                    onSkip = {
                        taskVersionAtOpen = state.taskMutationVersion
                        selectedTaskId = task.taskId
                        dialogModeName = TaskDialogMode.Skip.name
                    },
                    onRestore = { onUpdateTask(task, "todo", null, null, null, null) }
                )
            }
        }

        if (recentHandledTasks.isNotEmpty()) {
            item {
                M3SectionTitle(
                    title = "最近处理",
                    supportingText = "保留最近三项，可恢复为待开始"
                )
            }
            itemsIndexed(recentHandledTasks, key = { _, task -> "recent-${task.taskId}" }) { _, task ->
                RecentTaskCard(
                    task = task,
                    busy = state.busyTaskId == task.taskId,
                    onRestore = { onUpdateTask(task, "todo", null, null, null, null) }
                )
            }
        }

        if (goal?.planId != null) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
                    if (currentReviewSubmitted || currentReviewPending) {
                        M3StatusBanner(
                            text = if (currentReviewSubmitted) {
                                "本周复盘已提交"
                            } else {
                                "本周复盘已保存，等待同步"
                            },
                            icon = CareerIcons.Review
                        )
                    }
                    M3Button(
                        text = when {
                            currentReviewSubmitted -> "本周复盘已提交"
                            currentReviewPending -> "本周复盘待同步"
                            else -> "快速提交第 ${goal.currentWeek} 周复盘"
                        },
                        onClick = {
                            reviewVersionAtOpen = state.reviewSubmissionVersion
                            showReviewDialog = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !state.reviewLoading && !currentReviewSubmitted && !currentReviewPending,
                        loading = state.reviewLoading,
                        variant = M3ButtonVariant.Outlined,
                        icon = CareerIcons.Review
                    )
                }
            }
        }
    }

    val task = selectedTask
    val mode = selectedDialogMode
    if (task != null && mode != null) {
        TaskActionDialog(
            task = task,
            mode = mode,
            busy = state.busyTaskId == task.taskId,
            onDismiss = {
                if (state.busyTaskId != task.taskId) {
                    selectedTaskId = null
                    dialogModeName = null
                }
            },
            onConfirm = { reason, deferredTo, description, link ->
                if (mode == TaskDialogMode.Result) {
                    onAddResult(task, description.orEmpty(), link)
                } else {
                    val status = when (mode) {
                        TaskDialogMode.Complete -> "completed"
                        TaskDialogMode.Defer -> "deferred"
                        TaskDialogMode.Skip -> "skipped"
                        TaskDialogMode.Result -> error("unreachable")
                    }
                    onUpdateTask(task, status, reason, deferredTo, description, link)
                }
            }
        )
    }

    if (showReviewDialog) {
        WeeklyReviewDialog(
            weekNo = goal?.currentWeek ?: 1,
            busy = state.reviewLoading,
            onDismiss = { showReviewDialog = false },
            onConfirm = { completed, evidence, difficulties, minutes, trend, reason ->
                onSubmitReview(completed, evidence, difficulties, minutes, trend, reason)
            }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TaskCard(
    task: CachedTaskEntity,
    primary: Boolean,
    busy: Boolean,
    onStart: () -> Unit,
    onComplete: () -> Unit,
    onResult: () -> Unit,
    onDefer: () -> Unit,
    onSkip: () -> Unit,
    onRestore: () -> Unit
) {
    M3Card(emphasized = primary) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)) {
                if (primary) {
                    Text(
                        "今日主任务 · ${taskStatusLabel(task.status)}",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                } else {
                    Text(
                        taskStatusLabel(task.status),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                Text(task.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                val metadata = listOfNotNull(
                    task.taskType.takeIf { it.isNotBlank() },
                    task.estimatedMinutes?.let { "$it 分钟" },
                    CareerDateTime.dateTime(task.deferredTo ?: task.dueAt)?.let { "$it 截止" }
                )
                if (metadata.isNotEmpty()) {
                    Text(
                        metadata.joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            M3OverflowMenu(
                label = "更多任务操作",
                enabled = !busy,
                actions = buildList {
                    add(M3MenuAction("延期", CareerIcons.CalendarClock, onDefer))
                    add(M3MenuAction("跳过", CareerIcons.SkipForward, onSkip))
                    if (task.status in recoverableStatuses) {
                        add(M3MenuAction("恢复为待开始", CareerIcons.Refresh, onRestore))
                    }
                }
            )
        }
        task.content?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(
            "验收标准：${task.acceptanceCriteria}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
        ) {
            if (task.status != "in_progress") {
                M3Button(
                    text = "开始",
                    onClick = onStart,
                    enabled = !busy,
                    variant = M3ButtonVariant.Outlined,
                    icon = CareerIcons.Play
                )
            }
            M3Button(
                text = "完成",
                onClick = onComplete,
                enabled = !busy,
                loading = busy,
                variant = if (primary) M3ButtonVariant.Filled else M3ButtonVariant.Tonal,
                icon = CareerIcons.Check
            )
            M3Button(
                text = "记录成果",
                onClick = onResult,
                enabled = !busy,
                variant = M3ButtonVariant.Text,
                icon = CareerIcons.Evidence
            )
            if (task.resultCount > 0) {
                M3ActionChip("${task.resultCount} 个成果", onClick = onResult, icon = CareerIcons.Link)
            }
        }
    }
}

@Composable
private fun RecentTaskCard(
    task: CachedTaskEntity,
    busy: Boolean,
    onRestore: () -> Unit
) {
    M3Card {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)) {
                Text(taskStatusLabel(task.status), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(task.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                task.skipReason?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            M3Button(
                text = "恢复",
                onClick = onRestore,
                enabled = !busy,
                loading = busy,
                variant = M3ButtonVariant.Outlined,
                icon = CareerIcons.Refresh
            )
        }
    }
}

private fun taskStatusLabel(status: String): String = when (status) {
    "todo" -> "待开始"
    "in_progress" -> "进行中"
    "completed" -> "已完成"
    "deferred" -> "已延期"
    "skipped" -> "已跳过"
    else -> status
}

@Composable
private fun TaskActionDialog(
    task: CachedTaskEntity,
    mode: TaskDialogMode,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String?, String?, String?, String?) -> Unit
) {
    var reason by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var link by rememberSaveable { mutableStateOf("") }
    var deferredDays by rememberSaveable { mutableIntStateOf(1) }
    val needsReason = mode == TaskDialogMode.Defer || mode == TaskDialogMode.Skip
    val needsDescription = mode == TaskDialogMode.Result
    val canSubmit = (!needsReason || reason.isNotBlank()) && (!needsDescription || description.isNotBlank())

    M3Dialog(
        title = when (mode) {
            TaskDialogMode.Complete -> "完成任务"
            TaskDialogMode.Defer -> "延期任务"
            TaskDialogMode.Skip -> "跳过任务"
            TaskDialogMode.Result -> "记录成果"
        },
        onDismiss = onDismiss,
        confirmLabel = "确认",
        onConfirm = {
            val deferredTo = if (mode == TaskDialogMode.Defer) {
                LocalDateTime.now().plusDays(deferredDays.toLong()).withSecond(0).withNano(0).toString()
            } else null
            onConfirm(
                reason.trim().takeIf { it.isNotBlank() },
                deferredTo,
                description.trim().takeIf { it.isNotBlank() },
                link.trim().takeIf { it.isNotBlank() }
            )
        },
        confirmEnabled = canSubmit && !busy
    ) {
        if (busy) {
            Text("正在保存...", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
        Text(task.title, fontWeight = FontWeight.SemiBold)
        if (mode == TaskDialogMode.Complete || mode == TaskDialogMode.Result) {
            M3TextArea(
                value = description,
                onValueChange = { description = it },
                label = if (mode == TaskDialogMode.Result) "成果说明" else "成果说明（选填）",
                supportingText = "写清楚产出和可验证结果"
            )
            M3TextField(
                value = link,
                onValueChange = { link = it },
                label = "成果链接（选填）",
                leadingIcon = CareerIcons.Link
            )
        } else {
            M3TextArea(reason, { reason = it }, "原因")
            if (mode == TaskDialogMode.Defer) {
                Text("延期天数", style = MaterialTheme.typography.labelLarge)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)) {
                    M3IconButton(
                        icon = CareerIcons.Minus,
                        label = "减少一天",
                        onClick = { deferredDays = (deferredDays - 1).coerceAtLeast(1) }
                    )
                    Text("$deferredDays 天", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    M3IconButton(
                        icon = CareerIcons.Plus,
                        label = "增加一天",
                        onClick = { deferredDays = (deferredDays + 1).coerceAtMost(30) }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WeeklyReviewDialog(
    weekNo: Int,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String, String?, String?, Int?, String, String?) -> Unit
) {
    var completed by rememberSaveable { mutableStateOf("") }
    var evidence by rememberSaveable { mutableStateOf("") }
    var difficulties by rememberSaveable { mutableStateOf("") }
    var confidenceReason by rememberSaveable { mutableStateOf("") }
    var confidenceTrend by rememberSaveable { mutableStateOf("stable") }
    var nextWeekHours by rememberSaveable { mutableIntStateOf(5) }
    val canSubmit = completed.isNotBlank() || evidence.isNotBlank() || difficulties.isNotBlank()
    val trends = listOf("increased" to "更有信心", "stable" to "基本不变", "decreased" to "有所下降")

    M3Dialog(
        title = "第 $weekNo 周快速复盘",
        onDismiss = onDismiss,
        confirmLabel = "提交复盘",
        onConfirm = {
            onConfirm(
                completed.trim(),
                evidence.trim().takeIf { it.isNotBlank() },
                difficulties.trim().takeIf { it.isNotBlank() },
                nextWeekHours * 60,
                confidenceTrend,
                confidenceReason.trim().takeIf { it.isNotBlank() }
            )
        },
        confirmEnabled = canSubmit && !busy
    ) {
        if (busy) {
            Text("正在保存复盘...", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
        M3TextArea(completed, { completed = it }, "本周完成了什么")
        M3TextArea(evidence, { evidence = it }, "产生了哪些成果")
        M3TextArea(difficulties, { difficulties = it }, "遇到的困难")
        Text("目标信心变化", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
        ) {
            trends.forEach { (value, label) ->
                M3ChoiceChip(label, selected = confidenceTrend == value, onClick = { confidenceTrend = value })
            }
        }
        M3TextField(confidenceReason, { confidenceReason = it }, "信心变化原因（选填）", singleLine = false)
        Text("下周可投入时间", style = MaterialTheme.typography.labelLarge)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)) {
            M3IconButton(
                icon = CareerIcons.Minus,
                label = "减少一小时",
                onClick = { nextWeekHours = (nextWeekHours - 1).coerceAtLeast(0) }
            )
            Text("$nextWeekHours 小时", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            M3IconButton(
                icon = CareerIcons.Plus,
                label = "增加一小时",
                onClick = { nextWeekHours = (nextWeekHours + 1).coerceAtMost(168) }
            )
        }
    }
}
