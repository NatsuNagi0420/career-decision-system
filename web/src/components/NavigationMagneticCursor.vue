<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  targetGroup?: string
  resetKey?: string
}>(), {
  targetGroup: 'primary-navigation',
  resetKey: ''
})

const ENABLED_QUERY = '(min-width: 600px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'
const RELEASE_DURATION_MS = 220
const AUTO_TARGET_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
  'md-filled-button:not([disabled])',
  'md-filled-tonal-button:not([disabled])',
  'md-outlined-button:not([disabled])',
  'md-text-button:not([disabled])',
  'md-icon-button:not([disabled])',
  'md-filled-icon-button:not([disabled])',
  'md-filled-tonal-icon-button:not([disabled])',
  'md-outlined-icon-button:not([disabled])',
  'md-menu-item:not([disabled])',
  'md-assist-chip:not([disabled])',
  'md-filter-chip:not([disabled])',
  'md-fab:not([disabled])',
  'md-checkbox:not([disabled])',
  'md-radio:not([disabled])',
  'md-switch:not([disabled])',
  '.m3-card--interactive'
].join(',')
const ICON_TARGET_SELECTOR = [
  'md-icon-button',
  'md-filled-icon-button',
  'md-filled-tonal-icon-button',
  'md-outlined-icon-button'
].join(',')
const PILL_TARGET_SELECTOR = [
  'md-filled-button',
  'md-filled-tonal-button',
  'md-outlined-button',
  'md-text-button',
  'md-assist-chip',
  'md-filter-chip',
  'md-checkbox',
  'md-radio',
  'md-switch',
  ICON_TARGET_SELECTOR
].join(',')
const NATIVE_CURSOR_SELECTOR = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"])',
  'input[type="range"]',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  'md-outlined-text-field',
  'md-slider',
  'dialog',
  'md-dialog',
  '[data-magnetic-ignore]'
].join(',')
const PRESERVED_MEDIA_SELECTOR = 'img:not([data-magnetic-invert]),[data-magnetic-preserve]'
const SCROLLABLE_OVERFLOW_VALUES = new Set(['auto', 'scroll'])
const SHADOW_CURSOR_STYLE = [
  ':host,:host *{cursor:none!important;}',
  ':host([data-magnetic-active="true"]) md-ripple{--md-ripple-pressed-opacity:0!important;}'
].join('')

const cursorElement = ref<HTMLElement | null>(null)
const enabled = ref(false)
const visible = ref(false)
const magneticActive = ref(false)
const releasing = ref(false)

let mediaQuery: MediaQueryList | null = null
let activeTarget: HTMLElement | null = null
let frame = 0
let releaseTimer = 0
let pointerX = 0
let pointerY = 0
let keyboardNavigationActive = false
let precisionPointerActive = false
let targetCacheDirty = true
let targetCache: HTMLElement[] = []
let attractionRangeCache = new WeakMap<HTMLElement, number>()
let targetPresentationCache = new WeakMap<HTMLElement, { surface: HTMLElement; radius: string }>()
let preservedMediaElementsCache = new WeakMap<HTMLElement, HTMLElement[]>()
let preservedMediaFrame = 0
let preservedMediaStableFrames = 0
let preservedMediaBoundsKey = ''
let mutationObserver: MutationObserver | null = null
const shadowCursorStyles = new Map<ShadowRoot, HTMLStyleElement>()

const clearReleaseTimer = () => {
  if (releaseTimer) window.clearTimeout(releaseTimer)
  releaseTimer = 0
}

const invalidateTargetCache = () => {
  targetCacheDirty = true
  attractionRangeCache = new WeakMap()
  targetPresentationCache = new WeakMap()
  preservedMediaElementsCache = new WeakMap()
}

const stopPreservedMediaTracking = () => {
  if (preservedMediaFrame) cancelAnimationFrame(preservedMediaFrame)
  preservedMediaFrame = 0
  preservedMediaStableFrames = 0
  preservedMediaBoundsKey = ''
}

