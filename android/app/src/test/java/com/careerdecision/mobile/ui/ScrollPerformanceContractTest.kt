package com.careerdecision.mobile.ui

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScrollPerformanceContractTest {
    @Test
    fun foregroundActivityRequestsTheFastestModeAndRestoresItOnPause() {
        val root = androidRoot()
        val controller = read(
            root.resolve(
                "app/src/main/java/com/careerdecision/mobile/ui/performance/" +
                    "ForegroundHighRefreshRateController.kt"
            )
        )
        val activity = read(
            root.resolve("app/src/main/java/com/careerdecision/mobile/MainActivity.kt")
        )

        assertTrue(controller, controller.contains("highestRefreshModeAtCurrentResolution"))
        assertTrue(controller, controller.contains("preferredDisplayModeId = preferredMode.modeId"))
        assertTrue(controller, controller.contains("setRequestedFrameRate(refreshRate)"))
        assertTrue(controller, controller.contains("setFrameRatePowerSavingsBalanced(false)"))
        assertTrue(activity, activity.contains("ForegroundComposeHighRefreshRateRequest()"))
        assertTrue(activity, activity.contains("override fun onResume()"))
        assertTrue(activity, activity.contains("highRefreshRateController.enable()"))
        assertTrue(activity, activity.contains("override fun onPause()"))
        assertTrue(activity, activity.contains("highRefreshRateController.disable()"))
    }

    @Test
    fun settingsSlidersPersistOnlyAfterTheGestureFinishes() {
        val root = androidRoot()
        val profile = read(
            root.resolve("app/src/main/java/com/careerdecision/mobile/ui/screens/ProfileScreen.kt")
        )
        val components = read(
            root.resolve("app/src/main/java/com/careerdecision/mobile/ui/design/M3Components.kt")
        )

        assertTrue(components, components.contains("onValueChangeFinished: (() -> Unit)?"))
        assertTrue(profile, profile.contains("DeferredPreferenceSlider"))
        assertTrue(profile, profile.contains("DeferredFocalPointSliders"))
        assertTrue(profile, Regex("onValueChangeFinished\\s*=\\s*\\{").containsMatchIn(profile))
        assertFalse(
            "Slider sampling must not write theme preferences on every pointer event",
            Regex("onValueChange\\s*=\\s*\\{\\s*themeController\\.").containsMatchIn(profile)
        )
    }

    @Test
    fun finiteSettingsContentAvoidsLazySubcompositionDuringScroll() {
        val profile = read(
            androidRoot().resolve(
                "app/src/main/java/com/careerdecision/mobile/ui/screens/ProfileScreen.kt"
            )
        )

        assertTrue(profile, profile.contains("verticalScroll(rememberScrollState())"))
        assertFalse(profile, profile.contains("LazyColumn("))
    }

    @Test
    fun imageBackgroundBlendsItsOverlayInsideTheImageDraw() {
        val canvas = read(
            androidRoot().resolve(
                "app/src/main/java/com/careerdecision/mobile/ui/theme/CareerPageCanvas.kt"
            )
        )

        assertTrue(canvas, canvas.contains("ColorFilter.tint"))
        assertTrue(canvas, canvas.contains("BlendMode.SrcOver"))
        assertTrue(canvas, canvas.contains("compositeOver"))
        assertTrue(
            "CareerPageCanvas should keep only its root Box",
            Regex("(?m)^\\s*Box\\(").findAll(canvas).count() == 1
        )
    }

    @Test
    fun performanceBuildIsInstallableProfileableAndUsesTheLocalHttpsCa() {
        val buildScript = read(androidRoot().resolve("app/build.gradle.kts"))

        assertTrue(buildScript, buildScript.contains("create(\"performance\")"))
        assertTrue(buildScript, buildScript.contains("initWith(getByName(\"release\"))"))
        assertTrue(buildScript, buildScript.contains("isDebuggable = false"))
        assertTrue(buildScript, buildScript.contains("isProfileable = true"))
        assertTrue(buildScript, buildScript.contains("res.srcDir(\"src/debug/res\")"))
    }

    private fun androidRoot(): Path {
        var candidate = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize()
        while (true) {
            if (
                Files.isRegularFile(candidate.resolve("settings.gradle.kts")) &&
                Files.isDirectory(candidate.resolve("app/src/main/java"))
            ) {
                return candidate
            }
            candidate = candidate.parent ?: break
        }
        error("Unable to locate the Android project root from ${System.getProperty("user.dir")}")
    }

    private fun read(path: Path): String = Files.readAllBytes(path).toString(Charsets.UTF_8)
}
