package com.careerdecision.mobile.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val CareerColors = lightColorScheme(
    primary = Color(0xFF0F766E),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD4F0EC),
    onPrimaryContainer = Color(0xFF073B38),
    secondary = Color(0xFF2563EB),
    secondaryContainer = Color(0xFFDBEAFE),
    tertiary = Color(0xFFC2410C),
    background = Color(0xFFF6F7F9),
    surface = Color.White,
    surfaceVariant = Color(0xFFEEF1F4),
    outline = Color(0xFFCBD2D9),
    error = Color(0xFFB42318)
)

@Composable
fun CareerTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = CareerColors, content = content)
}
