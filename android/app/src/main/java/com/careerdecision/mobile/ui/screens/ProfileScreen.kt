package com.careerdecision.mobile.ui.screens

import android.Manifest
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.careerdecision.mobile.network.UserProfile
import com.careerdecision.mobile.notification.reminder.NotificationPermissionStatus
import com.careerdecision.mobile.notification.reminder.ReminderGateway
import com.careerdecision.mobile.notification.reminder.ReminderPermission
import com.careerdecision.mobile.ui.AppUiState
import com.careerdecision.mobile.ui.LocalCareerThemeController
import com.careerdecision.mobile.ui.LocalCareerThemePreferences
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3Button
import com.careerdecision.mobile.ui.design.M3ButtonVariant
import com.careerdecision.mobile.ui.design.M3Card
import com.careerdecision.mobile.ui.design.M3ChoiceChip
import com.careerdecision.mobile.ui.design.M3ColorSwatch
import com.careerdecision.mobile.ui.design.M3Dialog
import com.careerdecision.mobile.ui.design.M3Divider
import com.careerdecision.mobile.ui.design.M3SectionTitle
import com.careerdecision.mobile.ui.design.M3SeedSchemeChoice
import com.careerdecision.mobile.ui.design.M3SegmentedControl
import com.careerdecision.mobile.ui.design.M3Slider
import com.careerdecision.mobile.ui.design.M3StatusBanner
import com.careerdecision.mobile.ui.design.M3SwitchRow
import com.careerdecision.mobile.ui.design.M3TextField
import com.careerdecision.mobile.ui.design.M3ThemePalettePreview
import com.careerdecision.mobile.ui.theme.ImageSeedExtractor
import com.careerdecision.mobile.ui.theme.CareerPresetSeedColors
import com.careerdecision.mobile.ui.theme.ThemeColorSource
import com.careerdecision.mobile.ui.theme.ThemeMode
import com.careerdecision.mobile.ui.theme.seedColorToComposeColor
import java.time.DayOfWeek
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private enum class ImageSelectionPurpose { PaletteOnly, BackgroundAndPalette }