const clearPreservedMediaMask = () => {
  const element = cursorElement.value
  if (!element) return
  element.removeAttribute('data-magnetic-preserved-media')
  element.style.removeProperty('mask-image')
  element.style.removeProperty('-webkit-mask-image')
  element.style.removeProperty('mask-size')
  element.style.removeProperty('-webkit-mask-size')
}

const removeTargetState = (target: HTMLElement | null) => {
  target?.removeAttribute('data-magnetic-active')
}

const detachActiveTarget = () => {
  removeTargetState(activeTarget)
  activeTarget = null
  magneticActive.value = false
}

const collectShadowRoots = (root: Document | ShadowRoot, result: ShadowRoot[] = []) => {
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    if (!element.shadowRoot || result.includes(element.shadowRoot)) continue
    result.push(element.shadowRoot)
    collectShadowRoots(element.shadowRoot, result)
  }
  return result
}

const syncShadowCursorStyles = () => {
  const activeRoots = new Set(collectShadowRoots(document))
  for (const root of activeRoots) {
    let style = shadowCursorStyles.get(root)
    if (!style || !style.isConnected) {
      style = document.createElement('style')
      style.dataset.careerMagneticCursor = 'true'
      style.textContent = SHADOW_CURSOR_STYLE
      root.append(style)
      shadowCursorStyles.set(root, style)
    }
  }
  for (const [root, style] of shadowCursorStyles) {
    if (!activeRoots.has(root)) {
      style.remove()
      shadowCursorStyles.delete(root)
    }
  }
}

const clearShadowCursorStyles = () => {
  for (const style of shadowCursorStyles.values()) style.remove()
  shadowCursorStyles.clear()
}

const setCursorVisibility = (nextVisible: boolean) => {
  const visibilityChanged = visible.value !== nextVisible
  visible.value = nextVisible
  const cursorVisible = enabled.value && nextVisible
  document.documentElement.toggleAttribute(
    'data-navigation-magnetic-cursor-visible',
    cursorVisible
  )
  document.body.toggleAttribute('data-navigation-magnetic-cursor-visible', cursorVisible)
  if (nextVisible && visibilityChanged) syncShadowCursorStyles()
  if (!nextVisible && visibilityChanged) clearShadowCursorStyles()
}

const resetCursor = () => {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  clearReleaseTimer()
  releasing.value = false
  detachActiveTarget()
  if (cursorElement.value) {
    cursorElement.value.dataset.magneticActive = 'false'
    cursorElement.value.dataset.magneticReleasing = 'false'
  }
  stopPreservedMediaTracking()
  clearPreservedMediaMask()
  setCursorVisibility(false)
}

const readAttractionRange = (target: HTMLElement) => {
  const cachedRange = attractionRangeCache.get(target)
  if (cachedRange !== undefined) return cachedRange

  const targetRange = Number.parseFloat(target.dataset.magneticRange || '')
  if (Number.isFinite(targetRange)) {
    attractionRangeCache.set(target, targetRange)
    return targetRange
  }

  const tokenRange = Number.parseFloat(
    getComputedStyle(target).getPropertyValue('--career-navigation-cursor-attraction-range')
  )
  const range = Number.isFinite(tokenRange) ? tokenRange : 16
  attractionRangeCache.set(target, range)
  return range
}

const collectTargets = () => {
  if (!targetCacheDirty) return targetCache

  const targets = new Set<HTMLElement>()

  for (const target of document.querySelectorAll<HTMLElement>('[data-magnetic-target]')) {
    if (target.dataset.magneticTarget === props.targetGroup) targets.add(target)
  }
  for (const target of document.querySelectorAll<HTMLElement>(AUTO_TARGET_SELECTOR)) {
    const registeredGroup = target.dataset.magneticTarget
    if (!registeredGroup || registeredGroup === props.targetGroup) targets.add(target)
  }

  targetCache = [...targets].filter((target) => {
    if (!target.isConnected) return false
    if (target.hasAttribute('data-magnetic-ignore') || target.closest('[data-magnetic-ignore]')) return false
    if (target.matches(':disabled,[aria-disabled="true"]')) return false
    if (target.closest('[hidden],[inert],[aria-hidden="true"]')) return false
    return true
  })
  targetCacheDirty = false
  return targetCache
}

