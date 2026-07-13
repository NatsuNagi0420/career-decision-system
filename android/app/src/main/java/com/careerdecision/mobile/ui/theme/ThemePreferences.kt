package com.careerdecision.mobile.ui.theme

import android.content.Context
import android.net.Uri
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.io.File
import java.io.IOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

const val DEFAULT_SEED_COLOR = "#386a20"
const val THEME_ALGORITHM_VERSION = "mcu-2021-v1"

enum class ThemeMode(val wireValue: String) {
    LIGHT("light"),
    DARK("dark"),
    SYSTEM("system")
}

enum class ThemeColorSource(val wireValue: String) {
    BRAND("brand"),
    SYSTEM("system"),
    CUSTOM_SEED("custom_seed"),
    CUSTOM_IMAGE("custom_image"),
    ACCOUNT("account")
}

enum class ThemeScope(val wireValue: String) {
    ANDROID("android")
}

enum class ThemeSchemeVariant(val wireValue: String) {
    TONAL_SPOT("tonal_spot")
}

data class ThemePreferences(
    val scope: ThemeScope = ThemeScope.ANDROID,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val colorSource: ThemeColorSource = ThemeColorSource.BRAND,
    val seedColor: String = DEFAULT_SEED_COLOR,
    val schemeVariant: ThemeSchemeVariant = ThemeSchemeVariant.TONAL_SPOT,
    val contrastLevel: Double = 0.0,
    val themeAlgorithmVersion: String = THEME_ALGORITHM_VERSION,
    val backgroundAssetId: String? = null,
    val backgroundUri: String? = null,
    val backgroundEnabled: Boolean = false,
    val backgroundSyncEnabled: Boolean = false,
    val focalX: Double = 0.5,
    val focalY: Double = 0.5,
    val scrimLevel: Double = 0.36,
    val version: Long = 1L,
    val updatedAt: Long = 0L
) {
    val hasBackground: Boolean
        get() = backgroundUri != null || backgroundAssetId != null

    fun normalized(): ThemePreferences {
        val safeUri = normalizeBackgroundUri(backgroundUri)
        val safeAssetId = backgroundAssetId?.trim()?.takeIf { it.isNotEmpty() }
        val hasUsableBackground = safeUri != null || safeAssetId != null
        return copy(
            scope = ThemeScope.ANDROID,
            seedColor = if (colorSource == ThemeColorSource.BRAND) {
                DEFAULT_SEED_COLOR
            } else {
                normalizeSeedColor(seedColor)
            },
            schemeVariant = ThemeSchemeVariant.TONAL_SPOT,
            contrastLevel = contrastLevel.takeIf(Double::isFinite)?.coerceIn(-1.0, 1.0) ?: 0.0,
            themeAlgorithmVersion = THEME_ALGORITHM_VERSION,
            backgroundAssetId = safeAssetId,
            backgroundUri = safeUri,
            backgroundEnabled = backgroundEnabled && hasUsableBackground,
            backgroundSyncEnabled = backgroundSyncEnabled && safeAssetId != null,
            focalX = focalX.takeIf(Double::isFinite)?.coerceIn(0.0, 1.0) ?: 0.5,
            focalY = focalY.takeIf(Double::isFinite)?.coerceIn(0.0, 1.0) ?: 0.5,
            scrimLevel = scrimLevel.takeIf(Double::isFinite)?.coerceIn(MIN_SCRIM, MAX_SCRIM)
                ?: DEFAULT_SCRIM,
            version = version.coerceAtLeast(1L),
            updatedAt = updatedAt.coerceAtLeast(0L)
        )
    }

    companion object {
        const val MIN_SCRIM = 0.2
        const val MAX_SCRIM = 0.8
        const val DEFAULT_SCRIM = 0.36

        val Default = ThemePreferences()
    }
}

fun normalizeSeedColor(value: String?): String {
    val candidate = value?.trim()?.lowercase().orEmpty()
    return if (HEX_SEED.matches(candidate)) candidate else DEFAULT_SEED_COLOR
}

