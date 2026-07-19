package com.careerdecision.mobile.ui.design

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.careerdecision.mobile.ui.theme.MaterialColorSchemeGenerator

enum class M3ButtonVariant { Filled, Tonal, Outlined, Text }

data class M3MenuAction(
    val label: String,
    val icon: ImageVector? = null,
    val onClick: () -> Unit
)

@Composable
fun M3Button(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    variant: M3ButtonVariant = M3ButtonVariant.Filled,
    icon: ImageVector? = null,
    loading: Boolean = false,
    destructive: Boolean = false
) {
    val content: @Composable RowScope.() -> Unit = {
        when {
            loading -> CircularProgressIndicator(
                modifier = Modifier.size(CareerSize.CompactIcon),
                strokeWidth = 2.dp
            )
            icon != null -> Icon(icon, contentDescription = null, modifier = Modifier.size(CareerSize.CompactIcon))
        }
        if (loading || icon != null) Spacer(Modifier.size(CareerSpacing.Small))
        Text(text)
    }
    val stableModifier = modifier.defaultMinSize(minHeight = CareerSize.TouchTarget)
    when (variant) {
        M3ButtonVariant.Filled -> Button(
            onClick = onClick,
            modifier = stableModifier,
            enabled = enabled && !loading,
            colors = if (destructive) {
                ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError
                )
            } else {
                ButtonDefaults.buttonColors()
            },
            content = content
        )
        M3ButtonVariant.Tonal -> FilledTonalButton(
            onClick = onClick,
            modifier = stableModifier,
            enabled = enabled && !loading,
            colors = if (destructive) {
                ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer
                )
            } else {
                ButtonDefaults.filledTonalButtonColors()
            },
            content = content
        )
        M3ButtonVariant.Outlined -> OutlinedButton(
            onClick = onClick,
            modifier = stableModifier,
            enabled = enabled && !loading,
            colors = if (destructive) {
                ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
            } else {
                ButtonDefaults.outlinedButtonColors()
            },
            content = content
        )
        M3ButtonVariant.Text -> TextButton(
            onClick = onClick,
            modifier = stableModifier,
            enabled = enabled && !loading,
            colors = if (destructive) {
                ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
            } else {
                ButtonDefaults.textButtonColors()
            },
            content = content
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun M3IconButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    selected: Boolean = false
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(label) } },
        state = rememberTooltipState()
    ) {
        IconButton(
            onClick = onClick,
            modifier = modifier.defaultMinSize(CareerSize.TouchTarget, CareerSize.TouchTarget),
            enabled = enabled,
            colors = if (selected) {
                IconButtonDefaults.filledTonalIconButtonColors()
            } else {
                IconButtonDefaults.iconButtonColors()
            }
        ) {
            Icon(icon, contentDescription = label, modifier = Modifier.size(CareerSize.Icon))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun M3ModalBottomSheet(
    onDismissRequest: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    ModalBottomSheet(onDismissRequest = onDismissRequest, content = content)
}

@Composable
fun M3CircularProgress(
    modifier: Modifier = Modifier,
    label: String = "正在加载"
) {
    CircularProgressIndicator(
        modifier = modifier.semantics { contentDescription = label }
    )
}

@Composable
fun M3TextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    supportingText: String? = null,
    error: String? = null,
    leadingIcon: ImageVector? = null,
    trailingContent: (@Composable () -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        isError = error != null,
        supportingText = when {
            error != null -> ({ Text(error) })
            supportingText != null -> ({ Text(supportingText) })
            else -> null
        },
        leadingIcon = leadingIcon?.let { vector -> ({ Icon(vector, contentDescription = null) }) },
        trailingIcon = trailingContent,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLowest
        )
    )
}

@Composable
fun M3TextArea(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    supportingText: String? = null,
    error: String? = null,
    minLines: Int = 3,
    maxLines: Int = 8
) = M3TextField(
    value = value,
    onValueChange = onValueChange,
    label = label,
    modifier = modifier,
    singleLine = false,
    minLines = minLines,
    maxLines = maxLines,
    supportingText = supportingText,
    error = error
)

