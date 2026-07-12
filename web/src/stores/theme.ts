import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { extractImageColors, optimizeBackgroundImage } from '@/design-system/theme/imagePalette'
import {
  applyMaterialTheme,
  DEFAULT_SEED_COLOR,
  normalizeSeedColor
} from '@/design-system/theme/materialTheme'
import {
  deleteBackgroundBlob,
  loadBackgroundBlob,
  saveBackgroundBlob
} from '@/design-system/theme/themeBackgroundStorage'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemeColorSource = 'brand' | 'custom_seed' | 'custom_image'

export type ThemePreferences = {
  version: 1
  themeMode: ThemeMode
  colorSource: ThemeColorSource
  seedColor: string
  contrastLevel: number
  backgroundEnabled: boolean
  backgroundScrim: number
  backgroundFocalX: number
  backgroundFocalY: number
  themeAlgorithmVersion: 'mcu-2021-v1'
}

const STORAGE_KEY = 'career-md3-theme-v1'
const BACKGROUND_ID = 'web-platform-background'

const defaults = (): ThemePreferences => ({
  version: 1,
  themeMode: 'system',
  colorSource: 'brand',
  seedColor: DEFAULT_SEED_COLOR,
  contrastLevel: 0,
  backgroundEnabled: false,
  backgroundScrim: 0.36,
  backgroundFocalX: 0.5,
  backgroundFocalY: 0.5,
  themeAlgorithmVersion: 'mcu-2021-v1'
})

function loadPreferences(): ThemePreferences {
  if (typeof window === 'undefined') return defaults()
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<ThemePreferences>
    const base = defaults()
    const mode = stored.themeMode
    const source = stored.colorSource
    return {
      ...base,
      ...stored,
      version: 1,
      themeMode: mode === 'light' || mode === 'dark' || mode === 'system' ? mode : base.themeMode,
      colorSource: source === 'brand' || source === 'custom_seed' || source === 'custom_image'
        ? source
        : base.colorSource,
      seedColor: normalizeSeedColor(stored.seedColor || base.seedColor),
      contrastLevel: Math.max(-1, Math.min(1, Number(stored.contrastLevel ?? 0))),
      backgroundScrim: Math.max(0.2, Math.min(0.8, Number(stored.backgroundScrim ?? base.backgroundScrim))),
      backgroundFocalX: Math.max(0, Math.min(1, Number(stored.backgroundFocalX ?? 0.5))),
      backgroundFocalY: Math.max(0, Math.min(1, Number(stored.backgroundFocalY ?? 0.5))),
      themeAlgorithmVersion: 'mcu-2021-v1'
    }
  } catch {
    return defaults()
  }
}

