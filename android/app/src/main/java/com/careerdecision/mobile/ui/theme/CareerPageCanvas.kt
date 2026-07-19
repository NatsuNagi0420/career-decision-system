package com.careerdecision.mobile.ui.theme

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import com.careerdecision.mobile.ui.LocalCareerThemePreferences

@Composable
fun CareerPageCanvas(
    modifier: Modifier = Modifier,
    preferences: ThemePreferences = LocalCareerThemePreferences.current,
    contentAlignment: Alignment = Alignment.TopStart,
    content: @Composable BoxScope.() -> Unit
) {
    val normalized = remember(preferences) { preferences.normalized() }
    val backgroundUri = remember(normalized.backgroundUri) {
        normalized.backgroundUri?.let(Uri::parse)
    }
    val backgroundOverlay = MaterialTheme.colorScheme.surface
        .copy(alpha = BackgroundSurfaceAlpha)
        .compositeOver(
            MaterialTheme.colorScheme.scrim.copy(alpha = normalized.scrimLevel.toFloat())
        )
    val backgroundColorFilter = remember(backgroundOverlay) {
        ColorFilter.tint(backgroundOverlay, BlendMode.SrcOver)
    }
    Box(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surface)
            .clipToBounds(),
        contentAlignment = contentAlignment
    ) {
        if (normalized.backgroundEnabled && backgroundUri != null) {
            AsyncImage(
                model = backgroundUri,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                alignment = BiasAlignment(
                    horizontalBias = (normalized.focalX * 2.0 - 1.0).toFloat(),
                    verticalBias = (normalized.focalY * 2.0 - 1.0).toFloat()
                ),
                contentScale = ContentScale.Crop,
                // Blend the veil as part of the image draw instead of issuing another
                // full-screen translucent draw on every foreground frame.
                colorFilter = backgroundColorFilter
            )
        }
        content()
    }
}

private const val BackgroundSurfaceAlpha = 0.72f