const CLIPPING_OVERFLOW_VALUES = new Set(['auto', 'clip', 'hidden', 'scroll'])

const isFullyWithinClippingAncestors = (target: HTMLElement, bounds: DOMRect) => {
  let ancestor = target.parentElement
  while (ancestor && ancestor !== document.body) {
    const style = getComputedStyle(ancestor)
    const clipsX = CLIPPING_OVERFLOW_VALUES.has(style.overflowX)
    const clipsY = CLIPPING_OVERFLOW_VALUES.has(style.overflowY)
    if (clipsX || clipsY) {
      const ancestorBounds = ancestor.getBoundingClientRect()
      const clipLeft = ancestorBounds.left + ancestor.clientLeft
      const clipTop = ancestorBounds.top + ancestor.clientTop
      const clipRight = clipLeft + ancestor.clientWidth
      const clipBottom = clipTop + ancestor.clientHeight
      if (clipsX && (bounds.left < clipLeft - 1 || bounds.right > clipRight + 1)) return false
      if (clipsY && (bounds.top < clipTop - 1 || bounds.bottom > clipBottom + 1)) return false
    }
    ancestor = ancestor.parentElement
  }
  return bounds.right > 0
    && bounds.bottom > 0
    && bounds.left < window.innerWidth
    && bounds.top < window.innerHeight
}

const isTargetVisible = (target: HTMLElement, bounds: DOMRect, pointerClientX: number, pointerClientY: number) => {
  const style = getComputedStyle(target)
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none' || style.opacity === '0') {
    return false
  }
  if (!isFullyWithinClippingAncestors(target, bounds)) return false

  if (typeof document.elementFromPoint !== 'function') return true
  const probeX = Math.min(Math.max(pointerClientX, bounds.left + 1), bounds.right - 1)
  const probeY = Math.min(Math.max(pointerClientY, bounds.top + 1), bounds.bottom - 1)
  const hit = document.elementFromPoint(probeX, probeY)
  return !hit || hit === target || target.contains(hit) || hit.contains(target)
}

const findMagneticTarget = (x: number, y: number) => {
  let closest: { element: HTMLElement; distance: number; area: number } | null = null

  for (const target of collectTargets()) {
    const bounds = target.getBoundingClientRect()
    if (!bounds.width || !bounds.height) continue

    const distanceX = Math.max(bounds.left - x, 0, x - bounds.right)
    const distanceY = Math.max(bounds.top - y, 0, y - bounds.bottom)
    const distance = Math.hypot(distanceX, distanceY)
    if (distance > readAttractionRange(target)) continue
    if (!isTargetVisible(target, bounds, x, y)) continue

    const area = bounds.width * bounds.height
    if (!closest || distance < closest.distance || (distance === closest.distance && area < closest.area)) {
      closest = { element: target, distance, area }
    }
  }

  return closest?.element ?? null
}

const findElementAcrossOpenRoots = (
  root: HTMLElement | ShadowRoot,
  selector: string
): HTMLElement | null => {
  try {
    const match = root.querySelector<HTMLElement>(selector)
    if (match) return match
    if (root instanceof HTMLElement && root.shadowRoot) {
      const shadowMatch = findElementAcrossOpenRoots(root.shadowRoot, selector)
      if (shadowMatch) return shadowMatch
    }
    for (const element of root.querySelectorAll<HTMLElement>('*')) {
      if (!element.shadowRoot) continue
      const nestedMatch = findElementAcrossOpenRoots(element.shadowRoot, selector)
      if (nestedMatch) return nestedMatch
    }
  } catch {
    // Invalid selectors should never break pointer interaction; the host remains the surface.
  }
  return null
}

