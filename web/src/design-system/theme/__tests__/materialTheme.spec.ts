import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyMaterialTheme,
  DEFAULT_SEED_COLOR,
  normalizeSeedColor
} from '../materialTheme'

const cssColor = /^#[0-9a-f]{6}$/i

describe('Material theme generation', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
    document.head.innerHTML = '<meta name="theme-color" content="">'
  })

  it('normalizes valid seeds and falls back for invalid input', () => {
    expect(normalizeSeedColor(' #A1B2C3 ')).toBe('#a1b2c3')
    expect(normalizeSeedColor('#abc')).toBe(DEFAULT_SEED_COLOR)
    expect(normalizeSeedColor('not-a-color')).toBe(DEFAULT_SEED_COLOR)
  })

  it('writes the complete light scheme and harmonized business colors', () => {
    applyMaterialTheme({ seedColor: '#2f5f8f', dark: false, contrastLevel: 0 })
    const style = document.documentElement.style

    for (const role of [
      '--md-sys-color-primary',
      '--md-sys-color-on-primary',
      '--md-sys-color-surface-container-lowest',
      '--md-sys-color-surface-container-highest',
      '--md-sys-color-outline-variant',
      '--career-sys-color-success',
      '--career-sys-color-warning',
      '--career-sys-color-info'
    ]) {
      expect(style.getPropertyValue(role)).toMatch(cssColor)
    }

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content'))
      .toBe(style.getPropertyValue('--md-sys-color-surface'))
  })

  it('generates distinct light and dark surface roles', () => {
    applyMaterialTheme({ seedColor: DEFAULT_SEED_COLOR, dark: false })
    const lightSurface = document.documentElement.style.getPropertyValue('--md-sys-color-surface')
    applyMaterialTheme({ seedColor: DEFAULT_SEED_COLOR, dark: true, contrastLevel: 1 })
    const darkSurface = document.documentElement.style.getPropertyValue('--md-sys-color-surface')

    expect(lightSurface).toMatch(cssColor)
    expect(darkSurface).toMatch(cssColor)
    expect(darkSurface).not.toBe(lightSurface)
  })
})
