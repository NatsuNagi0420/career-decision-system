package com.careerdecision.mobile.ui.design

import androidx.annotation.DrawableRes
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.careerdecision.mobile.R
import com.careerdecision.mobile.ui.theme.CareerMotionTokens

enum class AssistantVisualState(@DrawableRes internal val drawableRes: Int) {
    Default(R.drawable.suina_assistant_default),
    Listening(R.drawable.suina_assistant_listening),
    Thinking(R.drawable.suina_assistant_thinking),
    Explaining(R.drawable.suina_assistant_explaining),
    Concerned(R.drawable.suina_assistant_concerned),
    Warning(R.drawable.suina_assistant_warning),
    Encouraging(R.drawable.suina_assistant_encouraging),
    Success(R.drawable.suina_assistant_success)
}

enum class AssistantAvatarSize(val dimension: Dp) {
    Small(32.dp),
    Medium(42.dp),
    Large(52.dp)
}

/**
 * The shared Suina state avatar. Visual state always supplements textual status;
 * it never becomes the only way an error, warning, or loading state is conveyed.
 */
@Composable
fun AssistantAvatar(
    modifier: Modifier = Modifier,
    state: AssistantVisualState = AssistantVisualState.Default,
    size: AssistantAvatarSize = AssistantAvatarSize.Medium,
    contentDescription: String? = null
) {
    val shape = MaterialTheme.shapes.extraLarge
    Box(
        modifier = modifier
            .size(size.dimension)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceContainerLowest)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape),
        contentAlignment = Alignment.Center
    ) {
        Crossfade(
            targetState = state,
            animationSpec = tween(CareerMotionTokens.Short),
            label = "Suina assistant state"
        ) { visualState ->
            androidx.compose.foundation.Image(
                painter = painterResource(visualState.drawableRes),
                contentDescription = contentDescription,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }
    }
}

/** Compact brand lockup used where Web uses BrandIdentity. */
@Composable
fun BrandIdentity(
    modifier: Modifier = Modifier,
    showAvatar: Boolean = true,
    showDescriptor: Boolean = true,
    compact: Boolean = false
) {
    val avatarSize = if (compact) 36.dp else 40.dp
    val wordmarkWidth = if (compact) 92.dp else 104.dp
    val wordmarkHeight = if (compact) 23.dp else 25.dp
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(
            if (compact) CareerSpacing.Small else CareerSpacing.Medium
        )
    ) {
        if (showAvatar) {
            Box(
                modifier = Modifier
                    .size(avatarSize)
                    .clip(MaterialTheme.shapes.medium)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                androidx.compose.foundation.Image(
                    painter = painterResource(R.drawable.suina_avatar),
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            }
        }
        Column(
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.Zero)
        ) {
            androidx.compose.foundation.Image(
                painter = painterResource(R.drawable.brand_wordmark),
                contentDescription = "青穗集",
                modifier = Modifier
                    .width(wordmarkWidth)
                    .height(wordmarkHeight),
                contentScale = ContentScale.Fit,
                alignment = Alignment.CenterStart
            )
            if (showDescriptor) {
                Text(
                    "职业决策与行动",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun BrandCharacterLockup(
    modifier: Modifier = Modifier,
    contentDescription: String? = "青穗集与 AI 导师穗奈"
) {
    androidx.compose.foundation.Image(
        painter = painterResource(R.drawable.brand_lockup_suina),
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = ContentScale.Fit
    )
}