fun normalizeBackgroundUri(value: String?): String? {
    val candidate = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val scheme = candidate.substringBefore(':', missingDelimiterValue = "").lowercase()
    return candidate.takeIf { scheme in ALLOWED_BACKGROUND_SCHEMES }
}

private val HEX_SEED = Regex("^#[0-9a-f]{6}$")
private val ALLOWED_BACKGROUND_SCHEMES = setOf("content", "file", "android.resource")
private val Context.themePreferencesDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "career_android_appearance_v1"
)

class ThemePreferencesRepository(context: Context) {
    private val applicationContext = context.applicationContext
    private val dataStore = applicationContext.themePreferencesDataStore

    val preferences: Flow<ThemePreferences> = dataStore.data
        .catch { error ->
            if (error is IOException) emit(emptyPreferences()) else throw error
        }
        .map(::readPreferences)

    suspend fun setThemeMode(mode: ThemeMode) = update {
        this[Keys.ThemeMode] = mode.wireValue
    }

    suspend fun setColorSource(source: ThemeColorSource) = update {
        this[Keys.ColorSource] = source.wireValue
        if (source == ThemeColorSource.BRAND) this[Keys.SeedColor] = DEFAULT_SEED_COLOR
    }

    suspend fun setSeedColor(
        seedColor: String,
        source: ThemeColorSource = ThemeColorSource.CUSTOM_SEED
    ) = update {
        this[Keys.SeedColor] = normalizeSeedColor(seedColor)
        this[Keys.ColorSource] = source.wireValue
    }

    suspend fun setContrastLevel(level: Double) = update {
        this[Keys.ContrastLevel] = level.takeIf(Double::isFinite)?.coerceIn(-1.0, 1.0) ?: 0.0
    }

    suspend fun setBackground(uri: Uri, seedColor: String? = null) {
        setBackground(uri.toString(), seedColor)
    }

    suspend fun setBackground(uri: String, seedColor: String? = null) {
        val safeUri = requireNotNull(normalizeBackgroundUri(uri)) {
            "Background must use a local content, file, or android.resource URI"
        }
        val storedUri = withContext(Dispatchers.IO) { promotePreparedBackground(safeUri) }
        update {
            this[Keys.BackgroundUri] = storedUri
            this[Keys.BackgroundEnabled] = true
            remove(Keys.BackgroundAssetId)
            this[Keys.BackgroundSyncEnabled] = false
            seedColor?.let {
                this[Keys.SeedColor] = normalizeSeedColor(it)
                this[Keys.ColorSource] = ThemeColorSource.CUSTOM_IMAGE.wireValue
            }
        }
    }

    suspend fun setBackgroundAsset(assetId: String?, syncEnabled: Boolean = false) = update {
        val safeId = assetId?.trim()?.takeIf(String::isNotEmpty)
        if (safeId == null) {
            remove(Keys.BackgroundAssetId)
            this[Keys.BackgroundSyncEnabled] = false
        } else {
            this[Keys.BackgroundAssetId] = safeId
            this[Keys.BackgroundSyncEnabled] = syncEnabled
        }
    }

    suspend fun clearBackground() {
        update {
            remove(Keys.BackgroundUri)
            remove(Keys.BackgroundAssetId)
            this[Keys.BackgroundEnabled] = false
            this[Keys.BackgroundSyncEnabled] = false
        }
        deleteLocalBackgroundFiles()
    }

    suspend fun setBackgroundEnabled(enabled: Boolean) = update {
        val hasBackground = contains(Keys.BackgroundUri) || contains(Keys.BackgroundAssetId)
        this[Keys.BackgroundEnabled] = enabled && hasBackground
    }

    suspend fun setBackgroundSyncEnabled(enabled: Boolean) = update {
        this[Keys.BackgroundSyncEnabled] = enabled && contains(Keys.BackgroundAssetId)
    }

