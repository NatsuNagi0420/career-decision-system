package com.careerdecision.mobile.ui

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Static guardrails for the Android implementation of the project design contract.
 *
 * The design layer is the only place where raw Material 3 controls are assembled.
 * Business screens consume the M3* wrappers so that states, touch targets, shapes,
 * and accessibility behavior remain centralized.
 */
class DesignComplianceTest {
    @Test
    fun productionSourcesDoNotImportMaterial2OrMaterialIcons() {
        val root = androidRoot()
        val violations = productionKotlinFiles(root)
            .flatMap { file ->
                val source = read(file)
                buildList {
                    if (material2Import.containsMatchIn(source)) {
                        add("$file imports androidx.compose.material (Material 2)")
                    }
                    if (materialIconsImport.containsMatchIn(source)) {
                        add("$file imports Material Icons; use CareerIcons instead")
                    }
                }
            }

        assertTrue(violations.joinToString("\n"), violations.isEmpty())
    }

    @Test
    fun businessScreensUseProjectComponentsAndThemeTokens() {
        val root = androidRoot()
        val violations = screenKotlinFiles(root).flatMap { file ->
            val source = read(file)
            val fileViolations = mutableListOf<String>()
            val relative = root.relativize(file)

            if (material2Import.containsMatchIn(source)) {
                fileViolations += "$relative imports Material 2"
            }
            if (materialIconsImport.containsMatchIn(source)) {
                fileViolations += "$relative imports Material Icons"
            }

            material3Import.findAll(source).forEach { match ->
                val symbol = match.groupValues[1]
                if (symbol !in allowedMaterial3Imports) {
                    fileViolations += "$relative directly imports Material 3 $symbol; use an M3* wrapper"
                }
            }

            directMaterial3Call.findAll(source).forEach { match ->
                fileViolations += "$relative directly calls Material 3 ${match.groupValues[1]}"
            }

            if (roundedCornerShapeImport.containsMatchIn(source) || roundedCornerShapeCall.containsMatchIn(source)) {
                fileViolations += "$relative defines RoundedCornerShape; use MaterialTheme.shapes"
            }
            if (hexColorLiteral.containsMatchIn(source)) {
                fileViolations += "$relative contains a hardcoded hex color"
            }
            if (argbLiteral.containsMatchIn(source)) {
                fileViolations += "$relative contains a hardcoded ARGB color literal"
            }
            if (colorImportOrCall.containsMatchIn(source)) {
                fileViolations += "$relative constructs or imports a raw Color; use MaterialTheme.colorScheme or an extended token"
            }

            fileViolations
        }

        assertTrue(violations.joinToString("\n"), violations.isEmpty())
    }

    @Test
    fun appDoesNotDeclareMaterialIconsDependency() {
        val root = androidRoot()
        val buildScript = read(root.resolve("app/build.gradle.kts"))
        assertFalse(
            "material-icons-extended or Material 2 UI dependency must not return",
            materialIconsDependency.containsMatchIn(buildScript)
        )
    }

    @Test
    fun manifestDisablesSystemBackupForPrivateLocalData() {
        val manifest = androidRoot().resolve("app/src/main/AndroidManifest.xml").toFile()
        val document = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
        }.newDocumentBuilder().parse(manifest)
        val application = document.getElementsByTagName("application").item(0)