@Composable
fun M3Card(
    modifier: Modifier = Modifier,
    emphasized: Boolean = false,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (emphasized) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainerLowest
            }
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = MaterialTheme.shapes.medium
    ) {
        Column(
            modifier = Modifier.padding(CareerSpacing.Large),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)
        ) {
            content()
        }
    }
}

@Composable
fun M3SectionTitle(
    title: String,
    modifier: Modifier = Modifier,
    supportingText: String? = null
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)) {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        supportingText?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun M3StatusBanner(
    text: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    isError: Boolean = false
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = if (isError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer,
        contentColor = if (isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer,
        shape = MaterialTheme.shapes.small
    ) {
        androidx.compose.foundation.layout.Row(
            modifier = Modifier.padding(horizontal = CareerSpacing.Medium, vertical = CareerSpacing.Small),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(CareerSize.CompactIcon))
            Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun M3EmptyState(
    title: String,
    description: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        shape = MaterialTheme.shapes.large
    ) {
        Column(
            modifier = Modifier.padding(CareerSpacing.ExtraLarge),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (actionLabel != null && onAction != null) {
                Spacer(Modifier.height(CareerSpacing.ExtraSmall))
                M3Button(actionLabel, onAction)
            }
        }
    }
}

@Composable
fun M3LinearProgress(progress: Int, modifier: Modifier = Modifier) {
    LinearProgressIndicator(
        progress = { progress.coerceIn(0, 100) / 100f },
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.primary,
        trackColor = MaterialTheme.colorScheme.surfaceContainerHighest
    )
}

@Composable
fun <T> M3SegmentedControl(
    options: List<Pair<T, String>>,
    selected: T,
    onSelected: (T) -> Unit,
    modifier: Modifier = Modifier
) {
    SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth()) {
        options.forEachIndexed { index, option ->
            SegmentedButton(
                selected = selected == option.first,
                onClick = { onSelected(option.first) },
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                label = { Text(option.second, maxLines = 1) }
            )
        }
    }
}

@Composable
fun M3SwitchRow(
    title: String,
    supportingText: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null
) {
    androidx.compose.foundation.layout.Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = CareerSize.TouchTarget),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)
    ) {
        icon?.let { Icon(it, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(
                supportingText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}

@Composable
fun M3Slider(
    value: Float,
    onValueChange: (Float) -> Unit,
    label: String,
    valueText: String,
    valueRange: ClosedFloatingPointRange<Float>,
    modifier: Modifier = Modifier,
    steps: Int = 0,
    onValueChangeFinished: (() -> Unit)? = null
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)) {
        androidx.compose.foundation.layout.Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Text(valueText, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            onValueChangeFinished = onValueChangeFinished,
            valueRange = valueRange,
            steps = steps
        )
    }
}

@Composable
fun M3Divider(modifier: Modifier = Modifier) {
    HorizontalDivider(modifier, color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
fun M3Dialog(
    title: String,
    onDismiss: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
    confirmEnabled: Boolean = true,
    confirmDestructive: Boolean = false,
    dismissLabel: String = "取消",
    content: @Composable () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = modifier,
        title = { Text(title, style = MaterialTheme.typography.headlineSmall) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)
            ) {
                content()
            }
        },
        confirmButton = {
            M3Button(
                confirmLabel,
                onConfirm,
                enabled = confirmEnabled,
                destructive = confirmDestructive
            )
        },
        dismissButton = {
            M3Button(dismissLabel, onDismiss, variant = M3ButtonVariant.Text)
        },
        shape = MaterialTheme.shapes.extraLarge,
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
    )
}

@Composable
fun M3ChoiceChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        modifier = modifier.defaultMinSize(minHeight = CareerSize.TouchTarget)
    )
}

@Composable
fun M3ActionChip(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null
) {
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        modifier = modifier.defaultMinSize(minHeight = CareerSize.TouchTarget),
        leadingIcon = icon?.let { vector -> ({ Icon(vector, contentDescription = null) }) }
    )
}

