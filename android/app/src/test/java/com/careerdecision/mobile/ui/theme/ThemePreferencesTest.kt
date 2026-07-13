package com.careerdecision.mobile.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ThemePreferencesTest {
    @Test
    fun normalizesSeedAndPreferenceBounds() {
        val preferences = ThemePreferences(
            colorSource = ThemeColorSource.CUSTOM_SEED,
            seedColor = " #ABCDEF ",
            contrastLevel = 4.0,
            backgroundUri = "https://example.com/background.jpg",
            backgroundEnabled = true,
            focalX = 3.0,
            focalY = -2.0,
            scrimLevel = 0.01,
            version = 0L,
            updatedAt = -4L
        ).normalized()

        assertEquals("#abcdef", preferences.seedColor)
        assertEquals(1.0, preferences.contrastLevel, 0.0)
        assertEquals(1.0, preferences.focalX, 0.0)
        assertEquals(0.0, preferences.focalY, 0.0)
        assertEquals(ThemePreferences.MIN_SCRIM, preferences.scrimLevel, 0.0)
        assertEquals(1L, preferences.version)
        assertEquals(0L, preferences.updatedAt)
        assertEquals(null, preferences.backgroundUri)
        assertFalse(preferences.backgroundEnabled)
    }

    @Test
    fun invalidSeedFallsBackToSharedBrandSeed() {
        assertEquals(DEFAULT_SEED_COLOR, normalizeSeedColor("#12zz00"))
        assertEquals(DEFAULT_SEED_COLOR, normalizeSeedColor(null))
    }

    @Test
    fun acceptsOnlyLocalBackgroundSchemes() {
        assertEquals("content://picker/background", normalizeBackgroundUri("content://picker/background"))
        assertEquals("file:///private/background.webp", normalizeBackgroundUri("file:///private/background.webp"))
        assertEquals(null, normalizeBackgroundUri("https://example.com/image.webp"))
        assertEquals(null, normalizeBackgroundUri("data:image/png;base64,abc"))
    }
}