        assertEquals(
            "Room queues, AI conversations, and local backgrounds must not enter system backup",
            "false",
            application.attributes.getNamedItemNS(ANDROID_XML_NAMESPACE, "allowBackup")?.nodeValue
        )
        assertEquals(
            "Android 12+ backup and device transfer exclusions must remain configured",
            "@xml/data_extraction_rules",
            application.attributes.getNamedItemNS(ANDROID_XML_NAMESPACE, "dataExtractionRules")?.nodeValue
        )
    }

    @Test
    fun debugHttpsTrustsOnlySystemAndBundledProjectCa() {
        val root = androidRoot()
        val config = read(root.resolve("app/src/debug/res/xml/debug_network_security_config.xml"))
        assertTrue(config, config.contains("src=\"system\""))
        assertTrue(config, config.contains("src=\"@raw/local_debug_ca\""))
        assertFalse(config, config.contains("src=\"user\""))

        val certificatePath = root.resolve("app/src/debug/res/raw/local_debug_ca.pem")
        val certificate = Files.newInputStream(certificatePath).use { input ->
            CertificateFactory.getInstance("X.509").generateCertificate(input) as X509Certificate
        }
        certificate.checkValidity()
        assertTrue("The bundled Debug certificate must be a CA certificate", certificate.basicConstraints >= 0)
    }

    @Test
    fun productionBrandNameIsQingsuijiEverywhere() {
        val root = androidRoot()
        val checkedFiles = productionKotlinFiles(root) +
            listOf(root.resolve("app/src/main/AndroidManifest.xml")) +
            xmlFiles(root.resolve("app/src/main/res/values"))
        val staleBrandReferences = checkedFiles
            .filter { path -> read(path).contains(LEGACY_BRAND_NAME) }
            .map(root::relativize)

        assertTrue(
            "The legacy brand name '$LEGACY_BRAND_NAME' must not remain in production UI/resources:\n" +
                staleBrandReferences.joinToString("\n"),
            staleBrandReferences.isEmpty()
        )

        val manifest = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
        }.newDocumentBuilder().parse(root.resolve("app/src/main/AndroidManifest.xml").toFile())
        val application = manifest.getElementsByTagName("application").item(0)
        val label = application.attributes
            .getNamedItemNS(ANDROID_XML_NAMESPACE, "label")
            ?.nodeValue
        val resolvedLabel = when {
            label == null -> null
            label.startsWith("@string/") -> stringResource(root, label.substringAfter("@string/"))
            else -> label
        }

        assertEquals("The installed app label must use the approved brand", BRAND_NAME, resolvedLabel)
    }

    @Test
    fun assistantStateAssetsMatchTheWebCatalog() {
        val androidRoot = androidRoot()
        val repositoryRoot = androidRoot.parent
        val androidScript = read(androidRoot.resolve("scripts/prepare_brand_assets.py"))
        val webScript = read(repositoryRoot.resolve("web/scripts/prepare_brand_assets.py"))
        val androidStateSources = assistantStateSources(androidScript)
        val webStateSources = assistantStateSources(webScript)

        assertEquals(
            "Android and Web must derive every assistant state from the same approved source image",
            webStateSources,
            androidStateSources
        )
        assertEquals(EXPECTED_ASSISTANT_STATES, androidStateSources.keys)

        val visuals = read(
            androidRoot.resolve(
                "app/src/main/java/com/careerdecision/mobile/ui/design/BrandVisuals.kt"
            )
        )
        EXPECTED_ASSISTANT_STATES.forEach { state ->
            val resourceName = "suina_assistant_$state"
            assertTrue(
                "AssistantVisualState must expose $resourceName",
                visuals.contains("R.drawable.$resourceName")
            )
            assertTrue(
                "$resourceName must be packaged as an Android drawable",
                Files.isRegularFile(
                    androidRoot.resolve("app/src/main/res/drawable-nodpi/$resourceName.webp")
                )
            )
        }
    }

    @Test
    fun launcherUsesTheApprovedSuinaAvatar() {
        val root = androidRoot()
        val manifest = read(root.resolve("app/src/main/AndroidManifest.xml"))
        assertTrue(manifest, manifest.contains("android:icon=\"@mipmap/ic_launcher\""))

        val foreground = read(root.resolve("app/src/main/res/drawable/ic_launcher_foreground.xml"))
        assertTrue(
            "The adaptive launcher foreground must use the approved standard avatar",
            foreground.contains("@drawable/suina_avatar")
        )
        assertTrue(
            "The standard avatar derivative must be packaged",
            Files.isRegularFile(root.resolve("app/src/main/res/drawable-nodpi/suina_avatar.webp"))
        )
        assertFalse(
            "The legacy chart launcher icon must not return",
            Files.exists(root.resolve("app/src/main/res/drawable/ic_launcher.xml"))
        )

        val adaptiveIcon = read(root.resolve("app/src/main/res/mipmap-anydpi/ic_launcher.xml"))
        assertTrue(adaptiveIcon, adaptiveIcon.contains("@drawable/ic_launcher_foreground"))
        assertTrue(adaptiveIcon, adaptiveIcon.contains("@drawable/ic_launcher_monochrome"))

        val assetScript = read(root.resolve("scripts/prepare_brand_assets.py"))
        assertTrue(
            "Launcher assets must remain reproducible from the approved standard portrait",
            assetScript.contains("BgSub_穗奈标准头像v1.0.png")
        )
    }

    @Test
    fun sensitiveProfileActionsRequireConfirmationAndPendingWorkBlocksLogout() {
        val root = androidRoot()
        val profile = read(
            root.resolve(
                "app/src/main/java/com/careerdecision/mobile/ui/screens/ProfileScreen.kt"
            )
        )

        assertTrue(profile, profile.contains("onClick = { showResetThemeDialog = true }"))
        assertTrue(profile, profile.contains("title = \"恢复默认主题？\""))
        assertTrue(profile, profile.contains("账号与业务数据不受影响"))
        assertTrue(profile, profile.contains("LogoutDialogMode.PendingOnline"))
        assertTrue(profile, profile.contains("LogoutDialogMode.PendingOffline"))
        assertTrue(profile, profile.contains("请先完成同步"))
    }

    @Test
    fun authenticationAndTopLevelNavigationUseProjectMotionTokens() {
        val root = androidRoot()
        val login = read(
            root.resolve(
                "app/src/main/java/com/careerdecision/mobile/ui/screens/LoginScreen.kt"
            )
        )
        val app = read(root.resolve("app/src/main/java/com/careerdecision/mobile/ui/CareerApp.kt"))

        assertTrue(login, login.contains("AnimatedContent"))
        assertTrue(login, login.contains("SizeTransform"))
        assertFalse(login, login.contains("RegisterOnlyField"))
        assertTrue(login, login.contains("CareerMotionTokens.Standard"))
        assertTrue(app, app.contains("topLevelFadeThroughEnter"))
        assertTrue(app, app.contains("topLevelFadeThroughExit"))
        assertTrue(app, app.contains("CareerMotionTokens.Standard"))
    }

    @Test
    fun dynamicColorSettingsExposeSemanticPreviewsAndSeparateImageActions() {
        val root = androidRoot()
        val profile = read(
            root.resolve(
                "app/src/main/java/com/careerdecision/mobile/ui/screens/ProfileScreen.kt"
            )
        )

        assertTrue(profile, profile.contains("M3ThemePalettePreview"))
        assertTrue(profile, profile.contains("M3SeedSchemeChoice"))
        assertTrue(profile, profile.contains("ImageSelectionPurpose.PaletteOnly"))
        assertTrue(profile, profile.contains("ImageSelectionPurpose.BackgroundAndPalette"))
        assertTrue(profile, profile.contains("仅应用配色"))
        assertTrue(profile, profile.contains("ThemeColorSource.SYSTEM"))
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

    private fun productionKotlinFiles(root: Path): List<Path> = kotlinFiles(root.resolve("app/src/main/java"))

    private fun screenKotlinFiles(root: Path): List<Path> = kotlinFiles(root.resolve("app/src/main/java/com/careerdecision/mobile/ui/screens"))

    private fun kotlinFiles(directory: Path): List<Path> {
        if (!Files.isDirectory(directory)) return emptyList()
        val files = mutableListOf<Path>()
        Files.walk(directory).use { stream ->
            stream.filter { path -> Files.isRegularFile(path) && path.toString().endsWith(".kt") }
                .forEach(files::add)
        }
        return files.sortedBy(Path::toString)
    }

    private fun xmlFiles(directory: Path): List<Path> {
        if (!Files.isDirectory(directory)) return emptyList()
        val files = mutableListOf<Path>()
        Files.walk(directory).use { stream ->
            stream.filter { path -> Files.isRegularFile(path) && path.toString().endsWith(".xml") }
                .forEach(files::add)
        }
        return files.sortedBy(Path::toString)
    }

    private fun stringResource(root: Path, name: String): String? {
        val valuesDirectory = root.resolve("app/src/main/res/values")
        for (file in xmlFiles(valuesDirectory)) {
            val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file.toFile())
            val strings = document.getElementsByTagName("string")
            for (index in 0 until strings.length) {
                val element = strings.item(index)
                if (element.attributes?.getNamedItem("name")?.nodeValue == name) {
                    return element.textContent
                }
            }
        }
        return null
    }

    private fun assistantStateSources(script: String): Map<String, String> =
        assistantSourceEntry.findAll(script)
            .associate { match -> match.groupValues[1] to match.groupValues[2] }

    private fun read(path: Path): String = Files.readAllBytes(path).toString(Charsets.UTF_8)

    private companion object {
        const val ANDROID_XML_NAMESPACE = "http://schemas.android.com/apk/res/android"
        const val BRAND_NAME = "青穗集"
        const val LEGACY_BRAND_NAME = "职途"

        val EXPECTED_ASSISTANT_STATES = linkedSetOf(
            "default",
            "listening",
            "thinking",
            "explaining",
            "concerned",
            "warning",
            "encouraging",
            "success"
        )

        // Keep Text and MaterialTheme as the two direct M3 primitives that screens may use.
        // Interactive controls and containers belong in M3Components.kt.
        val allowedMaterial3Imports = setOf("MaterialTheme", "Text")

        val material2Import = Regex("(?m)^\\s*import\\s+androidx\\.compose\\.material(?:\\.|\\s|$)")
        val materialIconsImport = Regex("(?m)^\\s*import\\s+androidx\\.compose\\.material(?:3\\.)?\\.icons(?:\\.|\\s|$)")
        val material3Import = Regex("(?m)^\\s*import\\s+androidx\\.compose\\.material3\\.([A-Za-z0-9_*]+)(?:\\s+as\\s+[A-Za-z0-9_]+)?\\s*$")

        private val directMaterial3Controls = listOf(
            "Button",
            "FilledTonalButton",
            "OutlinedButton",
            "TextButton",
            "IconButton",
            "Card",
            "ElevatedCard",
            "OutlinedCard",
            "Surface",
            "Checkbox",
            "Switch",
            "Slider",
            "DropdownMenu",
            "DropdownMenuItem",
            "AlertDialog",
            "Dialog",
            "TextField",
            "OutlinedTextField",
            "AssistChip",
            "FilterChip",
            "InputChip",
            "SuggestionChip",
            "SingleChoiceSegmentedButtonRow",
            "SegmentedButton",
            "Scaffold",
            "Snackbar",
            "SnackbarHost"
        ).joinToString("|")

        val directMaterial3Call = Regex(
            "androidx\\.compose\\.material3\\.($directMaterial3Controls)\\s*\\("
        )
        val roundedCornerShapeImport = Regex("(?m)^\\s*import\\s+androidx\\.compose\\.foundation\\.shape\\.RoundedCornerShape")
        val roundedCornerShapeCall = Regex("(?<![A-Za-z0-9_])RoundedCornerShape\\s*\\(")
        val hexColorLiteral = Regex("(?i)(?<![A-Za-z0-9])#[0-9a-f]{3,8}(?![A-Za-z0-9])")
        val argbLiteral = Regex("(?i)(?<![A-Za-z0-9])0x(?:ff)?[0-9a-f]{6}(?![A-Za-z0-9])")
        val colorImportOrCall = Regex(
            "(?m)^\\s*import\\s+(?:android\\.graphics\\.Color|androidx\\.compose\\.ui\\.graphics\\.Color)|(?<![A-Za-z0-9_])(?:Color|parseColor)\\s*\\("
        )
        val materialIconsDependency = Regex("(?i)(?:material-icons|androidx\\.compose\\.material\\s*:\\s*material(?:\\W|$))")
        val assistantSourceEntry = Regex("\\\"([a-z]+)\\\"\\s*:\\s*\\\"(BgSub_[^\\\"]+\\.png)\\\"")
    }
}
