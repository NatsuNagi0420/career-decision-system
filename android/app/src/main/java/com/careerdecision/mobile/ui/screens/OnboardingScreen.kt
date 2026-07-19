package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import com.careerdecision.mobile.CareerValidators
import com.careerdecision.mobile.data.local.OnboardingDraft
import com.careerdecision.mobile.data.local.OnboardingDraftStore
import com.careerdecision.mobile.ui.design.BrandIdentity
import com.careerdecision.mobile.ui.design.CareerSize
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3Button
import com.careerdecision.mobile.ui.design.M3ButtonVariant
import com.careerdecision.mobile.ui.design.M3Card
import com.careerdecision.mobile.ui.design.M3ChoiceChip
import com.careerdecision.mobile.ui.design.M3LinearProgress
import com.careerdecision.mobile.ui.design.M3TextArea
import com.careerdecision.mobile.ui.design.M3TextField
import com.careerdecision.mobile.ui.OnboardingForm

data class OnboardingInitialData(
    val displayName: String = "",
    val school: String = "",
    val major: String = "",
    val grade: String = "",
    val city: String = "",
    val currentConfusion: String = "",
    val existingDirections: List<String> = emptyList(),
    val weeklyAvailableMinutes: Int = 300
)

@Composable
fun OnboardingScreen(
    userId: Long,
    initialData: OnboardingInitialData,
    saving: Boolean,
    onComplete: (OnboardingForm, onSaved: () -> Unit) -> Unit
) {
    val context = LocalContext.current
    val draftStore = remember(context) { OnboardingDraftStore(context) }
    val savedDraft = remember(userId) { draftStore.load(userId) }
    var step by remember(userId) { mutableIntStateOf(savedDraft?.step ?: 1) }
    var displayName by remember(userId) { mutableStateOf(savedDraft?.displayName ?: initialData.displayName) }
    var school by remember(userId) { mutableStateOf(savedDraft?.school ?: initialData.school) }
    var major by remember(userId) { mutableStateOf(savedDraft?.major ?: initialData.major) }
    var grade by remember(userId) { mutableStateOf(savedDraft?.grade ?: initialData.grade) }
    var city by remember(userId) { mutableStateOf(savedDraft?.city ?: initialData.city) }
    var currentConfusion by remember(userId) {
        mutableStateOf(savedDraft?.currentConfusion ?: initialData.currentConfusion)
    }
    var directions by remember(userId) {
        mutableStateOf(savedDraft?.existingDirections ?: initialData.existingDirections.joinToString("、"))
    }
    var weeklyHours by remember(userId) {
        mutableIntStateOf(savedDraft?.weeklyHours ?: (initialData.weeklyAvailableMinutes / 60).coerceIn(0, 40))
    }
    var submitted by remember { mutableStateOf(false) }

    val canContinue = when (step) {
        1 -> major.isNotBlank() && grade.isNotBlank()
        2 -> currentConfusion.isNotBlank()
        else -> weeklyHours in 0..40
    }

    LaunchedEffect(
        step,
        displayName,
        school,
        major,
        grade,
        city,
        currentConfusion,
        directions,
        weeklyHours
    ) {
        draftStore.save(
            userId,
            OnboardingDraft(
                step = step,
                displayName = displayName,
                school = school,
                major = major,
                grade = grade,
                city = city,
                currentConfusion = currentConfusion,
                existingDirections = directions,
                weeklyHours = weeklyHours
            )
        )
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(
            modifier = Modifier
                .widthIn(max = CareerSize.CompactContentMax)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = CareerSpacing.PageHorizontal, vertical = CareerSpacing.PageVertical),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Large)
        ) {
            BrandIdentity(showAvatar = false, showDescriptor = false, compact = true)
            Column(verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
                Text("$step / 3", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text(
                    when (step) {
                        1 -> "先了解你的当前阶段"
                        2 -> "你现在最需要做什么决定？"
                        else -> "确定可投入时间，然后开始"
                    },
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    when (step) {
                        1 -> "只收集开始第一次职业决策所需的信息，其他档案以后再补。"
                        2 -> "把大问题缩小到未来几个月能够验证的选择。"
                        else -> "行动计划应该服从真实可用时间，不需要一开始承诺很多。"
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            M3LinearProgress(step * 100 / 3)
            M3Card {
                when (step) {
                    1 -> {
                        M3TextField(displayName, { displayName = it }, "称呼（选填）")
                        M3TextField(school, { school = it }, "学校（选填）")
                        M3TextField(
                            major,
                            { major = it },
                            "专业",
                            error = if (major.isBlank() && submitted) "请填写专业" else null
                        )
                        GradeSelector(grade, { grade = it })
                        M3TextField(city, { city = it }, "所在城市（选填）")
                    }
                    2 -> {
                        M3TextArea(
                            currentConfusion,
                            { currentConfusion = it },
                            "当前困惑",
                            supportingText = "例如：未来三个月，我应该优先准备 Java 后端还是数据分析？",
                            error = if (currentConfusion.isBlank() && submitted) "请描述当前最需要解决的问题" else null,
                            minLines = 4
                        )
                        M3TextField(
                            directions,
                            { directions = it },
                            "已经想到的方向（选填）",
                            singleLine = false,
                            minLines = 2,
                            supportingText = "使用逗号或顿号分隔，最多保留 5 个"
                        )
                    }
                    else -> {
                        Text("每周大约可投入", style = MaterialTheme.typography.labelLarge)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            M3Button(
                                text = "减少",
                                onClick = { weeklyHours = (weeklyHours - 1).coerceAtLeast(0) },
                                variant = M3ButtonVariant.Outlined
                            )
                            Text("$weeklyHours 小时", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                            M3Button(
                                text = "增加",
                                onClick = { weeklyHours = (weeklyHours + 1).coerceAtMost(40) },
                                variant = M3ButtonVariant.Outlined
                            )
                        }
                        Text(
                            "完成后进入行动端。职业探索、候选比较和完整计划编辑仍在 Web 工作区进行。",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            Spacer(Modifier.height(CareerSpacing.ExtraSmall))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (step > 1) {
                    M3Button("上一步", { step -= 1 }, variant = M3ButtonVariant.Outlined)
                } else {
                    Spacer(Modifier.weight(1f))
                }
                if (step < 3) {
                    M3Button(
                        text = "下一步",
                        onClick = {
                            submitted = true
                            if (canContinue) {
                                submitted = false
                                step += 1
                            }
                        },
                        enabled = canContinue
                    )
                } else {
                    M3Button(
                        text = if (saving) "正在保存" else "完成并开始",
                        onClick = {
                            submitted = true
                            if (canContinue) {
                                val form = OnboardingForm(
                                    displayName = displayName.trim(),
                                    school = school.trim(),
                                    major = major.trim(),
                                    grade = grade,
                                    city = city.trim(),
                                    currentConfusion = currentConfusion.trim(),
                                    existingDirections = CareerValidators.splitValues(directions).take(5),
                                    weeklyAvailableMinutes = weeklyHours * 60
                                )
                                onComplete(form) { draftStore.clear(userId) }
                            }
                        },
                        enabled = canContinue && !saving,
                        loading = saving
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GradeSelector(selected: String, onSelected: (String) -> Unit) {
    val grades = listOf("大一", "大二", "大三", "大四", "研一", "研二", "研三", "已毕业")
    Column(verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
        Text("当前年级", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
        ) {
            grades.forEach { grade ->
                M3ChoiceChip(
                    label = grade,
                    selected = selected == grade,
                    onClick = { onSelected(grade) }
                )
            }
        }
    }
}