const resolveTargetSurface = (target: HTMLElement) => {
  const selector = target.dataset.magneticSurface?.trim()
  if (!selector || selector === 'self') return target
  return findElementAcrossOpenRoots(target, selector) ?? target
}

const readTargetPresentation = (target: HTMLElement) => {
  const cachedPresentation = targetPresentationCache.get(target)
  if (cachedPresentation) return cachedPresentation

  const surface = resolveTargetSurface(target)
  const computed = getComputedStyle(surface)
  const computedRadius = computed.borderRadius.trim()
  const explicitRadius = target.dataset.magneticRadius?.trim()
  const radius = explicitRadius
    || (computedRadius && computedRadius !== '0px'
    ? computedRadius
    : target.matches(PILL_TARGET_SELECTOR)
      ? 'var(--md-sys-shape-corner-full)'
      : computedRadius || '0px')
  const presentation = { surface, radius }
  targetPresentationCache.set(target, presentation)
  return presentation
}

const collectElementsAcrossOpenRoots = (
  root: Element | ShadowRoot,
  selector: string,
  result = new Set<HTMLElement>()
) => {
  if (root instanceof HTMLElement && root.matches(selector)) result.add(root)
  if (root instanceof HTMLElement && root.shadowRoot) {
    collectElementsAcrossOpenRoots(root.shadowRoot, selector, result)
  }
  for (const element of root.querySelectorAll<HTMLElement>(selector)) result.add(element)
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    if (element.shadowRoot) collectElementsAcrossOpenRoots(element.shadowRoot, selector, result)
  }
  return result
}

const composedContains = (ancestor: HTMLElement, descendant: HTMLElement) => {
  let node: Node | null = descendant
  while (node) {
    if (node === ancestor) return true
    node = node.parentNode instanceof ShadowRoot
      ? node.parentNode.host
      : node.parentNode
  }
  return false
}

const readCornerRadius = (element: HTMLElement, width: number, height: number) => {
  const style = getComputedStyle(element)
  const radius = Number.parseFloat(
    element.style.borderTopLeftRadius
    || element.style.borderRadius
    || style.borderTopLeftRadius
    || style.borderRadius
  )
  return Number.isFinite(radius) ? Math.min(radius, width / 2, height / 2) : 0
}