    suspend fun setBackgroundScrim(level: Double) = update {
        this[Keys.ScrimLevel] = level.takeIf(Double::isFinite)
            ?.coerceIn(ThemePreferences.MIN_SCRIM, ThemePreferences.MAX_SCRIM)
            ?: ThemePreferences.DEFAULT_SCRIM
    }

    suspend fun setBackgroundFocalPoint(x: Double, y: Double) = update {
        this[Keys.FocalX] = x.takeIf(Double::isFinite)?.coerceIn(0.0, 1.0) ?: 0.5
        this[Keys.FocalY] = y.takeIf(Double::isFinite)?.coerceIn(0.0, 1.0) ?: 0.5
    }

    suspend fun resetTheme() {
        dataStore.edit { it.clear() }
        deleteLocalBackgroundFiles()
    }

    private suspend fun update(block: MutablePreferences.() -> Unit) {
        dataStore.edit { values ->
            values.block()
            values[Keys.Scope] = ThemeScope.ANDROID.wireValue
            values[Keys.SchemeVariant] = ThemeSchemeVariant.TONAL_SPOT.wireValue
            values[Keys.AlgorithmVersion] = THEME_ALGORITHM_VERSION
            values[Keys.Version] = (values[Keys.Version] ?: 1L) + 1L
            values[Keys.UpdatedAt] = System.currentTimeMillis()
        }
    }

    private fun promotePreparedBackground(uri: String): String {
        val parsed = Uri.parse(uri)
        if (parsed.scheme != "file") return uri
        val directory = File(applicationContext.filesDir, "appearance")
        val candidate = File(parsed.path.orEmpty())
        val expectedCandidate = File(directory, "android-background-candidate.webp")
        if (candidate.canonicalFile != expectedCandidate.canonicalFile) return uri
        require(candidate.isFile) { "处理后的背景图片不存在" }

        val target = File(directory, "android-background.webp")
        val temporary = File(directory, "android-background.tmp")
        candidate.copyTo(temporary, overwrite = true)
        try {
            try {
                Files.move(
                    temporary.toPath(),
                    target.toPath(),
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE
                )
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(
                    temporary.toPath(),
                    target.toPath(),
                    StandardCopyOption.REPLACE_EXISTING
                )
            }
            candidate.delete()
        } finally {
            temporary.delete()
        }
        return Uri.fromFile(target).toString()
    }

    private suspend fun deleteLocalBackgroundFiles() = withContext(Dispatchers.IO) {
        val directory = File(applicationContext.filesDir, "appearance")
        listOf(
            "android-background.webp",
            "android-background.tmp",
            "android-background-candidate.webp",
            "android-background-candidate.tmp"
        ).forEach { name -> File(directory, name).delete() }
    }

    private fun readPreferences(values: Preferences): ThemePreferences = ThemePreferences(
        scope = ThemeScope.ANDROID,
        themeMode = enumValue(values[Keys.ThemeMode], ThemeMode.entries, ThemeMode.SYSTEM),
        colorSource = enumValue(
            values[Keys.ColorSource],
            ThemeColorSource.entries,
            ThemeColorSource.BRAND
        ),
        seedColor = values[Keys.SeedColor] ?: DEFAULT_SEED_COLOR,
        schemeVariant = ThemeSchemeVariant.TONAL_SPOT,
        contrastLevel = values[Keys.ContrastLevel] ?: 0.0,
        themeAlgorithmVersion = THEME_ALGORITHM_VERSION,
        backgroundAssetId = values[Keys.BackgroundAssetId],
        backgroundUri = values[Keys.BackgroundUri],
        backgroundEnabled = values[Keys.BackgroundEnabled] ?: false,
        backgroundSyncEnabled = values[Keys.BackgroundSyncEnabled] ?: false,
        focalX = values[Keys.FocalX] ?: 0.5,
        focalY = values[Keys.FocalY] ?: 0.5,
        scrimLevel = values[Keys.ScrimLevel] ?: ThemePreferences.DEFAULT_SCRIM,
        version = values[Keys.Version] ?: 1L,
        updatedAt = values[Keys.UpdatedAt] ?: 0L
    ).normalized()

