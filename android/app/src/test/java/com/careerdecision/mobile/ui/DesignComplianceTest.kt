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

    private fun read(path: Path): String = Files.readAllBytes(path).toString(Charsets.UTF_8)

    private companion object {
        const val ANDROID_XML_NAMESPACE = "http://schemas.android.com/apk/res/android"

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
    }
}