const applyPreservedMediaMask = (
  target: HTMLElement,
  cursorBounds: { left: number; top: number; right: number; bottom: number; width: number; height: number }
) => {
  const element = cursorElement.value
  if (!element || cursorBounds.width <= 0 || cursorBounds.height <= 0) return 0

  let protectedElements = preservedMediaElementsCache.get(target)
  if (!protectedElements) {
    const candidates = collectElementsAcrossOpenRoots(target, PRESERVED_MEDIA_SELECTOR)
    const explicitContainers = [...candidates].filter((candidate) => candidate.hasAttribute('data-magnetic-preserve'))
    protectedElements = [...candidates].filter((candidate) => (
      candidate.hasAttribute('data-magnetic-preserve')
      || !explicitContainers.some((container) => container !== candidate && composedContains(container, candidate))
    ))
    preservedMediaElementsCache.set(target, protectedElements)
  }

  const padding = 1
  const holes = protectedElements.flatMap((media) => {
    const bounds = media.getBoundingClientRect()
    const left = Math.max(bounds.left - padding, cursorBounds.left)
    const top = Math.max(bounds.top - padding, cursorBounds.top)
    const right = Math.min(bounds.right + padding, cursorBounds.right)
    const bottom = Math.min(bounds.bottom + padding, cursorBounds.bottom)
    if (right <= left || bottom <= top) return []

    const width = right - left
    const height = bottom - top
    const fullyVisible = bounds.left >= cursorBounds.left
      && bounds.top >= cursorBounds.top
      && bounds.right <= cursorBounds.right
      && bounds.bottom <= cursorBounds.bottom
    return [{
      x: left - cursorBounds.left,
      y: top - cursorBounds.top,
      width,
      height,
      radius: fullyVisible
        ? Math.min(readCornerRadius(media, width, height) + padding, width / 2, height / 2)
        : 0
    }]
  })

  if (!holes.length) {
    clearPreservedMediaMask()
    return 0
  }

  const holeMarkup = holes.map((hole) => (
    `<rect x="${hole.x.toFixed(2)}" y="${hole.y.toFixed(2)}" width="${hole.width.toFixed(2)}" height="${hole.height.toFixed(2)}" rx="${hole.radius.toFixed(2)}" fill="black"/>`
  )).join('')
  const maskSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cursorBounds.width.toFixed(2)} ${cursorBounds.height.toFixed(2)}" preserveAspectRatio="none">`,
    '<defs><mask id="preserved-media" maskUnits="userSpaceOnUse">',
    `<rect width="${cursorBounds.width.toFixed(2)}" height="${cursorBounds.height.toFixed(2)}" fill="white"/>`,
    holeMarkup,
    '</mask></defs>',
    `<rect width="${cursorBounds.width.toFixed(2)}" height="${cursorBounds.height.toFixed(2)}" fill="white" mask="url(#preserved-media)"/>`,
    '</svg>'
  ].join('')
  const maskImage = `url("data:image/svg+xml,${encodeURIComponent(maskSvg)}")`
  element.dataset.magneticPreservedMedia = String(holes.length)
  element.style.setProperty('mask-image', maskImage)
  element.style.setProperty('-webkit-mask-image', maskImage)
  element.style.setProperty('mask-size', '100% 100%')
  element.style.setProperty('-webkit-mask-size', '100% 100%')
  return holes.length
}

const trackPreservedMediaDuringSnap = () => {
  if (preservedMediaFrame || !activeTarget || !cursorElement.value) return

  const updateMask = () => {
    preservedMediaFrame = 0
    const target = activeTarget
    const element = cursorElement.value
    if (!target || !element || !magneticActive.value) return

    const bounds = element.getBoundingClientRect()
    const count = applyPreservedMediaMask(target, {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height
    })
    if (!count) return

    const nextBoundsKey = [bounds.left, bounds.top, bounds.width, bounds.height]
      .map((value) => value.toFixed(2))
      .join(':')
    preservedMediaStableFrames = nextBoundsKey === preservedMediaBoundsKey
      ? preservedMediaStableFrames + 1
      : 0
    preservedMediaBoundsKey = nextBoundsKey
    if (preservedMediaStableFrames < 3) preservedMediaFrame = requestAnimationFrame(updateMask)
  }

  preservedMediaFrame = requestAnimationFrame(updateMask)
}

const setTargetGeometry = (target: HTMLElement) => {
  const element = cursorElement.value
  if (!element) return null

  const targetBounds = target.getBoundingClientRect()
  const { surface, radius } = readTargetPresentation(target)
  const surfaceBounds = surface.getBoundingClientRect()
  const bounds = surfaceBounds.width > 0 && surfaceBounds.height > 0
    ? surfaceBounds
    : targetBounds
  const width = bounds.width
  const height = bounds.height
  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2
  element.style.setProperty('--career-magnetic-target-width', `${width.toFixed(2)}px`)
  element.style.setProperty('--career-magnetic-target-height', `${height.toFixed(2)}px`)
  element.style.setProperty('--career-magnetic-target-radius', radius)
  return {
    x: centerX,
    y: centerY
  }
}

const setCursorPosition = (x: number, y: number) => {
  cursorElement.value?.style.setProperty('--career-magnetic-cursor-x', `${x.toFixed(2)}px`)
  cursorElement.value?.style.setProperty('--career-magnetic-cursor-y', `${y.toFixed(2)}px`)
}

