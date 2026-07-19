package com.careerdecision.mobile.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.materialkolor.blend.Blend
import com.materialkolor.dynamiccolor.DynamicColor
import com.materialkolor.dynamiccolor.MaterialDynamicColors
import com.materialkolor.hct.Hct
import com.materialkolor.palettes.CorePalette
import com.materialkolor.scheme.DynamicScheme
import com.materialkolor.scheme.SchemeTonalSpot

data class PresetSeedColor(val label: String, val value: String)

val CareerPresetSeedColors = listOf(
    PresetSeedColor("青穗集品牌色", DEFAULT_SEED_COLOR),
    PresetSeedColor("远山蓝", "#2f5f8f"),
    PresetSeedColor("花楸红", "#8b4a54"),
    PresetSeedColor("鸢尾紫", "#67507e"),
    PresetSeedColor("琥珀棕", "#785a2f")
)

fun seedColorToComposeColor(seedColor: String): Color =
    Color(MaterialColorSchemeGenerator.argbFromHex(seedColor))

@Immutable
data class CareerExtendedColors(
    val success: Color,
    val onSuccess: Color,
    val successContainer: Color,
    val onSuccessContainer: Color,
    val warning: Color,
    val onWarning: Color,
    val warningContainer: Color,
    val onWarningContainer: Color,
    val info: Color,
    val onInfo: Color,
    val infoContainer: Color,
    val onInfoContainer: Color,
    val shadow: Color,
    val isDark: Boolean,
    val isSystemDynamic: Boolean = false
)

internal val LocalCareerExtendedColors = staticCompositionLocalOf {
    MaterialColorSchemeGenerator.extendedColors(DEFAULT_SEED_COLOR, dark = false)
}

object MaterialColorSchemeGenerator {
    fun generate(
        seedColor: String,
        dark: Boolean,
        contrastLevel: Double = 0.0
    ): ColorScheme {
        val sourceArgb = argbFromHex(normalizeSeedColor(seedColor))
        val scheme = SchemeTonalSpot(
            sourceColorHct = Hct.fromInt(sourceArgb),
            isDark = dark,
            contrastLevel = contrastLevel.takeIf(Double::isFinite)?.coerceIn(-1.0, 1.0) ?: 0.0
        )
        val colors = MaterialDynamicColors()
        return ColorScheme(
            primary = colors.value(colors.primary(), scheme),
            onPrimary = colors.value(colors.onPrimary(), scheme),
            primaryContainer = colors.value(colors.primaryContainer(), scheme),
            onPrimaryContainer = colors.value(colors.onPrimaryContainer(), scheme),
            inversePrimary = colors.value(colors.inversePrimary(), scheme),
            secondary = colors.value(colors.secondary(), scheme),
            onSecondary = colors.value(colors.onSecondary(), scheme),
            secondaryContainer = colors.value(colors.secondaryContainer(), scheme),
            onSecondaryContainer = colors.value(colors.onSecondaryContainer(), scheme),
            tertiary = colors.value(colors.tertiary(), scheme),
            onTertiary = colors.value(colors.onTertiary(), scheme),
            tertiaryContainer = colors.value(colors.tertiaryContainer(), scheme),
            onTertiaryContainer = colors.value(colors.onTertiaryContainer(), scheme),
            background = colors.value(colors.background(), scheme),
            onBackground = colors.value(colors.onBackground(), scheme),
            surface = colors.value(colors.surface(), scheme),
            onSurface = colors.value(colors.onSurface(), scheme),
            surfaceVariant = colors.value(colors.surfaceVariant(), scheme),
            onSurfaceVariant = colors.value(colors.onSurfaceVariant(), scheme),
            surfaceTint = colors.value(colors.surfaceTint(), scheme),
            inverseSurface = colors.value(colors.inverseSurface(), scheme),
            inverseOnSurface = colors.value(colors.inverseOnSurface(), scheme),
            error = colors.value(colors.error(), scheme),
            onError = colors.value(colors.onError(), scheme),
            errorContainer = colors.value(colors.errorContainer(), scheme),
            onErrorContainer = colors.value(colors.onErrorContainer(), scheme),
            outline = colors.value(colors.outline(), scheme),
            outlineVariant = colors.value(colors.outlineVariant(), scheme),
            scrim = colors.value(colors.scrim(), scheme),
            surfaceBright = colors.value(colors.surfaceBright(), scheme),
            surfaceContainer = colors.value(colors.surfaceContainer(), scheme),
            surfaceContainerHigh = colors.value(colors.surfaceContainerHigh(), scheme),
            surfaceContainerHighest = colors.value(colors.surfaceContainerHighest(), scheme),
            surfaceContainerLow = colors.value(colors.surfaceContainerLow(), scheme),
            surfaceContainerLowest = colors.value(colors.surfaceContainerLowest(), scheme),
            surfaceDim = colors.value(colors.surfaceDim(), scheme)
        )
    }

    fun extendedColors(
        seedColor: String,
        dark: Boolean,
        isSystemDynamic: Boolean = false
    ): CareerExtendedColors {
        val sourceArgb = argbFromHex(normalizeSeedColor(seedColor))
        return extendedColorsFromArgb(sourceArgb, dark, isSystemDynamic)
    }

    fun extendedColorsFromArgb(
        sourceArgb: Int,
        dark: Boolean,
        isSystemDynamic: Boolean = false
    ): CareerExtendedColors {
        val success = customColor(sourceArgb, SUCCESS_SOURCE, dark)
        val warning = customColor(sourceArgb, WARNING_SOURCE, dark)
        val info = customColor(sourceArgb, INFO_SOURCE, dark)
        return CareerExtendedColors(
            success = success.color,
            onSuccess = success.onColor,
            successContainer = success.container,
            onSuccessContainer = success.onContainer,
            warning = warning.color,
            onWarning = warning.onColor,
            warningContainer = warning.container,
            onWarningContainer = warning.onContainer,
            info = info.color,
            onInfo = info.onColor,
            infoContainer = info.container,
            onInfoContainer = info.onContainer,
            shadow = Color(0xFF000000),
            isDark = dark,
            isSystemDynamic = isSystemDynamic
        )
    }

    fun argbFromHex(seedColor: String): Int {
        return (0xFF000000L or normalizeSeedColor(seedColor).removePrefix("#").toLong(16)).toInt()
    }

    fun hexFromArgb(argb: Int): String = "#%06x".format(argb and 0x00FFFFFF)

    private fun MaterialDynamicColors.value(role: DynamicColor, scheme: DynamicScheme): Color {
        return Color(role.getArgb(scheme))
    }

    private fun customColor(sourceArgb: Int, customArgb: Int, dark: Boolean): CustomColorRoles {
        val harmonized = Blend.harmonize(customArgb, sourceArgb)
        val tones = CorePalette.of(harmonized).a1
        return if (dark) {
            CustomColorRoles(
                color = Color(tones.tone(80)),
                onColor = Color(tones.tone(20)),
                container = Color(tones.tone(30)),
                onContainer = Color(tones.tone(90))
            )
        } else {
            CustomColorRoles(
                color = Color(tones.tone(40)),
                onColor = Color(tones.tone(100)),
                container = Color(tones.tone(90)),
                onContainer = Color(tones.tone(10))
            )
        }
    }

    private data class CustomColorRoles(
        val color: Color,
        val onColor: Color,
        val container: Color,
        val onContainer: Color
    )

    private const val SUCCESS_SOURCE = 0xFF2E6B3F.toInt()
    private const val WARNING_SOURCE = 0xFF815500.toInt()
    private const val INFO_SOURCE = 0xFF315DA8.toInt()
}
