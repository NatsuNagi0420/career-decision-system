import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>('light')

  const isDark = computed(() => theme.value === 'dark')

  const applyThemeToDocument = (mode: ThemeMode) => {
    if (typeof window === 'undefined') return

    const root = document.documentElement

    if (mode === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    window.localStorage.setItem('theme', mode)
  }

  const setTheme = (mode: ThemeMode) => {
    theme.value = mode
    applyThemeToDocument(mode)
  }

  const toggleTheme = () => {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('theme') as ThemeMode | null
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
    } else {
      setTheme('light')
    }
  }

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  }
})