const resetCursorAtPointer = () => {
  const shouldRestoreCursor = enabled.value && visible.value
  precisionPointerActive = false
  resetCursor()
  if (!shouldRestoreCursor) return

  setCursorPosition(pointerX, pointerY)
  setCursorVisibility(true)
  if (!frame) frame = requestAnimationFrame(renderCursor)
}

const finishRelease = () => {
  clearReleaseTimer()
  releasing.value = false
  if (cursorElement.value) cursorElement.value.dataset.magneticReleasing = 'false'
  setCursorPosition(pointerX, pointerY)
}

const beginRelease = () => {
  if (!activeTarget) return

  if (cursorElement.value) {
    cursorElement.value.dataset.magneticReleasing = 'true'
    cursorElement.value.dataset.magneticActive = 'false'
  }
  stopPreservedMediaTracking()
  detachActiveTarget()
  clearPreservedMediaMask()
  releasing.value = true
  setCursorPosition(pointerX, pointerY)
  clearReleaseTimer()
  releaseTimer = window.setTimeout(finishRelease, RELEASE_DURATION_MS)
}

const activateTarget = (target: HTMLElement) => {
  clearReleaseTimer()
  releasing.value = false
  if (activeTarget && activeTarget !== target) {
    removeTargetState(activeTarget)
    stopPreservedMediaTracking()
    clearPreservedMediaMask()
  }
  activeTarget = target
  void cursorElement.value?.offsetWidth
  if (cursorElement.value) {
    cursorElement.value.dataset.magneticReleasing = 'false'
    cursorElement.value.dataset.magneticActive = 'true'
  }
  target.setAttribute('data-magnetic-active', 'true')
  magneticActive.value = true
}

const renderCursor = () => {
  frame = 0
  if (!enabled.value || !cursorElement.value) {
    resetCursor()
    return
  }

  const nextTarget = findMagneticTarget(pointerX, pointerY)
  let position = { x: pointerX, y: pointerY }
  if (nextTarget) {
    position = setTargetGeometry(nextTarget) ?? position
    if (nextTarget !== activeTarget) activateTarget(nextTarget)
  } else if (activeTarget) {
    beginRelease()
  }
  setCursorPosition(position?.x ?? pointerX, position?.y ?? pointerY)
  setCursorVisibility(true)
  if (nextTarget) trackPreservedMediaDuringSnap()
}

const pointerIsOnScrollbar = (element: HTMLElement, x: number, y: number) => {
  const style = getComputedStyle(element)
  const bounds = element.getBoundingClientRect()
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0
  const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0
  const measuredVerticalScrollbar = Math.max(0, element.offsetWidth - element.clientWidth - borderLeft - borderRight)
  const measuredHorizontalScrollbar = Math.max(0, element.offsetHeight - element.clientHeight - borderTop - borderBottom)
  const overlayScrollbarSize = style.scrollbarWidth === 'thin' ? 8 : 12
  const verticalScrollbarWidth = measuredVerticalScrollbar || overlayScrollbarSize
  const horizontalScrollbarHeight = measuredHorizontalScrollbar || overlayScrollbarSize
  const hasVerticalScrollbar = SCROLLABLE_OVERFLOW_VALUES.has(style.overflowY)
    && element.scrollHeight > element.clientHeight
  const hasHorizontalScrollbar = SCROLLABLE_OVERFLOW_VALUES.has(style.overflowX)
    && element.scrollWidth > element.clientWidth

  return (hasVerticalScrollbar && x >= bounds.right - borderRight - verticalScrollbarWidth)
    || (hasHorizontalScrollbar && y >= bounds.bottom - borderBottom - horizontalScrollbarHeight)
}

const eventUsesNativeCursor = (event: PointerEvent) => event.composedPath().some((entry) => (
  entry instanceof Element && entry.matches(NATIVE_CURSOR_SELECTOR)
) || (
  entry instanceof HTMLElement && pointerIsOnScrollbar(entry, event.clientX, event.clientY)
))

