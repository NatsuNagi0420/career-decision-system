package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.careerdecision.mobile.ui.AppUiState
import com.careerdecision.mobile.ui.MentorMessageUi
import com.careerdecision.mobile.ui.MentorActionUi
import com.careerdecision.mobile.ui.design.AssistantAvatar
import com.careerdecision.mobile.ui.design.AssistantAvatarSize
import com.careerdecision.mobile.ui.design.AssistantVisualState
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3ActionChip
import com.careerdecision.mobile.ui.design.M3Button
import com.careerdecision.mobile.ui.design.M3ButtonVariant
import com.careerdecision.mobile.ui.design.M3Divider
import com.careerdecision.mobile.ui.design.M3Card
import com.careerdecision.mobile.ui.design.M3CircularProgress
import com.careerdecision.mobile.ui.design.M3ModalBottomSheet
import com.careerdecision.mobile.ui.design.M3IconButton
import com.careerdecision.mobile.ui.design.M3Dialog
import com.careerdecision.mobile.ui.design.M3OverflowMenu
import com.careerdecision.mobile.ui.design.M3MenuAction
import com.careerdecision.mobile.ui.design.M3MessageBubble
import com.careerdecision.mobile.ui.design.M3SectionTitle
import com.careerdecision.mobile.ui.design.M3StatusBanner
import com.careerdecision.mobile.ui.design.M3TextField

