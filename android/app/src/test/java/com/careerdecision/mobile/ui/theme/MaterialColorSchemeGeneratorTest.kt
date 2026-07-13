package com.careerdecision.mobile.ui.theme

import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class MaterialColorSchemeGeneratorTest {
    @Test
    fun brandLightMatchesWebMcu2021Snapshot() {
        val colors = MaterialColorSchemeGenerator.generate(
            seedColor = DEFAULT_SEED_COLOR,
            dark = false,
            contrastLevel = 0.0
        )
        assertEquals("#446732", colors.primary.hex())
        assertEquals("#ffffff", colors.onPrimary.hex())
        assertEquals("#c5efab", colors.primaryContainer.hex())
        assertEquals("#2d4f1c", colors.onPrimaryContainer.hex())
        assertEquals("#f8faf0", colors.surface.hex())
        assertEquals("#191d16", colors.onSurface.hex())
        assertEquals("#edefe5", colors.surfaceContainer.hex())
        assertEquals("#ffffff", colors.surfaceContainerLowest.hex())
        assertEquals("#74796d", colors.outline.hex())
        assertEquals("#ba1a1a", colors.error.hex())
    }

    @Test
    fun contrastUsesOfficialDynamicRoleCalculation() {
        val standard = MaterialColorSchemeGenerator.generate(DEFAULT_SEED_COLOR, false, 0.0)
        val highContrast = MaterialColorSchemeGenerator.generate(DEFAULT_SEED_COLOR, false, 1.0)

        assertNotEquals(standard.primary.toArgb(), highContrast.primary.toArgb())
        assertNotEquals(standard.outline.toArgb(), highContrast.outline.toArgb())
    }

    @Test
    fun brandDarkMatchesWebMcu2021Snapshot() {
        val colors = MaterialColorSchemeGenerator.generate(DEFAULT_SEED_COLOR, true, 0.0)

        assertEquals("#a9d291", colors.primary.hex())
        assertEquals("#173807", colors.onPrimary.hex())
        assertEquals("#2d4f1c", colors.primaryContainer.hex())
        assertEquals("#c5efab", colors.onPrimaryContainer.hex())
        assertEquals("#11140f", colors.surface.hex())
        assertEquals("#e1e4d9", colors.onSurface.hex())
        assertEquals("#1d211a", colors.surfaceContainer.hex())
        assertEquals("#8d9286", colors.outline.hex())
    }

    @Test
    fun customStatusColorsAreHarmonizedAndModeAware() {
        val light = MaterialColorSchemeGenerator.extendedColors(DEFAULT_SEED_COLOR, false)
        val dark = MaterialColorSchemeGenerator.extendedColors(DEFAULT_SEED_COLOR, true)

        assertEquals("#ffffff", light.onSuccess.hex())
        assertNotEquals(light.success.toArgb(), dark.success.toArgb())
        assertNotEquals(light.warningContainer.toArgb(), dark.warningContainer.toArgb())
    }

    private fun androidx.compose.ui.graphics.Color.hex(): String =
        MaterialColorSchemeGenerator.hexFromArgb(toArgb())
}