const handlePointerMove = (event: PointerEvent) => {
  if (!enabled.value || event.pointerType !== 'mouse' || precisionPointerActive || eventUsesNativeCursor(event)) {
    resetCursor()
    return
  }

  keyboardNavigationActive = false
  pointerX = event.clientX
  pointerY = event.clientY
  if (releasing.value) finishRelease()
  if (!activeTarget) {
    setCursorPosition(pointerX, pointerY)
    setCursorVisibility(true)
  }
  if (!frame) frame = requestAnimationFrame(renderCursor)
}

const handlePointerLeave = (event: PointerEvent) => {
  if (event.pointerType !== 'mouse') return
  precisionPointerActive = false
  resetCursor()
}

const handlePointerDown = (event: PointerEvent) => {
  if (event.pointerType !== 'mouse') return
  keyboardNavigationActive = false
  precisionPointerActive = eventUsesNativeCursor(event)
  if (precisionPointerActive) resetCursor()
}

const handlePointerUp = (event: PointerEvent) => {
  if (event.pointerType === 'mouse') precisionPointerActive = false
}

const handlePointerCancel = () => {
  precisionPointerActive = false
  resetCursor()
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return
  precisionPointerActive = false
  keyboardNavigationActive = true
}

const resolveActivationElement = (target: HTMLElement) =>
  target.shadowRoot?.querySelector<HTMLElement>(
    'a[href],button:not(:disabled),input:not(:disabled),[role="button"],[role="menuitem"],[role="tab"],[role="switch"],[tabindex]:not([tabindex="-1"])'
  ) ?? target

const handleMagneticClick = (event: MouseEvent) => {
  const target = activeTarget
  if (
    !enabled.value
    || !target
    || event.button !== 0
    || event.defaultPrevented
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || event.composedPath().includes(target)
  ) return

  if (!target.isConnected || target.matches(':disabled,[aria-disabled="true"]')) {
    detachActiveTarget()
    return
  }

  if (findMagneticTarget(event.clientX, event.clientY) !== target) return

  event.preventDefault()
  event.stopImmediatePropagation()
  keyboardNavigationActive = false
  const activationElement = resolveActivationElement(target)
  activationElement.focus({ preventScroll: true })
  activationElement.click()
}

const handleFocusIn = (event: FocusEvent) => {
  if (
    keyboardNavigationActive
    && event.target instanceof HTMLElement
    && event.target.matches(':focus-visible')
  ) resetCursor()
}

const handleVisibilityChange = () => {
  if (document.visibilityState !== 'visible') {
    precisionPointerActive = false
    resetCursor()
  }
}

const handleWindowBlur = () => {
  precisionPointerActive = false
  resetCursor()
}

const handleCapabilityChange = () => {
  enabled.value = Boolean(mediaQuery?.matches)
  precisionPointerActive = false
  document.documentElement.toggleAttribute('data-navigation-magnetic-cursor', enabled.value)
  invalidateTargetCache()
  resetCursor()
}

const handleLayoutChange = () => {
  invalidateTargetCache()
  if (enabled.value && visible.value && !frame) frame = requestAnimationFrame(renderCursor)
}

const handleTargetMutation = () => {
  invalidateTargetCache()
  if (enabled.value && visible.value) syncShadowCursorStyles()
  if (enabled.value && visible.value && !frame) frame = requestAnimationFrame(renderCursor)
}

watch(() => props.resetKey, () => {
  invalidateTargetCache()
  resetCursorAtPointer()
})

watch(() => props.targetGroup, () => {
  invalidateTargetCache()
  resetCursor()
})

