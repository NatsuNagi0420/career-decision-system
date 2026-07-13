import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createThemeTransition,
  THEME_TRANSITION_REDUCED_MOTION_QUERY
} from '../themeTransition'

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({})
})

const setDocumentMethod = (name: 'startViewTransition', value: unknown) => {
  Object.defineProperty(document, name, { configurable: true, value })
}

const setMatchMedia = (reducedMotion: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === THEME_TRANSITION_REDUCED_MOTION_QUERY && reducedMotion,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  } as MediaQueryList)))
}

describe('themeTransition', () => {
  afterEach(() => {
    delete (document as Document & { startViewTransition?: unknown }).startViewTransition
    document.documentElement.removeAttribute('data-theme-transition')
    document.documentElement.removeAttribute('data-theme-transition-updating')
    document.documentElement.removeAttribute('data-theme-transition-cursor')
    document.documentElement.removeAttribute('data-navigation-magnetic-cursor-visible')
    document.documentElement.removeAttribute('style')
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reveals the new theme from the trigger center and covers the viewport', async () => {
    vi.stubGlobal('innerWidth', 1200)
    vi.stubGlobal('innerHeight', 800)
    setMatchMedia(false)

    const ready = createDeferred()
    const finished = createDeferred()
    const animationFinished = createDeferred()
    let updateCallback: (() => void | PromiseLike<void>) | undefined
    const skipTransition = vi.fn()
    const startViewTransition = vi.fn((callback: () => void | PromiseLike<void>) => {
      updateCallback = callback
      return {
        ready: ready.promise,
        finished: finished.promise,
        updateCallbackDone: Promise.resolve(),
        skipTransition
      } as unknown as ViewTransition
    })
    setDocumentMethod('startViewTransition', startViewTransition)

    const animation = {
      cancel: vi.fn(),
      finished: animationFinished.promise
    } as unknown as Animation
    const animate = vi.fn(() => animation)
    Object.defineProperty(document.documentElement, 'animate', {
      configurable: true,
      value: animate
    })

    const trigger = document.createElement('button')
    trigger.getBoundingClientRect = vi.fn(() => rect(100, 40, 120, 48))
    document.body.append(trigger)
    const shadowHost = document.createElement('div')
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' })
    shadowRoot.append(document.createElement('button'))
    document.body.append(shadowHost)
    trigger.focus()

    const root = document.documentElement
    root.style.setProperty('--career-motion-theme-reveal-duration', '900ms')
    root.style.setProperty(
      '--md-sys-motion-easing-emphasized-decelerate',
      'cubic-bezier(0.05, 0.7, 0.1, 1)'
    )
    root.setAttribute('data-navigation-magnetic-cursor-visible', '')
    const updateTheme = vi.fn()
    const controller = createThemeTransition()
    const runPromise = controller.run(trigger, updateTheme)

    expect(startViewTransition).toHaveBeenCalledTimes(1)
    expect(root.dataset.themeTransition).toBe('running')
    expect(root.dataset.themeTransitionCursor).toBe('custom')
    expect(shadowRoot.querySelector('[data-career-theme-cursor-lock="true"]')).not.toBeNull()
    expect(root.style.getPropertyValue('--career-theme-transition-x')).toBe('160px')
    expect(root.style.getPropertyValue('--career-theme-transition-y')).toBe('64px')
    expect(document.activeElement).toBe(trigger)

    await updateCallback?.()
    expect(updateTheme).toHaveBeenCalledTimes(1)
    expect(root.hasAttribute('data-theme-transition-updating')).toBe(true)

    ready.resolve()
    await vi.waitFor(() => expect(animate).toHaveBeenCalledTimes(1))
    const [keyframes, options] = animate.mock.calls[0]!
    const radius = Math.hypot(1040, 736)
    expect(keyframes).toEqual({
      clipPath: [
        'circle(0px at 160px 64px)',
        `circle(${radius}px at 160px 64px)`
      ]
    })
    expect(options).toMatchObject({
      duration: 900,
      easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
      fill: 'both',
      pseudoElement: '::view-transition-new(root)'
    })
    expect(root.hasAttribute('data-theme-transition-updating')).toBe(false)
    expect(document.activeElement).toBe(trigger)

    animationFinished.resolve()
    finished.resolve()
    await runPromise

    expect(root.hasAttribute('data-theme-transition')).toBe(false)
    expect(root.hasAttribute('data-theme-transition-cursor')).toBe(false)
    expect(shadowRoot.querySelector('[data-career-theme-cursor-lock="true"]')).toBeNull()
    expect(root.style.getPropertyValue('--career-theme-transition-radius')).toBe('')
    expect(document.activeElement).toBe(trigger)
    expect(skipTransition).not.toHaveBeenCalled()
  })

  it('switches directly when reduced motion is enabled', async () => {
    setMatchMedia(true)
    const startViewTransition = vi.fn()
    setDocumentMethod('startViewTransition', startViewTransition)
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const updateTheme = vi.fn()

    await createThemeTransition().run(trigger, updateTheme)

    expect(updateTheme).toHaveBeenCalledTimes(1)
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(false)
  })

  it('switches directly when the View Transitions API is unavailable', async () => {
    setMatchMedia(false)
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const updateTheme = vi.fn()

    await createThemeTransition().run(trigger, updateTheme)

    expect(updateTheme).toHaveBeenCalledTimes(1)
    expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(false)
  })

  it('does not stack theme updates while a transition is running', async () => {
    setMatchMedia(false)
    const ready = createDeferred()
    const finished = createDeferred()
    const animationFinished = createDeferred()
    let updateCallback: (() => void | PromiseLike<void>) | undefined
    const startViewTransition = vi.fn((callback: () => void | PromiseLike<void>) => {
      updateCallback = callback
      return {
        ready: ready.promise,
        finished: finished.promise,
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn()
      } as unknown as ViewTransition
    })
    setDocumentMethod('startViewTransition', startViewTransition)
    Object.defineProperty(document.documentElement, 'animate', {
      configurable: true,
      value: vi.fn(() => ({ finished: animationFinished.promise } as Animation))
    })

    const trigger = document.createElement('button')
    document.body.append(trigger)
    const firstUpdate = vi.fn()
    const ignoredUpdate = vi.fn()
    const controller = createThemeTransition()
    const firstRun = controller.run(trigger, firstUpdate)
    const secondRun = controller.run(trigger, ignoredUpdate)

    expect(startViewTransition).toHaveBeenCalledTimes(1)
    await updateCallback?.()
    ready.resolve()
    animationFinished.resolve()
    finished.resolve()
    await Promise.all([firstRun, secondRun])

    expect(firstUpdate).toHaveBeenCalledTimes(1)
    expect(ignoredUpdate).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(false)
  })
})
