export const THEME_TRANSITION_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const DEFAULT_DURATION_MS = 900
const DEFAULT_EASING = 'cubic-bezier(0.05, 0.7, 0.1, 1)'
const ROOT_PSEUDO_ELEMENT = '::view-transition-new(root)'
const SHADOW_CURSOR_LOCK_STYLE = ':host,:host *{cursor:none!important;}'

type ThemeUpdate = () => void | Promise<void>

type RunningTransition = {
  animation: Animation | null
  cancelled: boolean
  completion: Promise<void>
  root: HTMLElement
  shadowCursorLocks: Map<ShadowRoot, HTMLStyleElement>
  transition: ViewTransition
}

export type ThemeTransitionController = {
  cancel: () => void
  run: (trigger: HTMLElement, updateTheme: ThemeUpdate) => Promise<void>
}

const parseCssTime = (value: string) => {
  const normalized = value.trim().toLowerCase()
  const amount = Number.parseFloat(normalized)
  if (!Number.isFinite(amount)) return DEFAULT_DURATION_MS
  if (normalized.endsWith('ms')) return amount
  if (normalized.endsWith('s')) return amount * 1000
  return DEFAULT_DURATION_MS
}

const getRevealGeometry = (trigger: HTMLElement, view: Window) => {
  const bounds = trigger.getBoundingClientRect()
  const x = Math.max(0, Math.min(view.innerWidth, bounds.left + bounds.width / 2))
  const y = Math.max(0, Math.min(view.innerHeight, bounds.top + bounds.height / 2))
  const radius = Math.hypot(
    Math.max(x, view.innerWidth - x),
    Math.max(y, view.innerHeight - y)
  )

  return { x, y, radius }
}

const collectShadowRoots = (root: Document | ShadowRoot, result: ShadowRoot[] = []) => {
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    if (!element.shadowRoot || result.includes(element.shadowRoot)) continue
    result.push(element.shadowRoot)
    collectShadowRoots(element.shadowRoot, result)
  }
  return result
}

const syncShadowCursorLocks = (
  document: Document,
  locks: Map<ShadowRoot, HTMLStyleElement>
) => {
  for (const shadowRoot of collectShadowRoots(document)) {
    if (locks.has(shadowRoot)) continue
    const style = document.createElement('style')
    style.dataset.careerThemeCursorLock = 'true'
    style.textContent = SHADOW_CURSOR_LOCK_STYLE
    shadowRoot.append(style)
    locks.set(shadowRoot, style)
  }
}

const clearTransitionState = (
  root: HTMLElement,
  shadowCursorLocks: Map<ShadowRoot, HTMLStyleElement> = new Map()
) => {
  for (const style of shadowCursorLocks.values()) style.remove()
  shadowCursorLocks.clear()
  delete root.dataset.themeTransition
  delete root.dataset.themeTransitionUpdating
  delete root.dataset.themeTransitionCursor
  root.style.removeProperty('--career-theme-transition-x')
  root.style.removeProperty('--career-theme-transition-y')
  root.style.removeProperty('--career-theme-transition-radius')
}

const canAnimate = (document: Document, view: Window) =>
  document.visibilityState !== 'hidden' &&
  typeof document.startViewTransition === 'function' &&
  !view.matchMedia?.(THEME_TRANSITION_REDUCED_MOTION_QUERY).matches

export const createThemeTransition = (): ThemeTransitionController => {
  let running: RunningTransition | null = null

  const cancel = () => {
    const active = running
    if (!active) return

    active.cancelled = true
    try {
      active.animation?.cancel()
    } catch {
      // The animation may already have settled between unmount and cleanup.
    }
    try {
      active.transition.skipTransition()
    } catch {
      // The transition may already have settled between unmount and cleanup.
    }
    clearTransitionState(active.root, active.shadowCursorLocks)
    running = null
  }

  const run = async (trigger: HTMLElement, updateTheme: ThemeUpdate) => {
    if (running) {
      await running.completion
      return
    }

    const document = trigger.ownerDocument
    const view = document.defaultView
    if (!view || !canAnimate(document, view)) {
      await updateTheme()
      return
    }

    const root = document.documentElement
    const shadowCursorLocks = new Map<ShadowRoot, HTMLStyleElement>()
    const { x, y, radius } = getRevealGeometry(trigger, view)
    const rootStyle = view.getComputedStyle(root)
    const duration = parseCssTime(rootStyle.getPropertyValue('--career-motion-theme-reveal-duration'))
    const easing = rootStyle.getPropertyValue('--md-sys-motion-easing-emphasized-decelerate').trim() || DEFAULT_EASING

    root.dataset.themeTransition = 'running'
    if (root.hasAttribute('data-navigation-magnetic-cursor-visible')) {
      root.dataset.themeTransitionCursor = 'custom'
      syncShadowCursorLocks(document, shadowCursorLocks)
    }
    root.style.setProperty('--career-theme-transition-x', `${x}px`)
    root.style.setProperty('--career-theme-transition-y', `${y}px`)
    root.style.setProperty('--career-theme-transition-radius', `${radius}px`)

    let updateStarted = false
    let transitionState: RunningTransition | null = null
    let transition: ViewTransition
    try {
      transition = document.startViewTransition(async () => {
        updateStarted = true
        if (!transitionState?.cancelled) root.dataset.themeTransitionUpdating = ''
        await updateTheme()
        if (!transitionState?.cancelled && root.dataset.themeTransitionCursor === 'custom') {
          syncShadowCursorLocks(document, shadowCursorLocks)
        }
      })
    } catch {
      clearTransitionState(root, shadowCursorLocks)
      if (!updateStarted) await updateTheme()
      return
    }

    const active: RunningTransition = {
      animation: null,
      cancelled: false,
      completion: Promise.resolve(),
      root,
      shadowCursorLocks,
      transition
    }
    transitionState = active
    running = active

    const revealFinished = transition.ready.then(() => {
      delete root.dataset.themeTransitionUpdating
      if (active.cancelled || running !== active) return

      const origin = `${x}px ${y}px`
      active.animation = root.animate(
        {
          clipPath: [
            `circle(0px at ${origin})`,
            `circle(${radius}px at ${origin})`
          ]
        },
        {
          duration,
          easing,
          fill: 'both',
          pseudoElement: ROOT_PSEUDO_ELEMENT
        }
      )
      return active.animation.finished
    }).catch(() => {
      delete root.dataset.themeTransitionUpdating
      if (!active.cancelled) transition.skipTransition()
    })

    active.completion = Promise.allSettled([
      transition.finished,
      revealFinished
    ]).then(() => undefined)

    await active.completion
    if (running === active) {
      clearTransitionState(root, shadowCursorLocks)
      running = null
    }
  }

  return { cancel, run }
}