onMounted(() => {
  mediaQuery = window.matchMedia(ENABLED_QUERY)
  mediaQuery.addEventListener('change', handleCapabilityChange)
  document.addEventListener('pointermove', handlePointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', handlePointerLeave, { passive: true })
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('pointerup', handlePointerUp, true)
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('click', handleMagneticClick, true)
  document.addEventListener('pointercancel', handlePointerCancel)
  document.addEventListener('focusin', handleFocusIn)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('scroll', handleLayoutChange, { capture: true, passive: true })
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('resize', handleLayoutChange, { passive: true })
  mutationObserver = new MutationObserver(handleTargetMutation)
  mutationObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'href',
      'role',
      'class',
      'disabled',
      'aria-disabled',
      'aria-hidden',
      'hidden',
      'inert',
      'data-magnetic-target',
      'data-magnetic-range',
      'data-magnetic-ignore',
      'data-magnetic-surface',
      'data-magnetic-radius'
    ]
  })
  handleCapabilityChange()
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', handleCapabilityChange)
  document.removeEventListener('pointermove', handlePointerMove)
  document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('pointerup', handlePointerUp, true)
  document.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('click', handleMagneticClick, true)
  document.removeEventListener('pointercancel', handlePointerCancel)
  document.removeEventListener('focusin', handleFocusIn)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.removeEventListener('scroll', handleLayoutChange, true)
  window.removeEventListener('blur', handleWindowBlur)
  window.removeEventListener('resize', handleLayoutChange)
  mutationObserver?.disconnect()
  mutationObserver = null
  resetCursor()
  document.documentElement.removeAttribute('data-navigation-magnetic-cursor')
  document.documentElement.removeAttribute('data-navigation-magnetic-cursor-visible')
  document.body.removeAttribute('data-navigation-magnetic-cursor-visible')
  mediaQuery = null
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="cursorElement"
      class="navigation-magnetic-cursor"
      :data-enabled="enabled ? 'true' : 'false'"
      :data-visible="visible ? 'true' : 'false'"
      :data-magnetic-active="magneticActive ? 'true' : 'false'"
      :data-magnetic-releasing="releasing ? 'true' : 'false'"
      aria-hidden="true"
    ></div>
  </Teleport>
</template>

<style scoped>
:global(html[data-navigation-magnetic-cursor-visible] body[data-navigation-magnetic-cursor-visible]),
:global(html[data-navigation-magnetic-cursor-visible] body[data-navigation-magnetic-cursor-visible] *) {
  cursor: none;
}

.navigation-magnetic-cursor {
  position: fixed;
  z-index: 2147483647;
  top: 0;
  left: 0;
  width: var(--career-magnetic-cursor-size, 26px);
  height: var(--career-magnetic-cursor-size, 26px);
  visibility: hidden;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--career-magnetic-cursor-color);
  mix-blend-mode: difference;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(var(--career-magnetic-cursor-x, -24px), var(--career-magnetic-cursor-y, -24px), 0) translate(-50%, -50%);
  transition:
    width var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    height var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    border-radius var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    opacity var(--career-motion-magnetic-follow-duration) var(--md-sys-motion-easing-standard);
  will-change: transform, width, height;
}

.navigation-magnetic-cursor[data-visible='true'] { visibility: visible; opacity: 1; }

.navigation-magnetic-cursor[data-visible='false'] {
  transition-property: opacity;
}

.navigation-magnetic-cursor[data-magnetic-active='true'] {
  width: var(--career-magnetic-target-width, var(--career-magnetic-cursor-size, 26px));
  height: var(--career-magnetic-target-height, var(--career-magnetic-cursor-size, 26px));
  border-radius: var(--career-magnetic-target-radius, var(--md-sys-shape-corner-full));
  transition:
    width var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    height var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    border-radius var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    opacity var(--career-motion-magnetic-follow-duration) var(--md-sys-motion-easing-standard),
    transform var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate);
}

.navigation-magnetic-cursor[data-magnetic-releasing='true'] {
  transition:
    width var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    height var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    border-radius var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate),
    opacity var(--career-motion-magnetic-follow-duration) var(--md-sys-motion-easing-standard),
    transform var(--career-motion-magnetic-snap-duration) var(--md-sys-motion-easing-emphasized-decelerate);
}

@media (max-width: 599px), (hover: none), (pointer: coarse), (prefers-reduced-motion: reduce) {
  .navigation-magnetic-cursor { display: none; }
}
</style>