private val mentorQuickPrompts = listOf(
    "今天先做什么",
    "当前任务卡住了怎么办",
    "解释一个岗位要求",
    "如何证明某项能力",
    "是否需要调整本周计划"
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MentorScreen(
    state: AppUiState,
    onSend: (String) -> Unit,
    onRetry: (String) -> Unit,
    onNewConversation: () -> Unit,
    onLoadHistory: () -> Unit,
    onOpenSession: (Long) -> Unit,
    onDeleteSession: (Long) -> Unit,
    onAction: (MentorActionUi) -> Unit,
    onNavigateToday: () -> Unit,
    onNavigateGoal: () -> Unit
) {
    var message by rememberSaveable { mutableStateOf("") }
    var observedAcceptedVersion by remember { mutableLongStateOf(state.chatSendAcceptedVersion) }
    val listState = rememberLazyListState()
    val hasFailedMessage = state.mentorMessages.any { it.failed }
    val chatBusy = state.chatLoading || state.mentorSessionDeleting != null
    var inputFocused by remember { mutableStateOf(false) }
    var historyOpen by rememberSaveable { mutableStateOf(false) }
    var sessionToDelete by rememberSaveable { mutableStateOf<Long?>(null) }
    var observedResetVersion by remember { mutableLongStateOf(state.mentorConversationResetVersion) }
    val latestAssistantState = state.mentorMessages
        .asReversed()
        .firstOrNull { it.role == "assistant" }
        ?.assistantVisualState()
        ?: AssistantVisualState.Default
    val activeVisualState = when {
        state.mentorResponding -> AssistantVisualState.Thinking
        inputFocused -> AssistantVisualState.Listening
        hasFailedMessage -> AssistantVisualState.Concerned
        else -> latestAssistantState
    }

    LaunchedEffect(state.chatSendAcceptedVersion) {
        if (state.chatSendAcceptedVersion != observedAcceptedVersion) {
            // Clear only after the repository confirms delivery. Failed or pending
            // messages keep the draft available for the user.
            message = ""
            observedAcceptedVersion = state.chatSendAcceptedVersion
        }
    }

    LaunchedEffect(state.mentorConversationResetVersion) {
        if (state.mentorConversationResetVersion != observedResetVersion) {
            message = ""
            observedResetVersion = state.mentorConversationResetVersion
        }
    }

    LaunchedEffect(state.mentorMessages.size, state.mentorResponding) {
        if (state.mentorMessages.isNotEmpty()) {
            val targetIndex = state.mentorMessages.lastIndex + if (state.mentorResponding) 1 else 0
            listState.animateScrollToItem(targetIndex)
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = CareerSpacing.PageHorizontal,
                    end = CareerSpacing.Small,
                    top = CareerSpacing.PageVertical,
                    bottom = CareerSpacing.Medium
                ),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AssistantAvatar(
                state = activeVisualState,
                size = AssistantAvatarSize.Medium,
                contentDescription = activeVisualState.accessibilityLabel(),
                modifier = Modifier.padding(end = CareerSpacing.Small)
            )
            M3SectionTitle(
                title = "穗奈 · AI 导师",
                supportingText = if (state.mentorSessionId != null) {
                    state.mentorSessionTitle
                } else {
                    state.goal?.targetRole ?: "围绕当前职业决策持续讨论"
                },
                modifier = Modifier.weight(1f)
            )
            M3IconButton(
                icon = CareerIcons.History,
                label = "查看历史会话",
                onClick = {
                    historyOpen = true
                    onLoadHistory()
                },
                enabled = !chatBusy
            )
            M3IconButton(
                icon = CareerIcons.NewChat,
                label = "开始新会话",
                onClick = onNewConversation,
                enabled = !chatBusy
            )
            if (state.mentorSessionId != null) {
                M3IconButton(
                    icon = CareerIcons.Trash,
                    label = "删除当前会话",
                    onClick = { sessionToDelete = state.mentorSessionId },
                    enabled = !chatBusy
                )
            }
        }

        if (state.mentorSessionDeleting != null) {
            M3StatusBanner(
                text = "正在删除会话…",
                icon = CareerIcons.Trash,
                modifier = Modifier.padding(horizontal = CareerSpacing.PageHorizontal)
            )
        }
        if (state.fullProfile?.externalAiConsent == false) {
            M3StatusBanner(
                text = "外部 AI 授权未开启，导师将使用本地规则建议。",
                icon = CareerIcons.Shield,
                modifier = Modifier.padding(horizontal = CareerSpacing.PageHorizontal)
            )
        }
        if (hasFailedMessage) {
            M3StatusBanner(
                text = "上一条消息发送失败，请先重试或开始新会话",
                icon = CareerIcons.Refresh,
                modifier = Modifier.padding(horizontal = CareerSpacing.PageHorizontal)
            )
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = CareerSpacing.PageHorizontal,
                vertical = CareerSpacing.Medium
            ),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)
        ) {
            if (state.mentorMessages.isEmpty()) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                        verticalAlignment = Alignment.Top
                    ) {
                        AssistantAvatar(
                            state = AssistantVisualState.Default,
                            size = AssistantAvatarSize.Small
                        )
                        M3MessageBubble(fromUser = false, modifier = Modifier.weight(1f)) {
                            Text("从一个具体问题开始", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                "我会结合当前目标、行动计划和最近任务给出下一步建议。",
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                item {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                    ) {
                        if (!hasFailedMessage && !chatBusy) {
                            mentorQuickPrompts.forEach { prompt ->
                                M3ActionChip(prompt, onClick = { onSend(prompt) })
                            }
                        }
                    }
                }
            }
            items(state.mentorMessages, key = { it.localId }) { item ->
                MentorMessage(item, onRetry, onAction, interactionsEnabled = !chatBusy)
            }
            if (state.mentorResponding) {
                item(key = "mentor-thinking") {
                    MentorThinkingMessage()
                }
            }
        }

        M3Divider()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(CareerSpacing.Medium),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                verticalAlignment = Alignment.CenterVertically
            ) {
                M3TextField(
                    value = message,
                    onValueChange = { message = it },
                    label = "这次想重点讨论什么",
                    enabled = !hasFailedMessage && !chatBusy,
                    modifier = Modifier
                        .weight(1f)
                        .widthIn(min = 0.dp)
                        .onFocusChanged { inputFocused = it.isFocused },
                    singleLine = false,
                    minLines = 1,
                    maxLines = 4
                )
                M3IconButton(
                    icon = CareerIcons.Send,
                    label = "发送消息",
                    onClick = {
                        val clean = message.trim()
                        if (clean.isNotEmpty()) {
                            onSend(clean)
                        }
                    },
                    enabled = message.isNotBlank() && !chatBusy && !hasFailedMessage,
                    selected = true
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
                M3Button("查看今日", onNavigateToday, variant = M3ButtonVariant.Text)
                M3Button("查看目标", onNavigateGoal, variant = M3ButtonVariant.Text)
            }
        }
    }

    if (historyOpen) {
        M3ModalBottomSheet(onDismissRequest = { historyOpen = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        start = CareerSpacing.PageHorizontal,
                        end = CareerSpacing.PageHorizontal,
                        bottom = CareerSpacing.PageVertical
                    ),
                verticalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)
            ) {
                M3SectionTitle(
                    title = "历史会话",
                    supportingText = "选择一段讨论继续与穗奈交流"
                )
                when {
                    state.mentorHistoryLoading -> {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(CareerSpacing.Large),
                            horizontalArrangement = Arrangement.Center
                        ) {
                            M3CircularProgress(label = "正在加载历史会话")
                        }
                    }
                    state.mentorSessions.isEmpty() -> {
                        Text(
                            "还没有已保存的会话，发送第一条消息后会自动出现在这里。",
                            modifier = Modifier.padding(vertical = CareerSpacing.Large),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 520.dp)
                                .widthIn(max = 720.dp),
                            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                        ) {
                            items(state.mentorSessions, key = { it.id }) { session ->
                                M3Card(
                                    emphasized = session.id == state.mentorSessionId,
                                    modifier = Modifier.clickable {
                                        if (state.mentorSessionDeleting == null) {
                                            historyOpen = false
                                            onOpenSession(session.id)
                                        }
                                    }
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.Top,
                                        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                                    ) {
                                        Text(
                                            session.title,
                                            modifier = Modifier.weight(1f),
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                        M3OverflowMenu(
                                            label = "会话操作",
                                            enabled = state.mentorSessionDeleting == null,
                                            actions = listOf(
                                                M3MenuAction(
                                                    label = "删除会话",
                                                    icon = CareerIcons.Trash,
                                                    onClick = { sessionToDelete = session.id }
                                                )
                                            )
                                        )
                                    }
                                    if (state.mentorSessionDeleting == session.id) {
                                        Text(
                                            "正在删除…",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                    if (session.preview.isNotBlank()) {
                                        Text(
                                            session.preview,
                                            maxLines = 2,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Text(
                                        listOfNotNull(
                                            "${session.messageCount} 条消息",
                                            session.updatedAt?.replace('T', ' ')?.take(16)
                                        ).joinToString(" · "),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    sessionToDelete?.let { sessionId ->
        val session = state.mentorSessions.firstOrNull { it.id == sessionId }
        M3Dialog(
            title = "删除会话？",
            onDismiss = { if (state.mentorSessionDeleting == null) sessionToDelete = null },
            confirmLabel = "删除会话",
            confirmEnabled = state.mentorSessionDeleting == null,
            confirmDestructive = true,
            onConfirm = {
                if (sessionId == state.mentorSessionId) historyOpen = false
                sessionToDelete = null
                onDeleteSession(sessionId)
            }
        ) {
            Text("删除后，这段对话和其中的消息将无法恢复。不会删除你的个人档案、决策项目或行动计划。")
            session?.title?.takeIf { it.isNotBlank() }?.let {
                Text("将删除：$it", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MentorMessage(
    message: MentorMessageUi,
    onRetry: (String) -> Unit,
    onAction: (MentorActionUi) -> Unit,
    interactionsEnabled: Boolean
) {
    val fromUser = message.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (fromUser) {
            Arrangement.End
        } else {
            Arrangement.spacedBy(CareerSpacing.Small)
        },
        verticalAlignment = Alignment.Top
    ) {
        if (!fromUser) {
            AssistantAvatar(
                state = message.assistantVisualState(),
                size = AssistantAvatarSize.Small
            )
        }
        M3MessageBubble(
            fromUser = fromUser,
            modifier = if (fromUser) Modifier.fillMaxWidth(0.86f) else Modifier.weight(1f)
        ) {
            if (!fromUser && message.generationMode != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        if (message.generationMode == "llm") "模型生成" else "规则建议",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                    message.confidence?.let {
                        Text("可信度 ${(it * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
            Text(message.content, style = MaterialTheme.typography.bodyLarge)
            if (!fromUser && message.evidence.isNotEmpty()) {
                M3Divider()
                Text("依据", style = MaterialTheme.typography.labelLarge)
                message.evidence.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium) }
            }
            if (!fromUser && message.uncertainties.isNotEmpty()) {
                Text("仍需确认", style = MaterialTheme.typography.labelLarge)
                message.uncertainties.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium) }
            }
            message.nextStep?.takeIf { it.isNotBlank() }?.let {
                Text("下一步", style = MaterialTheme.typography.labelLarge)
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
            if (!fromUser && message.actions.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                    verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                ) {
                    message.actions.forEach { action ->
                        M3Button(
                            text = action.label,
                            onClick = { onAction(action) },
                            enabled = interactionsEnabled,
                            variant = M3ButtonVariant.Tonal
                        )
                    }
                }
            }
            if (message.pending) {
                Text("正在发送", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
            if (message.failed && message.requestId != null) {
                Text("发送失败", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
                M3Button(
                    text = "重试",
                    onClick = { onRetry(message.requestId) },
                    enabled = interactionsEnabled,
                    variant = M3ButtonVariant.Text,
                    icon = CareerIcons.Refresh
                )
            }
        }
    }
}

@Composable
private fun MentorThinkingMessage() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
        verticalAlignment = Alignment.Top
    ) {
        AssistantAvatar(
            state = AssistantVisualState.Thinking,
            size = AssistantAvatarSize.Small
        )
        M3MessageBubble(fromUser = false, modifier = Modifier.weight(1f)) {
            Text(
                "正在思考…",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/** Mirrors the response-state priority used by the Web AI mentor. */
internal fun MentorMessageUi.assistantVisualState(): AssistantVisualState {
    if (role != "assistant") return AssistantVisualState.Default
    if (confidence != null && confidence < 0.45) return AssistantVisualState.Warning
    if ((confidence != null && confidence < 0.62) || uncertainties.size >= 2) {
        return AssistantVisualState.Concerned
    }
    if (hasActions || !nextStep.isNullOrBlank()) return AssistantVisualState.Encouraging
    if (
        confidence != null ||
        generationMode != null ||
        evidence.isNotEmpty() ||
        uncertainties.isNotEmpty()
    ) {
        return AssistantVisualState.Explaining
    }
    return AssistantVisualState.Default
}

private fun AssistantVisualState.accessibilityLabel(): String = when (this) {
    AssistantVisualState.Default -> "穗奈"
    AssistantVisualState.Listening -> "穗奈正在聆听"
    AssistantVisualState.Thinking -> "穗奈正在思考"
    AssistantVisualState.Explaining -> "穗奈正在解释"
    AssistantVisualState.Concerned -> "穗奈提醒仍有信息需要确认"
    AssistantVisualState.Warning -> "穗奈提醒当前建议可信度较低"
    AssistantVisualState.Encouraging -> "穗奈给出了下一步行动"
    AssistantVisualState.Success -> "穗奈确认行动已完成"
}