export const useThemeStore = defineStore('theme', () => {
  const preferences = ref<ThemePreferences>(loadPreferences())
  const systemDark = ref(false)
  const initialized = ref(false)
  const backgroundObjectUrl = ref('')
  const paletteCandidates = ref<string[]>([])
  let mediaQuery: MediaQueryList | null = null
  let mediaListener: ((event: MediaQueryListEvent) => void) | null = null

  const themeMode = computed(() => preferences.value.themeMode)
  const theme = computed(() => preferences.value.themeMode)
  const seedColor = computed(() => preferences.value.seedColor)
  const colorSource = computed(() => preferences.value.colorSource)
  const isDark = computed(() =>
    preferences.value.themeMode === 'dark' ||
    (preferences.value.themeMode === 'system' && systemDark.value)
  )
  const backgroundEnabled = computed(() =>
    preferences.value.backgroundEnabled && Boolean(backgroundObjectUrl.value)
  )
  const backgroundStyle = computed(() => ({
    backgroundImage: backgroundEnabled.value ? `url("${backgroundObjectUrl.value}")` : 'none',
    backgroundPosition: `${preferences.value.backgroundFocalX * 100}% ${preferences.value.backgroundFocalY * 100}%`,
    '--career-background-scrim-opacity': String(preferences.value.backgroundScrim)
  }))

  const persist = () => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.value))
    } catch {
      // 外观仍可在当前页面使用；隐私模式下允许持久化静默失败。
    }
  }

  const apply = () => {
    if (typeof document === 'undefined') return
    applyMaterialTheme({
      seedColor: preferences.value.seedColor,
      dark: isDark.value,
      contrastLevel: preferences.value.contrastLevel
    })
    document.documentElement.dataset.themeMode = isDark.value ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', isDark.value)
    document.documentElement.style.colorScheme = isDark.value ? 'dark' : 'light'
    persist()
  }

  const initialize = async () => {
    if (initialized.value || typeof window === 'undefined') return
    if (typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      systemDark.value = mediaQuery.matches
      mediaListener = (event) => {
        systemDark.value = event.matches
        apply()
      }
      mediaQuery.addEventListener?.('change', mediaListener)
    }

    try {
      const blob = await loadBackgroundBlob(BACKGROUND_ID)
      if (blob && typeof URL.createObjectURL === 'function') {
        backgroundObjectUrl.value = URL.createObjectURL(blob)
      }
    } catch {
      backgroundObjectUrl.value = ''
      preferences.value.backgroundEnabled = false
    } finally {
      initialized.value = true
      apply()
    }
  }

  const setTheme = (mode: ThemeMode) => {
    preferences.value.themeMode = mode
    apply()
  }

  const setSeedColor = (seed: string, source: ThemeColorSource = 'custom_seed') => {
    preferences.value.seedColor = normalizeSeedColor(seed)
    preferences.value.colorSource = source
    apply()
  }

  const setContrastLevel = (value: number) => {
    preferences.value.contrastLevel = Math.max(-1, Math.min(1, value))
    apply()
  }

  const setBackgroundEnabled = (enabled: boolean) => {
    preferences.value.backgroundEnabled = enabled && Boolean(backgroundObjectUrl.value)
    persist()
  }

  const setBackgroundScrim = (value: number) => {
    preferences.value.backgroundScrim = Math.max(0.2, Math.min(0.8, value))
    persist()
  }

  const setBackgroundFocalPoint = (x: number, y: number) => {
    preferences.value.backgroundFocalX = Math.max(0, Math.min(1, x))
    preferences.value.backgroundFocalY = Math.max(0, Math.min(1, y))
    persist()
  }

  const setBackgroundImage = async (file: File) => {
    const optimized = await optimizeBackgroundImage(file)
    const colors = await extractImageColors(optimized)
    await saveBackgroundBlob(BACKGROUND_ID, optimized)
    if (typeof URL.createObjectURL !== 'function') throw new Error('当前浏览器无法显示本地背景')
    if (backgroundObjectUrl.value && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(backgroundObjectUrl.value)
    backgroundObjectUrl.value = URL.createObjectURL(optimized)
    paletteCandidates.value = colors
    preferences.value.backgroundEnabled = true
    if (colors[0]) {
      preferences.value.seedColor = colors[0]
      preferences.value.colorSource = 'custom_image'
    }
    apply()
    return colors
  }

  const removeBackground = async () => {
    try {
      await deleteBackgroundBlob(BACKGROUND_ID)
    } catch {
      // 本地存储不可用时，仍要立即清除当前页面中的背景。
    } finally {
      if (backgroundObjectUrl.value && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(backgroundObjectUrl.value)
      backgroundObjectUrl.value = ''
      paletteCandidates.value = []
      preferences.value.backgroundEnabled = false
      persist()
    }
  }

  const resetTheme = async () => {
    preferences.value = defaults()
    paletteCandidates.value = []
    await removeBackground()
    apply()
  }

  const toggleTheme = () => setTheme(isDark.value ? 'light' : 'dark')

  watch(
    () => [preferences.value.themeMode, preferences.value.seedColor, preferences.value.contrastLevel],
    apply
  )

  onScopeDispose(() => {
    if (mediaQuery && mediaListener) mediaQuery.removeEventListener?.('change', mediaListener)
    if (backgroundObjectUrl.value && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(backgroundObjectUrl.value)
  })

  void initialize()

  return {
    preferences,
    theme,
    themeMode,
    seedColor,
    colorSource,
    isDark,
    initialized,
    backgroundEnabled,
    backgroundObjectUrl,
    backgroundStyle,
    paletteCandidates,
    initialize,
    setTheme,
    setSeedColor,
    setContrastLevel,
    setBackgroundEnabled,
    setBackgroundScrim,
    setBackgroundFocalPoint,
    setBackgroundImage,
    removeBackground,
    resetTheme,
    toggleTheme
  }
})
