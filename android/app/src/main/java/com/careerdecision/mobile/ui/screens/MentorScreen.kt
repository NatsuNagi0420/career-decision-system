package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.careerdecision.mobile.ui.AppUiState
import com.careerdecision.mobile.ui.MentorMessageUi
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3ActionChip
import com.careerdecision.mobile.ui.design.M3Button
import com.careerdecision.mobile.ui.design.M3ButtonVariant
import com.careerdecision.mobile.ui.design.M3Divider
import com.careerdecision.mobile.ui.design.M3IconButton
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
    onNavigateToday: () -> Unit,
    onNavigateGoal: () -> Unit
) {
    var message by rememberSaveable { mutableStateOf("") }
    var observedAcceptedVersion by remember { mutableLongStateOf(state.chatSendAcceptedVersion) }
    val listState = rememberLazyListState()
    val hasFailedMessage = state.mentorMessages.any { it.failed }

    LaunchedEffect(state.chatSendAcceptedVersion) {
        if (state.chatSendAcceptedVersion != observedAcceptedVersion) {
            // Clear only after the repository confirms delivery. Failed or pending
            // messages keep the draft available for the user.
            message = ""
            observedAcceptedVersion = state.chatSendAcceptedVersion
        }
    }

    LaunchedEffect(state.mentorMessages.size) {
        if (state.mentorMessages.isNotEmpty()) {
            listState.animateScrollToItem(state.mentorMessages.lastIndex)
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
            M3SectionTitle(
                title = "AI 导师",
                supportingText = state.goal?.targetRole ?: "围绕当前职业决策持续讨论",
                modifier = Modifier.weight(1f)
            )
            M3IconButton(
                icon = CareerIcons.NewChat,
                label = "开始新会话",
                onClick = onNewConversation,
                enabled = !state.chatLoading
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
                    M3MessageBubble(fromUser = false, modifier = Modifier.fillMaxWidth()) {
                        Text("从一个具体问题开始", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            "我会结合当前目标、行动计划和最近任务给出下一步建议。",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                item {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                    ) {
                        if (!hasFailedMessage) {
                            mentorQuickPrompts.forEach { prompt ->
                                M3ActionChip(prompt, onClick = { onSend(prompt) })
                            }
                        }
                    }
                }
            }
            items(state.mentorMessages, key = { it.localId }) { item ->
                MentorMessage(item, onRetry)
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
                    enabled = !hasFailedMessage && !state.chatLoading,
                    modifier = Modifier
                        .weight(1f)
                        .widthIn(min = 0.dp),
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
                    enabled = message.isNotBlank() && !state.chatLoading && !hasFailedMessage,
                    selected = true
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
                M3Button("查看今日", onNavigateToday, variant = M3ButtonVariant.Text)
                M3Button("查看目标", onNavigateGoal, variant = M3ButtonVariant.Text)
            }
        }
    }
}

@Composable
private fun MentorMessage(message: MentorMessageUi, onRetry: (String) -> Unit) {
    val fromUser = message.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (fromUser) Arrangement.End else Arrangement.Start
    ) {
        M3MessageBubble(
            fromUser = fromUser,
            modifier = Modifier.fillMaxWidth(if (fromUser) 0.86f else 1f)
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
            if (message.pending) {
                Text("正在发送", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
            if (message.failed && message.requestId != null) {
                Text("发送失败", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
                M3Button(
                    text = "重试",
                    onClick = { onRetry(message.requestId) },
                    variant = M3ButtonVariant.Text,
                    icon = CareerIcons.Refresh
                )
            }
        }
    }
}
