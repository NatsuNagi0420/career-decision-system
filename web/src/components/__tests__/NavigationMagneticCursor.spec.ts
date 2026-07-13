import { nextTick } from 'vue'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NavigationMagneticCursor from '../NavigationMagneticCursor.vue'

type MutableMediaQuery = MediaQueryList & { setMatches: (matches: boolean) => void }

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

const createMediaQuery = (initialMatches: boolean): MutableMediaQuery => {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  return {
    get matches() { return matches },
    media: '(min-width: 600px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener as (event: MediaQueryListEvent) => void)
    }),
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener as (event: MediaQueryListEvent) => void)
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches, media: this.media } as MediaQueryListEvent
      for (const listener of listeners) listener(event)
    }
  } as MutableMediaQuery
}

const pointerEvent = (
  type: string,
  options: MouseEventInit & { pointerType?: string } = {}
) => {
  const event = new MouseEvent(type, { bubbles: true, ...options })
  Object.defineProperty(event, 'pointerType', { value: options.pointerType || 'mouse' })
  return event
}

describe('NavigationMagneticCursor', () => {
  let mediaQuery: MutableMediaQuery
  let frames: Map<number, FrameRequestCallback>
  let nextFrame: number
  let wrapper: VueWrapper | undefined

  const flushAnimationFrames = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback(0)
  }

  const mountCursor = (matches = true) => {
    mediaQuery = createMediaQuery(matches)
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery))
    wrapper = mount(NavigationMagneticCursor, {
      attachTo: document.body,
      props: { targetGroup: 'primary-navigation', resetKey: '/settings' }
    })
    return wrapper
  }

  const getCursor = () => new DOMWrapper(
    document.body.querySelector<HTMLElement>('.navigation-magnetic-cursor')
  )

  const appendTarget = () => {
    const target = document.createElement('a')
    target.dataset.magneticTarget = 'primary-navigation'
    target.getBoundingClientRect = vi.fn(() => rect(100, 100, 100, 60))

    const indicator = document.createElement('span')
    indicator.className = 'indicator'
    indicator.getBoundingClientRect = vi.fn(() => rect(120, 110, 56, 40))
    target.append(indicator)
    document.body.append(target)
    return target
  }

  beforeEach(() => {
    frames = new Map()
    nextFrame = 0
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrame
      frames.set(id, callback)
      return id
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      frames.delete(id)
    }))
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.documentElement.removeAttribute('data-navigation-magnetic-cursor')
    document.documentElement.removeAttribute('data-navigation-magnetic-cursor-visible')
    document.body.removeAttribute('data-navigation-magnetic-cursor-visible')
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stays disabled for devices that do not satisfy the fine-pointer motion query', async () => {
    mountCursor(false)
    const cursor = getCursor()

    expect(cursor.attributes('data-enabled')).toBe('false')
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor')).toBe(false)

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()

    expect(cursor.attributes('data-visible')).toBe('false')
    expect(cursor.attributes('data-magnetic-active')).toBe('false')
  })

  it('snaps only the cursor layer to a nearby target and releases back to the pointer', async () => {
    const target = appendTarget()
    mountCursor()
    const cursor = getCursor()
    const targetRectBefore = target.getBoundingClientRect()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 210, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()

    expect(cursor.attributes('data-enabled')).toBe('true')
    expect(cursor.attributes('data-visible')).toBe('true')
    expect(cursor.attributes('data-magnetic-active')).toBe('true')
    expect(target.dataset.magneticActive).toBe('true')
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor-visible')).toBe(true)
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-cursor-x: 150.00px')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-cursor-y: 130.00px')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-target-width: 100.00px')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-target-height: 60.00px')
    expect(target.style.transform).toBe('')
    expect(target.getBoundingClientRect()).toMatchObject({
      left: targetRectBefore.left,
      top: targetRectBefore.top,
      width: targetRectBefore.width,
      height: targetRectBefore.height
    })

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 360 }))
    flushAnimationFrames()
    await nextTick()

    expect(cursor.attributes('data-magnetic-active')).toBe('false')
    expect(target.dataset.magneticActive).toBeUndefined()
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-cursor-x: 300.00px')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-cursor-y: 360.00px')

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 360 }))
    flushAnimationFrames()
    await nextTick()

    expect(cursor.attributes('data-visible')).toBe('true')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-cursor-x: 400.00px')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-cursor-y: 360.00px')
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor-visible')).toBe(true)

    document.dispatchEvent(pointerEvent('pointermove', {
      clientX: 400,
      clientY: 360,
      pointerType: 'touch'
    }))
    await nextTick()

    expect(cursor.attributes('data-visible')).toBe('false')
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor-visible')).toBe(false)
  })

  it('keeps nearby text outside the tightened attraction range free', async () => {
    const target = appendTarget()
    mountCursor()
    const cursor = getCursor()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 224, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()

    expect(target.dataset.magneticActive).toBeUndefined()
    expect(cursor.attributes('data-magnetic-active')).toBe('false')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-cursor-x: 224.00px')

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 212, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()

    expect(target.dataset.magneticActive).toBe('true')
    expect(cursor.attributes('data-magnetic-active')).toBe('true')
  })

  it('automatically adapts standard interactive components', async () => {
    const button = document.createElement('button')
    button.textContent = '保存'
    button.getBoundingClientRect = vi.fn(() => rect(480, 100, 120, 48))
    document.body.append(button)
    mountCursor()
    const cursor = getCursor()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 610, clientY: 124 }))
    flushAnimationFrames()
    await nextTick()

    expect(button.dataset.magneticActive).toBe('true')
    expect(cursor.attributes('data-magnetic-active')).toBe('true')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-cursor-x: 540.00px')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-target-width: 120.00px')
    expect(cursor.element.getAttribute('style')).toContain('--career-magnetic-target-height: 48.00px')
  })

  it('hides native cursors inside shadow roots mounted after the cursor is visible', async () => {
    mountCursor()
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 320, clientY: 180 }))
    flushAnimationFrames()
    await nextTick()

    const menuItem = document.createElement('md-menu-item')
    menuItem.getBoundingClientRect = vi.fn(() => rect(100, 100, 180, 48))
    const shadowRoot = menuItem.attachShadow({ mode: 'open' })
    const interactive = document.createElement('li')
    interactive.className = 'list-item'
    interactive.style.cursor = 'pointer'
    shadowRoot.append(interactive)
    document.body.append(menuItem)
    await nextTick()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 190, clientY: 124 }))
    flushAnimationFrames()
    await nextTick()

    const injectedStyle = shadowRoot.querySelector<HTMLStyleElement>(
      'style[data-career-magnetic-cursor="true"]'
    )
    expect(menuItem.dataset.magneticActive).toBe('true')
    expect(injectedStyle?.textContent).toBe(':host,:host *{cursor:none!important;}')
  })

  it('ignores targets clipped by a horizontal scroller until they are fully visible', async () => {
    const scroller = document.createElement('div')
    scroller.style.overflowX = 'auto'
    scroller.getBoundingClientRect = vi.fn(() => rect(100, 100, 120, 60))
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 120 },
      clientHeight: { configurable: true, value: 60 }
    })

    const target = document.createElement('button')
    let targetBounds = rect(180, 110, 100, 40)
    target.getBoundingClientRect = vi.fn(() => targetBounds)
    scroller.append(target)
    document.body.append(scroller)
    mountCursor()
    const cursor = getCursor()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()

    expect(target.dataset.magneticActive).toBeUndefined()
    expect(cursor.attributes('data-magnetic-active')).toBe('false')

    targetBounds = rect(110, 110, 100, 40)
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 160, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()

    expect(target.dataset.magneticActive).toBe('true')
    expect(cursor.attributes('data-magnetic-active')).toBe('true')
  })

  it('forwards a plain click from the attraction area to the active target', async () => {
    const target = appendTarget()
    const handleClick = vi.fn()
    target.addEventListener('click', handleClick)
    mountCursor()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 210, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()
    expect(target.dataset.magneticActive).toBe('true')

    document.body.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 210,
      clientY: 130
    }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('activates the actionable control inside an open shadow root', async () => {
    const target = document.createElement('div')
    target.dataset.magneticTarget = 'primary-navigation'
    target.getBoundingClientRect = vi.fn(() => rect(100, 100, 100, 60))
    const shadowRoot = target.attachShadow({ mode: 'open' })
    const link = document.createElement('a')
    link.href = '#shadow-action'
    const handleClick = vi.fn((event: MouseEvent) => event.preventDefault())
    link.addEventListener('click', handleClick)
    shadowRoot.append(link)
    document.body.append(target)
    mountCursor()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 210, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()
    expect(target.dataset.magneticActive).toBe('true')

    document.body.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 210,
      clientY: 130
    }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('restores the native cursor for precision controls', async () => {
    const input = document.createElement('input')
    input.type = 'text'
    document.body.append(input)
    mountCursor()
    const cursor = getCursor()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 320, clientY: 180 }))
    flushAnimationFrames()
    await nextTick()
    expect(cursor.attributes('data-visible')).toBe('true')

    input.dispatchEvent(pointerEvent('pointermove', { clientX: 320, clientY: 180 }))
    await nextTick()

    expect(cursor.attributes('data-visible')).toBe('false')
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor-visible')).toBe(false)
  })

  it('clears active state when capabilities change, the route resets, or the page blurs', async () => {
    const target = appendTarget()
    const mounted = mountCursor()
    const cursor = getCursor()

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()
    expect(target.dataset.magneticActive).toBe('true')

    await mounted.setProps({ resetKey: '/explore' })
    expect(cursor.attributes('data-visible')).toBe('true')
    expect(target.dataset.magneticActive).toBeUndefined()
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor-visible')).toBe(true)

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 130 }))
    flushAnimationFrames()
    await nextTick()
    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(cursor.attributes('data-visible')).toBe('false')
    expect(target.dataset.magneticActive).toBeUndefined()

    mediaQuery.setMatches(false)
    await nextTick()
    expect(cursor.attributes('data-enabled')).toBe('false')
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor')).toBe(false)
  })

  it('removes global cursor state and media listeners on unmount', () => {
    const mounted = mountCursor()
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor')).toBe(true)

    mounted.unmount()
    wrapper = undefined

    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor')).toBe(false)
    expect(document.documentElement.hasAttribute('data-navigation-magnetic-cursor-visible')).toBe(false)
    expect(document.body.hasAttribute('data-navigation-magnetic-cursor-visible')).toBe(false)
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('teleports the cursor visual layer to the body stacking context', () => {
    mountCursor()

    expect(getCursor().element.parentElement).toBe(document.body)
  })
})
