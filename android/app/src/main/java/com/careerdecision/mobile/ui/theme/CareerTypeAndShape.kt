package com.careerdecision.mobile.ui.theme

import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private fun careerTextStyle(
    size: Int,
    lineHeight: Int,
    weight: FontWeight = FontWeight.Normal
) = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = 0.sp
)

val CareerTypography = Typography(
    displayLarge = careerTextStyle(57, 64),
    displayMedium = careerTextStyle(45, 52),
    displaySmall = careerTextStyle(36, 44),
    headlineLarge = careerTextStyle(32, 40),
    headlineMedium = careerTextStyle(28, 36),
    headlineSmall = careerTextStyle(24, 32),
    titleLarge = careerTextStyle(22, 28),
    titleMedium = careerTextStyle(16, 24, FontWeight.Medium),
    titleSmall = careerTextStyle(14, 20, FontWeight.Medium),
    bodyLarge = careerTextStyle(16, 24),
    bodyMedium = careerTextStyle(14, 20),
    bodySmall = careerTextStyle(12, 16),
    labelLarge = careerTextStyle(14, 20, FontWeight.Medium),
    labelMedium = careerTextStyle(12, 16, FontWeight.Medium),
    labelSmall = careerTextStyle(11, 16, FontWeight.Medium)
)

val CareerShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(4.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(28.dp)
)

object CareerMotionTokens {
    const val Short = 100
    const val Standard = 200
    const val SharedAxis = 300
    const val Emphasized = 400
    const val EmphasizedLong = 500
    const val FadeThroughIncomingScale = 0.96f
}

object CareerStateLayerTokens {
    const val Hover = 0.08f
    const val Focus = 0.12f
    const val Pressed = 0.12f
    const val Dragged = 0.16f
    const val DisabledContent = 0.38f
    const val DisabledContainer = 0.12f
}
