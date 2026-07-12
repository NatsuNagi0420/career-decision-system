import {
  Hct,
  MaterialDynamicColors,
  SchemeTonalSpot,
  argbFromHex,
  customColor,
  hexFromArgb
} from '@material/material-color-utilities'

export const DEFAULT_SEED_COLOR = '#386a20'
export const PRESET_SEED_COLORS = [
  { label: '职途绿', value: DEFAULT_SEED_COLOR },
  { label: '远山蓝', value: '#2f5f8f' },
  { label: '花楸红', value: '#8b4a54' },
  { label: '鸢尾紫', value: '#67507e' },
  { label: '琥珀棕', value: '#785a2f' }
] as const

export type MaterialThemeOptions = {
  seedColor: string
  dark: boolean
  contrastLevel?: number
  target?: HTMLElement
}

const roleNames = [
  'background',
  'onBackground',
  'surface',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'outline',
  'outlineVariant',
  'inverseSurface',
  'inverseOnSurface',
  'shadow',
  'scrim',
  'surfaceTint',
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'inversePrimary',
  'primaryFixed',
  'primaryFixedDim',
  'onPrimaryFixed',
  'onPrimaryFixedVariant',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'secondaryFixed',
  'secondaryFixedDim',
  'onSecondaryFixed',
  'onSecondaryFixedVariant',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'tertiaryFixed',
  'tertiaryFixedDim',
  'onTertiaryFixed',
  'onTertiaryFixedVariant',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer'
] as const

type RoleName = (typeof roleNames)[number]

const cssName = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

export function normalizeSeedColor(value: string) {
  const normalized = value.trim()
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : DEFAULT_SEED_COLOR
}

function applyCustomColors(target: HTMLElement, sourceArgb: number, dark: boolean) {
  const customColors = [
    { key: 'success', value: '#2e6b3f' },
    { key: 'warning', value: '#815500' },
    { key: 'info', value: '#315da8' }
  ]

  for (const entry of customColors) {
    const generated = customColor(sourceArgb, {
      name: entry.key,
      value: argbFromHex(entry.value),
      blend: true
    })
    const group = dark ? generated.dark : generated.light
    target.style.setProperty(`--career-sys-color-${entry.key}`, hexFromArgb(group.color))
    target.style.setProperty(`--career-sys-color-on-${entry.key}`, hexFromArgb(group.onColor))
    target.style.setProperty(`--career-sys-color-${entry.key}-container`, hexFromArgb(group.colorContainer))
    target.style.setProperty(`--career-sys-color-on-${entry.key}-container`, hexFromArgb(group.onColorContainer))
  }
}

export function applyMaterialTheme(options: MaterialThemeOptions) {
  const target = options.target || document.documentElement
  const sourceArgb = argbFromHex(normalizeSeedColor(options.seedColor))
  const sourceHct = Hct.fromInt(sourceArgb)
  const scheme = new SchemeTonalSpot(
    sourceHct,
    options.dark,
    Math.max(-1, Math.min(1, options.contrastLevel ?? 0)),
    '2021'
  )
  const colors = new MaterialDynamicColors()

  for (const roleName of roleNames) {
    const colorFactory = colors[roleName] as () => { getArgb: (value: SchemeTonalSpot) => number }
    const argb = colorFactory.call(colors).getArgb(scheme)
    target.style.setProperty(`--md-sys-color-${cssName(roleName)}`, hexFromArgb(argb))
  }

  target.style.setProperty('--md-source-color', normalizeSeedColor(options.seedColor))
  target.style.setProperty('--md-sys-color-surface-container-legacy', target.style.getPropertyValue('--md-sys-color-surface-container'))
  applyCustomColors(target, sourceArgb, options.dark)

  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  themeMeta?.setAttribute('content', target.style.getPropertyValue('--md-sys-color-surface'))
}

export type MaterialColorRole = RoleName
