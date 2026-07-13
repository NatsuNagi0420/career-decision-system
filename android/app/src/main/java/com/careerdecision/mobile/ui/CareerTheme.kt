package com.careerdecision.mobile.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.careerdecision.mobile.ui.theme.CareerExtendedColors
import com.careerdecision.mobile.ui.theme.CareerShapes
import com.careerdecision.mobile.ui.theme.CareerTypography
import com.careerdecision.mobile.ui.theme.DEFAULT_SEED_COLOR
import com.careerdecision.mobile.ui.theme.LocalCareerExtendedColors
import com.careerdecision.mobile.ui.theme.MaterialColorSchemeGenerator
import com.careerdecision.mobile.ui.theme.ThemeColorSource
import com.careerdecision.mobile.ui.theme.ThemeController
import com.careerdecision.mobile.ui.theme.ThemeMode
import com.careerdecision.mobile.ui.theme.ThemePreferences
import com.careerdecision.mobile.ui.theme.ThemePreferencesRepository

val LocalCareerThemePreferences = staticCompositionLocalOf { ThemePreferences.Default }

val LocalCareerThemeController = staticCompositionLocalOf<ThemeController> {
    error("LocalCareerThemeController is only available inside CareerTheme")
}

val MaterialTheme.careerColors: CareerExtendedColors
    @Composable
    @ReadOnlyComposable
    get() = LocalCareerExtendedColors.current

val MaterialTheme.careerThemePreferences: ThemePreferences
    @Composable
    @ReadOnlyComposable
    get() = LocalCareerThemePreferences.current

@Composable
fun CareerTheme(
    preferences: ThemePreferences? = null,
    themeController: ThemeController? = null,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val applicationContext = context.applicationContext
    val scope = rememberCoroutineScope()
    val localRepository = remember(applicationContext) {
        ThemePreferencesRepository(applicationContext)
    }
    val localController = remember(localRepository, scope) {
        ThemeController(localRepository, scope)
    }
    val controller = themeController ?: localController
    val storedPreferences by controller.preferences.collectAsStateWithLifecycle()
    val currentPreferences = (preferences ?: storedPreferences).normalized()
    val systemDark = androidx.compose.foundation.isSystemInDarkTheme()
    val dark = when (currentPreferences.themeMode) {
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
        ThemeMode.SYSTEM -> systemDark
    }
    val configuration = LocalConfiguration.current
    val useSystemDynamic = currentPreferences.colorSource == ThemeColorSource.SYSTEM &&
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val fallbackSeed = if (currentPreferences.colorSource == ThemeColorSource.SYSTEM) {
        DEFAULT_SEED_COLOR
    } else {
        currentPreferences.seedColor
    }
    val colorScheme = remember(
        context,
        configuration,
        useSystemDynamic,
        dark,
        fallbackSeed,
        currentPreferences.contrastLevel
    ) {
        if (useSystemDynamic) {
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        } else {
            MaterialColorSchemeGenerator.generate(
                seedColor = fallbackSeed,
                dark = dark,
                contrastLevel = currentPreferences.contrastLevel
            )
        }
    }
    val extendedColors = remember(colorScheme, fallbackSeed, dark, useSystemDynamic) {
        if (useSystemDynamic) {
            MaterialColorSchemeGenerator.extendedColorsFromArgb(
                sourceArgb = colorScheme.primary.toArgb(),
                dark = dark,
                isSystemDynamic = true
            )
        } else {
            MaterialColorSchemeGenerator.extendedColors(fallbackSeed, dark)
        }
    }

    ApplySystemBars(dark = dark, colorScheme = colorScheme)
    CompositionLocalProvider(
        LocalCareerThemePreferences provides currentPreferences,
        LocalCareerThemeController provides controller,
        LocalCareerExtendedColors provides extendedColors
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = CareerTypography,
            shapes = CareerShapes,
            content = content
        )
    }
}

@Composable
private fun ApplySystemBars(
    dark: Boolean,
    colorScheme: androidx.compose.material3.ColorScheme
) {
    val view = LocalView.current
    if (view.isInEditMode) return
    SideEffect {
        val activity = view.context.findActivity() as? ComponentActivity ?: return@SideEffect
        val surface = colorScheme.surface.toArgb()
        activity.enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(surface, surface) { dark },
            navigationBarStyle = SystemBarStyle.auto(surface, surface) { dark }
        )
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
