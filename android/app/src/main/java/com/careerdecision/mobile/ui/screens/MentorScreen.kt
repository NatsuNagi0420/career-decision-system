package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CheckCircleOutline
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.careerdecision.mobile.ui.AppUiState

private val mentorQuickPrompts = listOf(
    "今天先做什么",
    "当前任务卡住了怎么办",
    "解释一个岗位要求",
    "如何证明某项能力",
    "是否需要调整本周计划"
)

@Composable
fun MentorScreen(
    state: AppUiState,
    onAsk: (String?) -> Unit,
    onNavigateToday: () -> Unit,
    onNavigateGoal: () -> Unit
) {
    var focus by remember { mutableStateOf("") }
    val result = state.mentor

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("AI 导师", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(
            state.goal?.targetRole ?: "尚未确认行动目标",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            mentorQuickPrompts.forEach { prompt ->
                OutlinedButton(
                    onClick = { focus = prompt; onAsk(prompt) },
                    enabled = !state.mentorLoading && state.goal?.planId != null,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(prompt)
                }
            }
        }
        OutlinedTextField(
            value = focus,
            onValueChange = { focus = it },
            label = { Text("这次想重点讨论什么") },
            minLines = 3,
            maxLines = 5,
            modifier = Modifier.fillMaxWidth()
        )
        Button(
            onClick = { onAsk(focus) },
            enabled = !state.mentorLoading && state.goal?.planId != null,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (state.mentorLoading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else Icon(Icons.Outlined.AutoAwesome, contentDescription = null)
            Spacer(Modifier.width(7.dp))
            Text(if (state.mentorLoading) "正在分析" else "获取行动建议")
        }

        if (result != null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    if (result.generationMode == "llm") "模型建议" else "规则建议",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
                Text("可信度 ${(result.confidence * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
            }
            InsightSection(Icons.Outlined.CheckCircleOutline, "结论") {
                Text(result.conclusion)
            }
            InsightSection(Icons.AutoMirrored.Outlined.FactCheck, "依据") {
                if (result.evidenceBasis.isEmpty()) Text("当前没有足够依据")
                result.evidenceBasis.forEach { item -> Text("• ${item.statement}") }
            }
            InsightSection(Icons.AutoMirrored.Outlined.HelpOutline, "不确定性") {
                if (result.uncertainties.isEmpty()) Text("暂无新增不确定性")
                result.uncertainties.forEach { item -> Text("• $item") }
            }
            InsightSection(Icons.Outlined.AutoAwesome, "下一步") {
                result.nextActions.forEach { item ->
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(item.title, fontWeight = FontWeight.SemiBold)
                        Text(item.rationale, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                OutlinedButton(onClick = onNavigateToday, modifier = Modifier.weight(1f)) {
                    Text("查看今日")
                }
                OutlinedButton(onClick = onNavigateGoal, modifier = Modifier.weight(1f)) {
                    Text("查看目标")
                }
            }
        }
    }
}

@Composable
private fun InsightSection(icon: ImageVector, title: String, content: @Composable () -> Unit) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
            content()
        }
    }
}