@Composable
fun M3MessageBubble(
    fromUser: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.large,
        color = if (fromUser) {
            MaterialTheme.colorScheme.secondaryContainer
        } else {
            MaterialTheme.colorScheme.surfaceContainerLow
        },
        contentColor = if (fromUser) {
            MaterialTheme.colorScheme.onSecondaryContainer
        } else {
            MaterialTheme.colorScheme.onSurface
        }
    ) {
        Column(
            modifier = Modifier.padding(CareerSpacing.Medium),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
        ) {
            content()
        }
    }
}

@Composable
fun M3OverflowMenu(
    label: String,
    actions: List<M3MenuAction>,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        M3IconButton(
            icon = CareerIcons.MoreVertical,
            label = label,
            onClick = { expanded = true },
            enabled = enabled
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            actions.forEach { action ->
                DropdownMenuItem(
                    text = { Text(action.label) },
                    onClick = {
                        expanded = false
                        action.onClick()
                    },
                    leadingIcon = action.icon?.let { vector -> ({ Icon(vector, contentDescription = null) }) }
                )
            }
        }
    }
}

@Composable
fun M3ColorSwatch(
    color: Color,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(CareerSize.TouchTarget)
            .semantics { contentDescription = label }
            .clip(CircleShape)
            .background(color)
            .border(
                width = if (selected) 3.dp else 1.dp,
                color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline,
                shape = CircleShape
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        if (selected) {
            Icon(
                CareerIcons.Check,
                contentDescription = null,
                tint = if (color.luminance() > 0.5f) Color.Black else Color.White
            )
        }
    }
}

@Composable
fun M3ThemePalettePreview(modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
    ) {
        Text("当前语义色", style = MaterialTheme.typography.labelLarge)
        ThemeRoleRow(scheme)
    }
}

@Composable
fun M3SeedSchemeChoice(
    seedColor: String,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    contrastLevel: Double = 0.0
) {
    val lightScheme = remember(seedColor, contrastLevel) {
        MaterialColorSchemeGenerator.generate(
            seedColor = seedColor,
            dark = false,
            contrastLevel = contrastLevel
        )
    }
    val darkScheme = remember(seedColor, contrastLevel) {
        MaterialColorSchemeGenerator.generate(
            seedColor = seedColor,
            dark = true,
            contrastLevel = contrastLevel
        )
    }
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .selectable(
                selected = selected,
                onClick = onClick,
                role = Role.RadioButton
            ),
        color = if (selected) {
            MaterialTheme.colorScheme.secondaryContainer
        } else {
            MaterialTheme.colorScheme.surfaceContainerLow
        },
        contentColor = if (selected) {
            MaterialTheme.colorScheme.onSecondaryContainer
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(
            width = if (selected) 2.dp else 1.dp,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(CareerSpacing.Medium),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)
        ) {
            androidx.compose.foundation.layout.Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(label, style = MaterialTheme.typography.labelLarge)
                if (selected) {
                    Icon(
                        CareerIcons.Check,
                        contentDescription = "已选择",
                        modifier = Modifier.size(CareerSize.CompactIcon)
                    )
                }
            }
            Text("浅色", style = MaterialTheme.typography.labelSmall)
            ThemeRoleRow(lightScheme)
            Text("深色", style = MaterialTheme.typography.labelSmall)
            ThemeRoleRow(darkScheme)
        }
    }
}

@Composable
private fun ThemeRoleRow(scheme: ColorScheme) {
    val roles = listOf(
        Triple("主色", scheme.primary, scheme.onPrimary),
        Triple("辅色", scheme.secondary, scheme.onSecondary),
        Triple("强调", scheme.tertiary, scheme.onTertiary),
        Triple("表面", scheme.surfaceContainer, scheme.onSurface)
    )
    androidx.compose.foundation.layout.Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraSmall)
    ) {
        roles.forEach { (label, container, content) ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(CareerSize.TouchTarget)
                    .clip(MaterialTheme.shapes.small)
                    .background(container),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    color = content,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1
                )
            }
        }
    }
}
