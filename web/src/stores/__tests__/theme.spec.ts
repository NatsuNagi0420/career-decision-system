import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SEED_COLOR } from '@/design-system/theme/materialTheme'

const mocks = vi.hoisted(() => ({
  applyMaterialTheme: vi.fn(),
  loadBackgroundBlob: vi.fn(),
  saveBackgroundBlob: vi.fn(),
  deleteBackgroundBlob: vi.fn(),
  optimizeBackgroundImage: vi.fn(),
  extractImageColors: vi.fn()
}))

vi.mock('@/design-system/theme/materialTheme', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/design-system/theme/materialTheme')>(),
  applyMaterialTheme: mocks.applyMaterialTheme
}))

vi.mock('@/design-system/theme/themeBackgroundStorage', () => ({
  loadBackgroundBlob: mocks.loadBackgroundBlob,
  saveBackgroundBlob: mocks.saveBackgroundBlob,
  deleteBackgroundBlob: mocks.deleteBackgroundBlob
}))

vi.mock('@/design-system/theme/imagePalette', () => ({
  optimizeBackgroundImage: mocks.optimizeBackgroundImage,
  extractImageColors: mocks.extractImageColors
}))

import { useThemeStore } from '../theme'

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.loadBackgroundBlob.mockResolvedValue(undefined)
    mocks.saveBackgroundBlob.mockResolvedValue(undefined)
    mocks.deleteBackgroundBlob.mockResolvedValue(undefined)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:theme-background')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn()
    })
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme-mode')
    document.documentElement.classList.remove('dark')
  })

  it('applies the default system-light theme after initialization', async () => {
    const store = useThemeStore()
    await vi.waitFor(() => expect(store.initialized).toBe(true))

    expect(store.seedColor).toBe(DEFAULT_SEED_COLOR)
    expect(store.isDark).toBe(false)
    expect(mocks.applyMaterialTheme).toHaveBeenCalledWith(expect.objectContaining({
      seedColor: DEFAULT_SEED_COLOR,
      dark: false,
      contrastLevel: 0
    }))
    store.$dispose()
  })

  it('normalizes and clamps stored preferences', async () => {
    localStorage.setItem('career-md3-theme-v1', JSON.stringify({
      themeMode: 'dark',
      colorSource: 'custom_seed',
      seedColor: '#ABCDEF',
      contrastLevel: 4,
      backgroundScrim: 0.01,
      backgroundFocalX: 3,
      backgroundFocalY: -2
    }))
    const store = useThemeStore()
    await vi.waitFor(() => expect(store.initialized).toBe(true))

    expect(store.seedColor).toBe('#abcdef')
    expect(store.isDark).toBe(true)
    expect(store.preferences.contrastLevel).toBe(1)
    expect(store.preferences.backgroundScrim).toBe(0.2)
    expect(store.preferences.backgroundFocalX).toBe(1)
    expect(store.preferences.backgroundFocalY).toBe(0)
    store.$dispose()
  })

  it('still initializes when IndexedDB is unavailable', async () => {
    mocks.loadBackgroundBlob.mockRejectedValueOnce(new Error('blocked'))
    const store = useThemeStore()
    await vi.waitFor(() => expect(store.initialized).toBe(true))

    expect(store.backgroundEnabled).toBe(false)
    expect(mocks.applyMaterialTheme).toHaveBeenCalled()
    store.$dispose()
  })

  it('keeps the web background in its platform-specific local slot', async () => {
    const optimized = new Blob(['optimized'], { type: 'image/webp' })
    mocks.optimizeBackgroundImage.mockResolvedValueOnce(optimized)
    mocks.extractImageColors.mockResolvedValueOnce(['#123456', '#654321'])
    const store = useThemeStore()
    await vi.waitFor(() => expect(store.initialized).toBe(true))

    await store.setBackgroundImage(new File(['source'], 'source.png', { type: 'image/png' }))
    expect(mocks.saveBackgroundBlob).toHaveBeenCalledWith('web-platform-background', optimized)
    expect(store.backgroundEnabled).toBe(true)
    expect(store.seedColor).toBe('#123456')
    expect(store.colorSource).toBe('custom_image')
    store.$dispose()
  })
})