private enum class LogoutDialogMode { Confirm, PendingOnline, PendingOffline }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(
    state: AppUiState,
    reminderGateway: ReminderGateway,
    onRefresh: () -> Unit,
    onSaveProfile: (String, String, String, String, String, onSaved: () -> Unit) -> Unit,
    onUpdateAiConsent: (Boolean) -> Unit,
    onOpenHistory: () -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val themePreferences = LocalCareerThemePreferences.current
    val themeController = LocalCareerThemeController.current
    val reminderPreferences by reminderGateway.preferences.collectAsStateWithLifecycle()
    val imageExtractor = remember(context) { ImageSeedExtractor(context) }
    var permissionStatus by remember { mutableStateOf(reminderGateway.permissionStatus()) }
    var editingProfile by rememberSaveable { mutableStateOf(false) }
    var imageBusy by remember { mutableStateOf(false) }
    var appearanceError by remember { mutableStateOf<String?>(null) }
    var pendingBackground by remember { mutableStateOf<Uri?>(null) }
    var candidateSeeds by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedImageSeed by remember { mutableStateOf<String?>(null) }
    var imageSelectionPurpose by remember { mutableStateOf<ImageSelectionPurpose?>(null) }
    var seedInput by remember(themePreferences.seedColor) { mutableStateOf(themePreferences.seedColor) }
    var showResetThemeDialog by rememberSaveable { mutableStateOf(false) }
    var logoutDialogMode by rememberSaveable { mutableStateOf<LogoutDialogMode?>(null) }
    var pendingAtLogout by rememberSaveable { mutableIntStateOf(0) }

    fun dismissImageSelection() {
        if (imageSelectionPurpose == ImageSelectionPurpose.BackgroundAndPalette) {
            imageExtractor.discardPreparedCandidate()
        }
        pendingBackground = null
        candidateSeeds = emptyList()
        selectedImageSeed = null
        imageSelectionPurpose = null
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        permissionStatus = reminderGateway.permissionStatus()
        if (
            reminderPreferences.enabled &&
            permissionStatus == NotificationPermissionStatus.REQUEST_REQUIRED
        ) {
            reminderGateway.updateEnabled(false)
        }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        reminderGateway.updateEnabled(granted)
        permissionStatus = reminderGateway.permissionStatus()
    }

    val backgroundPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                imageBusy = true
                appearanceError = null
                try {
                    imageExtractor.persistReadPermission(uri)
                    val seeds = imageExtractor.extract(uri)
                    val prepared = if (
                        imageSelectionPurpose == ImageSelectionPurpose.BackgroundAndPalette
                    ) {
                        imageExtractor.prepareBackground(uri)
                    } else {
                        null
                    }
                    pendingBackground = prepared
                    candidateSeeds = seeds
                    selectedImageSeed = seeds.firstOrNull()
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    appearanceError = error.message ?: "无法处理这张背景图片"
                    dismissImageSelection()
                } finally {
                    imageBusy = false
                }
            }
        } else {
            imageSelectionPurpose = null
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                horizontal = CareerSpacing.PageHorizontal,
                vertical = CareerSpacing.PageVertical
            ),
        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Large)
    ) {
        M3SectionTitle(
            title = "我的",
            supportingText = "账号、隐私、外观和设备提醒"
        )

        M3Card {
            Text(
                state.fullProfile?.displayName ?: state.user?.username.orEmpty(),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold
            )
            state.user?.email?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                profileSummary(state.fullProfile),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            M3Button(
                text = "编辑个人信息",
                onClick = { editingProfile = true },
                variant = M3ButtonVariant.Outlined,
                icon = CareerIcons.Profile
            )
        }

        M3Card {
            M3SectionTitle("同步状态")
            M3StatusBanner(
                text = if (state.online) "已连接 · 待同步 ${state.pendingCount} 项" else "离线 · 待同步 ${state.pendingCount} 项",
                icon = if (state.online) CareerIcons.Cloud else CareerIcons.CloudOff
            )
            M3Button(
                text = if (state.refreshing) "正在同步" else "立即同步",
                onClick = onRefresh,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.refreshing,
                loading = state.refreshing,
                variant = M3ButtonVariant.Outlined,
                icon = CareerIcons.Refresh
            )
        }

        M3Card {
            M3SectionTitle("隐私与 AI")
            M3SwitchRow(
                title = "允许外部 AI 模型",
                supportingText = if (state.fullProfile?.externalAiConsent == true) {
                    "已授权发送必要的职业决策上下文"
                } else {
                    "关闭时仅使用本地规则建议"
                },
                checked = state.fullProfile?.externalAiConsent == true,
                onCheckedChange = onUpdateAiConsent,
                enabled = state.fullProfile != null && !state.profileSaving,
                icon = CareerIcons.Shield
            )
        }

        M3Card {
                M3SectionTitle("通知与提醒")
                M3SwitchRow(
                    title = "行动提醒",
                    supportingText = when (permissionStatus) {
                        NotificationPermissionStatus.GRANTED -> "每日行动、任务截止与每周复盘提醒已可投递"
                        NotificationPermissionStatus.REQUEST_REQUIRED -> "开启时需要授予系统通知权限"
                        NotificationPermissionStatus.DISABLED -> "系统通知已关闭，可在系统设置中重新开启"
                    },
                    checked = reminderPreferences.enabled,
                    onCheckedChange = { enabled ->
                        if (
                            enabled &&
                            permissionStatus == NotificationPermissionStatus.REQUEST_REQUIRED &&
                            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        ) {
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            reminderGateway.updateEnabled(enabled)
                        }
                        permissionStatus = reminderGateway.permissionStatus()
                    },
                    icon = CareerIcons.Bell
                )
                if (permissionStatus != NotificationPermissionStatus.GRANTED) {
                    M3Button(
                        text = "通知系统设置",
                        onClick = { ReminderPermission.openSettings(context) },
                        variant = M3ButtonVariant.Text,
                        icon = CareerIcons.Settings
                    )
                }
                if (reminderPreferences.enabled) {
                    Text("每日行动摘要", style = MaterialTheme.typography.labelLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
                        listOf(8, 9, 10).forEach { hour ->
                            M3ChoiceChip(
                                "$hour:00",
                                selected = reminderPreferences.dailySummaryHour == hour,
                                onClick = { reminderGateway.updateDailySummaryHour(hour) }
                            )
                        }
                    }
                    Text("任务提前提醒", style = MaterialTheme.typography.labelLarge)
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                    ) {
                        listOf(0 to "到期时", 30 to "30 分钟", 60 to "1 小时", 180 to "3 小时", 1440 to "1 天")
                            .forEach { (minutes, label) ->
                                M3ChoiceChip(
                                    label,
                                    selected = reminderPreferences.taskLeadMinutes == minutes,
                                    onClick = { reminderGateway.updateTaskLeadMinutes(minutes) }
                                )
                            }
                    }
                    Text("每周复盘", style = MaterialTheme.typography.labelLarge)
                    M3SegmentedControl(
                        options = listOf(
                            DayOfWeek.FRIDAY to "周五",
                            DayOfWeek.SATURDAY to "周六",
                            DayOfWeek.SUNDAY to "周日"
                        ),
                        selected = reminderPreferences.weeklyReviewDay,
                        onSelected = {
                            reminderGateway.updateWeeklyReviewSchedule(it, reminderPreferences.weeklyReviewHour)
                        }
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
                        listOf(18, 20, 21).forEach { hour ->
                            M3ChoiceChip(
                                "$hour:00",
                                selected = reminderPreferences.weeklyReviewHour == hour,
                                onClick = {
                                    reminderGateway.updateWeeklyReviewSchedule(reminderPreferences.weeklyReviewDay, hour)
                                }
                            )
                        }
                    }
                }
        }

        M3Card {
                M3SectionTitle("主题与配色")
                M3SegmentedControl(
                    options = listOf(
                        ThemeMode.LIGHT to "浅色",
                        ThemeMode.DARK to "深色",
                        ThemeMode.SYSTEM to "跟随系统"
                    ),
                    selected = themePreferences.themeMode,
                    onSelected = { themeController.setThemeMode(it) }
                )
                Text("颜色来源", style = MaterialTheme.typography.labelLarge)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                    verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                ) {
                    listOf(
                        ThemeColorSource.BRAND to "品牌",
                        ThemeColorSource.SYSTEM to "系统动态颜色",
                        ThemeColorSource.CUSTOM_SEED to "自选颜色",
                        ThemeColorSource.CUSTOM_IMAGE to "图片取色"
                    ).forEach { (source, label) ->
                        M3ChoiceChip(
                            label,
                            selected = themePreferences.colorSource == source,
                            onClick = { themeController.setColorSource(source) }
                        )
                    }
                }
                Text(
                    text = when (themePreferences.colorSource) {
                        ThemeColorSource.BRAND -> "使用青穗集品牌种子生成完整的 Material 3 语义配色。"
                        ThemeColorSource.SYSTEM -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            "来自系统壁纸，颜色角色由 Android 动态颜色管理。"
                        } else {
                            "此设备不支持系统动态颜色，将使用青穗集品牌配色。"
                        }
                        ThemeColorSource.CUSTOM_SEED -> "选择一个种子色，系统会生成主色、辅色、强调色与表面色阶。"
                        ThemeColorSource.CUSTOM_IMAGE -> "从本机图片提取候选种子并生成完整配色，图片不会上传。"
                        ThemeColorSource.ACCOUNT -> "使用账号共享的配色设置。"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (themePreferences.colorSource == ThemeColorSource.CUSTOM_SEED) {
                    Text("种子色", style = MaterialTheme.typography.labelLarge)
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Medium),
                        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
                    ) {
                        CareerPresetSeedColors.forEach { preset ->
                            M3ColorSwatch(
                                color = seedColorToComposeColor(preset.value),
                                label = preset.label,
                                selected = themePreferences.seedColor.equals(preset.value, ignoreCase = true),
                                onClick = { themeController.setSeedColor(preset.value) }
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        M3TextField(
                            value = seedInput,
                            onValueChange = { seedInput = it },
                            label = "十六进制种子色",
                            modifier = Modifier.weight(1f)
                        )
                        M3Button(
                            text = "应用",
                            onClick = { themeController.setSeedColor(seedInput) },
                            variant = M3ButtonVariant.Outlined
                        )
                    }
                }
                if (themePreferences.colorSource == ThemeColorSource.CUSTOM_IMAGE) {
                    M3Button(
                        text = if (imageBusy) "正在提取配色" else "从图片提取配色",
                        onClick = {
                            imageSelectionPurpose = ImageSelectionPurpose.PaletteOnly
                            backgroundPicker.launch(ImageSeedExtractor.SupportedMimeTypes)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !imageBusy,
                        loading = imageBusy,
                        variant = M3ButtonVariant.Outlined,
                        icon = CareerIcons.Image
                    )
                    appearanceError?.let {
                        Text(
                            it,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
                if (themePreferences.colorSource != ThemeColorSource.SYSTEM) {
                    DeferredPreferenceSlider(
                        committedValue = themePreferences.contrastLevel.toFloat(),
                        onValueCommitted = { themeController.setContrastLevel(it.toDouble()) },
                        label = "对比度",
                        valueText = { value -> when {
                            value >= 0.5f -> "高"
                            value <= -0.5f -> "低"
                            else -> "标准"
                        } },
                        valueRange = -1f..1f,
                        steps = 3
                    )
                }
                M3ThemePalettePreview()
        }

        M3Card {
                M3SectionTitle("Android 背景")
                M3Button(
                    text = if (imageBusy) "正在处理图片" else "选择本机图片",
                    onClick = {
                        imageSelectionPurpose = ImageSelectionPurpose.BackgroundAndPalette
                        backgroundPicker.launch(ImageSeedExtractor.SupportedMimeTypes)
                    },
                    enabled = !imageBusy,
                    loading = imageBusy,
                    variant = M3ButtonVariant.Outlined,
                    icon = CareerIcons.Image
                )
                appearanceError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }
                if (themePreferences.hasBackground) {
                    M3SwitchRow(
                        title = "显示背景",
                        supportingText = "仅作用于 Android Page Canvas，不覆盖 Web 背景",
                        checked = themePreferences.backgroundEnabled,
                        onCheckedChange = { themeController.setBackgroundEnabled(it) },
                        icon = CareerIcons.Image
                    )
                    DeferredPreferenceSlider(
                        committedValue = themePreferences.scrimLevel.toFloat(),
                        onValueCommitted = { themeController.setBackgroundScrim(it.toDouble()) },
                        label = "背景遮罩",
                        valueText = { "${(it * 100).toInt()}%" },
                        valueRange = 0.2f..0.8f,
                        steps = 5
                    )
                    DeferredFocalPointSliders(
                        committedX = themePreferences.focalX.toFloat(),
                        committedY = themePreferences.focalY.toFloat(),
                        onValueCommitted = { x, y ->
                            themeController.setBackgroundFocalPoint(
                                x.toDouble(),
                                y.toDouble()
                            )
                        }
                    )
                    M3Button(
                        text = "移除 Android 背景",
                        onClick = {
                            themeController.clearBackground()
                            imageExtractor.clearPreparedBackground()
                        },
                        variant = M3ButtonVariant.Text,
                        icon = CareerIcons.Trash,
                        destructive = true
                    )
                }
                M3Button(
                    text = "恢复默认主题",
                    onClick = { showResetThemeDialog = true },
                    variant = M3ButtonVariant.Text,
                    icon = CareerIcons.Undo
                )
        }

        M3Card {
                M3Button(
                    text = "决策报告与历史记录",
                    onClick = onOpenHistory,
                    modifier = Modifier.fillMaxWidth(),
                    variant = M3ButtonVariant.Outlined,
                    icon = CareerIcons.History
                )
                M3Divider()
                M3Button(
                    text = "退出登录",
                    onClick = {
                        pendingAtLogout = state.pendingCount
                        logoutDialogMode = when {
                            state.pendingCount <= 0 -> LogoutDialogMode.Confirm
                            state.online -> LogoutDialogMode.PendingOnline
                            else -> LogoutDialogMode.PendingOffline
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    variant = M3ButtonVariant.Text,
                    icon = CareerIcons.LogOut,
                    destructive = true
                )
        }
    }

    if (editingProfile && state.fullProfile != null) {
        EditProfileDialog(
            profile = state.fullProfile,
            saving = state.profileSaving,
            onDismiss = {
                if (!state.profileSaving) editingProfile = false
            },
            onSave = { displayName, school, major, grade, city ->
                onSaveProfile(displayName, school, major, grade, city) {
                    editingProfile = false
                }
            }
        )
    }

    val selectionPurpose = imageSelectionPurpose
    if (selectionPurpose != null && candidateSeeds.isNotEmpty()) {
        val preparedBackground = pendingBackground
        M3Dialog(
            title = "选择图片配色",
            onDismiss = ::dismissImageSelection,
            confirmLabel = if (selectionPurpose == ImageSelectionPurpose.BackgroundAndPalette) {
                "应用配色并设置背景"
            } else {
                "应用配色"
            },
            onConfirm = {
                val seed = selectedImageSeed ?: return@M3Dialog
                if (
                    selectionPurpose == ImageSelectionPurpose.BackgroundAndPalette &&
                    preparedBackground != null
                ) {
                    themeController.setBackground(preparedBackground, seed)
                } else {
                    themeController.setSeedColor(seed, ThemeColorSource.CUSTOM_IMAGE)
                }
                pendingBackground = null
                candidateSeeds = emptyList()
                selectedImageSeed = null
                imageSelectionPurpose = null
            },
            confirmEnabled = selectedImageSeed != null &&
                (selectionPurpose != ImageSelectionPurpose.BackgroundAndPalette || preparedBackground != null)
        ) {
            Text(
                if (selectionPurpose == ImageSelectionPurpose.BackgroundAndPalette) {
                    "图片仅在本机处理；背景副本已校正方向并移除 EXIF 元数据。"
                } else {
                    "图片仅在本机取色，不会保存或上传原图。"
                }
            )
            candidateSeeds.forEachIndexed { index, seed ->
                M3SeedSchemeChoice(
                    seedColor = seed,
                    label = "候选颜色 ${index + 1}",
                    selected = selectedImageSeed == seed,
                    onClick = { selectedImageSeed = seed },
                    contrastLevel = themePreferences.contrastLevel
                )
            }
            if (selectionPurpose == ImageSelectionPurpose.BackgroundAndPalette) {
                M3Button(
                    text = "仅应用配色",
                    onClick = {
                        val seed = selectedImageSeed ?: return@M3Button
                        themeController.setSeedColor(seed, ThemeColorSource.CUSTOM_IMAGE)
                        dismissImageSelection()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = selectedImageSeed != null,
                    variant = M3ButtonVariant.Outlined
                )
            }
        }
    }

    if (showResetThemeDialog) {
        M3Dialog(
            title = "恢复默认主题？",
            onDismiss = { showResetThemeDialog = false },
            confirmLabel = "恢复默认",
            confirmDestructive = true,
            onConfirm = {
                showResetThemeDialog = false
                themeController.resetTheme()
            }
        ) {
            Text("将恢复主题模式、品牌配色和对比度，并移除 Android 本机背景。账号与业务数据不受影响。")
        }
    }

    logoutDialogMode?.let { mode ->
        M3Dialog(
            title = when (mode) {
                LogoutDialogMode.Confirm -> "退出登录？"
                LogoutDialogMode.PendingOnline,
                LogoutDialogMode.PendingOffline -> "暂不能退出登录"
            },
            onDismiss = { logoutDialogMode = null },
            confirmLabel = when (mode) {
                LogoutDialogMode.Confirm -> "退出登录"
                LogoutDialogMode.PendingOnline -> "立即同步"
                LogoutDialogMode.PendingOffline -> "知道了"
            },
            confirmDestructive = mode == LogoutDialogMode.Confirm,
            onConfirm = {
                logoutDialogMode = null
                when (mode) {
                    LogoutDialogMode.Confirm -> onLogout()
                    LogoutDialogMode.PendingOnline -> onRefresh()
                    LogoutDialogMode.PendingOffline -> Unit
                }
            }
        ) {
            Text(
                when (mode) {
                    LogoutDialogMode.Confirm ->
                        "退出后将清理本机登录会话、缓存和提醒，服务端数据仍会保留。"
                    LogoutDialogMode.PendingOnline ->
                        "还有 $pendingAtLogout 项操作等待同步。为避免丢失本机更改，请先完成同步。"
                    LogoutDialogMode.PendingOffline ->
                        "还有 $pendingAtLogout 项操作等待同步。请连接网络并完成同步后再退出。"
                }
            )
        }
    }
}

@Composable
private fun DeferredPreferenceSlider(
    committedValue: Float,
    onValueCommitted: (Float) -> Unit,
    label: String,
    valueText: (Float) -> String,
    valueRange: ClosedFloatingPointRange<Float>,
    steps: Int = 0
) {
    var draftValue by remember(committedValue) { mutableFloatStateOf(committedValue) }
    M3Slider(
        value = draftValue,
        onValueChange = { draftValue = it },
        onValueChangeFinished = { onValueCommitted(draftValue) },
        label = label,
        valueText = valueText(draftValue),
        valueRange = valueRange,
        steps = steps
    )
}

@Composable
private fun DeferredFocalPointSliders(
    committedX: Float,
    committedY: Float,
    onValueCommitted: (Float, Float) -> Unit
) {
    var draftX by remember(committedX) { mutableFloatStateOf(committedX) }
    var draftY by remember(committedY) { mutableFloatStateOf(committedY) }
    M3Slider(
        value = draftX,
        onValueChange = { draftX = it },
        onValueChangeFinished = { onValueCommitted(draftX, draftY) },
        label = "水平焦点",
        valueText = "${(draftX * 100).toInt()}%",
        valueRange = 0f..1f
    )
    M3Slider(
        value = draftY,
        onValueChange = { draftY = it },
        onValueChangeFinished = { onValueCommitted(draftX, draftY) },
        label = "垂直焦点",
        valueText = "${(draftY * 100).toInt()}%",
        valueRange = 0f..1f
    )
}

private fun profileSummary(profile: UserProfile?): String {
    if (profile == null) return "个人信息正在同步"
    return listOfNotNull(profile.school, profile.major, profile.grade, profile.city)
        .filter(String::isNotBlank)
        .joinToString(" · ")
        .ifBlank { "个人信息尚未补充" }
}

@Composable
private fun EditProfileDialog(
    profile: UserProfile,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (String, String, String, String, String) -> Unit
) {
    var displayName by rememberSaveable(profile.profileVersion) { mutableStateOf(profile.displayName.orEmpty()) }
    var school by rememberSaveable(profile.profileVersion) { mutableStateOf(profile.school.orEmpty()) }
    var major by rememberSaveable(profile.profileVersion) { mutableStateOf(profile.major.orEmpty()) }
    var grade by rememberSaveable(profile.profileVersion) { mutableStateOf(profile.grade.orEmpty()) }
    var city by rememberSaveable(profile.profileVersion) { mutableStateOf(profile.city.orEmpty()) }

    M3Dialog(
        title = "编辑个人信息",
        onDismiss = onDismiss,
        confirmLabel = if (saving) "正在保存" else "保存",
        onConfirm = { onSave(displayName, school, major, grade, city) },
        confirmEnabled = !saving
    ) {
        M3TextField(displayName, { displayName = it }, "称呼")
        M3TextField(school, { school = it }, "学校")
        M3TextField(major, { major = it }, "专业")
        M3TextField(grade, { grade = it }, "年级")
        M3TextField(city, { city = it }, "所在城市")
    }
}