    private fun <T> enumValue(value: String?, entries: List<T>, fallback: T): T where T : Enum<T> {
        return entries.firstOrNull { entry ->
            when (entry) {
                is ThemeMode -> entry.wireValue == value
                is ThemeColorSource -> entry.wireValue == value
                else -> false
            }
        } ?: fallback
    }

    private object Keys {
        val Scope = stringPreferencesKey("scope")
        val ThemeMode = stringPreferencesKey("theme_mode")
        val ColorSource = stringPreferencesKey("color_source")
        val SeedColor = stringPreferencesKey("seed_color")
        val SchemeVariant = stringPreferencesKey("scheme_variant")
        val ContrastLevel = doublePreferencesKey("contrast_level")
        val AlgorithmVersion = stringPreferencesKey("theme_algorithm_version")
        val BackgroundAssetId = stringPreferencesKey("background_asset_id")
        val BackgroundUri = stringPreferencesKey("background_uri")
        val BackgroundEnabled = booleanPreferencesKey("background_enabled")
        val BackgroundSyncEnabled = booleanPreferencesKey("background_sync_enabled")
        val FocalX = doublePreferencesKey("focal_x")
        val FocalY = doublePreferencesKey("focal_y")
        val ScrimLevel = doublePreferencesKey("scrim_level")
        val Version = longPreferencesKey("version")
        val UpdatedAt = longPreferencesKey("updated_at")
    }
}

class ThemeController(
    repository: ThemePreferencesRepository,
    private val scope: CoroutineScope
) {
    val preferences: StateFlow<ThemePreferences> = repository.preferences.stateIn(
        scope = scope,
        started = SharingStarted.Eagerly,
        initialValue = ThemePreferences.Default
    )
    val currentPreferences: ThemePreferences
        get() = preferences.value

    private val mutableLastError = MutableStateFlow<Throwable?>(null)
    val lastError: StateFlow<Throwable?> = mutableLastError

    private val mutations = repository

    fun setThemeMode(mode: ThemeMode): Job = mutate { mutations.setThemeMode(mode) }

    fun setColorSource(source: ThemeColorSource): Job = mutate {
        mutations.setColorSource(source)
    }

    fun setSeedColor(
        seedColor: String,
        source: ThemeColorSource = ThemeColorSource.CUSTOM_SEED
    ): Job = mutate { mutations.setSeedColor(seedColor, source) }

    fun setContrastLevel(level: Double): Job = mutate { mutations.setContrastLevel(level) }

    fun setBackground(uri: Uri, seedColor: String? = null): Job = mutate {
        mutations.setBackground(uri, seedColor)
    }

    fun setBackground(uri: String, seedColor: String? = null): Job = mutate {
        mutations.setBackground(uri, seedColor)
    }

    fun clearBackground(): Job = mutate { mutations.clearBackground() }

    fun setBackgroundEnabled(enabled: Boolean): Job = mutate {
        mutations.setBackgroundEnabled(enabled)
    }

    fun setBackgroundSyncEnabled(enabled: Boolean): Job = mutate {
        mutations.setBackgroundSyncEnabled(enabled)
    }

    fun setBackgroundScrim(level: Double): Job = mutate {
        mutations.setBackgroundScrim(level)
    }

    fun setBackgroundFocalPoint(x: Double, y: Double): Job = mutate {
        mutations.setBackgroundFocalPoint(x, y)
    }

    fun resetTheme(): Job = mutate { mutations.resetTheme() }

    fun clearError() {
        mutableLastError.value = null
    }

    private fun mutate(block: suspend () -> Unit): Job = scope.launch {
        try {
            block()
            mutableLastError.value = null
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            mutableLastError.value = error
        }
    }
}
