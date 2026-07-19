package com.careerdecision.mobile.ui.performance

import android.app.Activity
import android.os.Build
import android.view.Display
import android.view.View
import androidx.annotation.RequiresApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/**
 * Requests the fastest display mode available at the current physical resolution while
 * the activity is in the foreground. Android can still apply user, thermal, or battery
 * restrictions, so this remains a preference rather than an unconditional hardware lock.
 */
class ForegroundHighRefreshRateController(
    private val activity: Activity
) {
    private var enabled = false
    private var previousDisplayModeId = 0
    private var previousRefreshRate = 0f
    private var previousTouchBoost = true
    private var previousPowerSavingsBalanced = false

    fun enable() {
        val display = activity.window.decorView.display ?: return
        val preferredMode = display.highestRefreshModeAtCurrentResolution() ?: return
        val attributes = activity.window.attributes

        if (!enabled) {
            previousDisplayModeId = attributes.preferredDisplayModeId
            previousRefreshRate = attributes.preferredRefreshRate
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                previousTouchBoost = Api35ForegroundFrameRate.touchBoostEnabled(attributes)
                previousPowerSavingsBalanced = Api35ForegroundFrameRate.powerSavingsBalanced(attributes)
            }
        }

        attributes.preferredDisplayModeId = preferredMode.modeId
        attributes.preferredRefreshRate = preferredMode.refreshRate
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            Api35ForegroundFrameRate.configureWindow(attributes)
        }
        activity.window.attributes = attributes
        enabled = true
    }

    fun disable() {
        if (!enabled) return

        val attributes = activity.window.attributes
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            Api35ForegroundFrameRate.restoreWindow(
                attributes = attributes,
                touchBoostEnabled = previousTouchBoost,
                powerSavingsBalanced = previousPowerSavingsBalanced
            )
        }
        attributes.preferredDisplayModeId = previousDisplayModeId
        attributes.preferredRefreshRate = previousRefreshRate
        activity.window.attributes = attributes
        enabled = false
    }
}

/** Applies the exact frame-rate vote to AndroidComposeView, not only to its parent window. */
@Composable
fun ForegroundComposeHighRefreshRateRequest() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return

    val view = LocalView.current
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(view, lifecycleOwner) {
        fun request() {
            val refreshRate = view.display
                ?.highestRefreshModeAtCurrentResolution()
                ?.refreshRate
                ?: return
            Api35ForegroundFrameRate.request(view, refreshRate)
        }

        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> request()
                Lifecycle.Event.ON_PAUSE,
                Lifecycle.Event.ON_STOP,
                Lifecycle.Event.ON_DESTROY -> Api35ForegroundFrameRate.clear(view)
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) request()

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            Api35ForegroundFrameRate.clear(view)
        }
    }
}

private fun Display.highestRefreshModeAtCurrentResolution(): Display.Mode? {
    val activeMode = mode
    return supportedModes
        .asSequence()
        .filter { candidate ->
            candidate.physicalWidth == activeMode.physicalWidth &&
                candidate.physicalHeight == activeMode.physicalHeight
        }
        .maxByOrNull(Display.Mode::getRefreshRate)
}

@RequiresApi(Build.VERSION_CODES.VANILLA_ICE_CREAM)
private object Api35ForegroundFrameRate {
    fun touchBoostEnabled(attributes: android.view.WindowManager.LayoutParams): Boolean =
        attributes.frameRateBoostOnTouchEnabled

    fun powerSavingsBalanced(attributes: android.view.WindowManager.LayoutParams): Boolean =
        attributes.isFrameRatePowerSavingsBalanced

    fun configureWindow(attributes: android.view.WindowManager.LayoutParams) {
        attributes.setFrameRateBoostOnTouchEnabled(true)
        attributes.setFrameRatePowerSavingsBalanced(false)
    }

    fun restoreWindow(
        attributes: android.view.WindowManager.LayoutParams,
        touchBoostEnabled: Boolean,
        powerSavingsBalanced: Boolean
    ) {
        attributes.setFrameRateBoostOnTouchEnabled(touchBoostEnabled)
        attributes.setFrameRatePowerSavingsBalanced(powerSavingsBalanced)
    }

    fun request(view: View, refreshRate: Float) {
        view.setRequestedFrameRate(refreshRate)
    }

    fun clear(view: View) {
        view.setRequestedFrameRate(View.REQUESTED_FRAME_RATE_CATEGORY_NO_PREFERENCE)
    }
}
