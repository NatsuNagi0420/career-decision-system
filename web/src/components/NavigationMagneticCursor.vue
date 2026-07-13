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
  'a[href]',
  'button',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
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
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  'md-outlined-text-field',
  'md-slider',
  'dialog',
  'md-dialog',
  '[data-magnetic-ignore]'
].join(',')
const SHADOW_CURSOR_STYLE = ':host,:host *{cursor:none!important;}'

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
let targetCacheDirty = true
let targetCache: HTMLElement[] = []
let attractionRangeCache = new WeakMap<HTMLElement, number>()
let targetPresentationCache = new WeakMap<HTMLElement, { iconTarget: boolean; radius: string }>()
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
  const range = Number.isFinite(tokenRange) ? tokenRange : 48
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

const readTargetPresentation = (target: HTMLElement) => {
  const cachedPresentation = targetPresentationCache.get(target)
  if (cachedPresentation) return cachedPresentation

  const computed = getComputedStyle(target)
  const iconTarget = target.matches(ICON_TARGET_SELECTOR)
  const radius = computed.borderRadius !== '0px'
    ? computed.borderRadius
    : target.matches(PILL_TARGET_SELECTOR)
      ? 'var(--md-sys-shape-corner-full)'
      : 'var(--md-sys-shape-corner-medium)'
  const presentation = { iconTarget, radius }
  targetPresentationCache.set(target, presentation)
  return presentation
}

const setTargetGeometry = (target: HTMLElement) => {
  const element = cursorElement.value
  if (!element) return null

  const bounds = target.getBoundingClientRect()
  const { iconTarget, radius } = readTargetPresentation(target)
  const width = iconTarget ? Math.max(bounds.width + 16, 64) : bounds.width
  const height = iconTarget ? Math.min(bounds.height, 40) : bounds.height
  element.style.setProperty('--career-magnetic-target-width', `${width.toFixed(2)}px`)
  element.style.setProperty('--career-magnetic-target-height', `${height.toFixed(2)}px`)
  element.style.setProperty('--career-magnetic-target-radius', radius)
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2
  }
}

const setCursorPosition = (x: number, y: number) => {
  cursorElement.value?.style.setProperty('--career-magnetic-cursor-x', `${x.toFixed(2)}px`)
  cursorElement.value?.style.setProperty('--career-magnetic-cursor-y', `${y.toFixed(2)}px`)
}

const resetCursorAtPointer = () => {
  const shouldRestoreCursor = enabled.value && visible.value
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
  detachActiveTarget()
  releasing.value = true
  setCursorPosition(pointerX, pointerY)
  clearReleaseTimer()
  releaseTimer = window.setTimeout(finishRelease, RELEASE_DURATION_MS)
}

const activateTarget = (target: HTMLElement) => {
  clearReleaseTimer()
  releasing.value = false
  if (activeTarget && activeTarget !== target) removeTargetState(activeTarget)
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
}

const eventUsesNativeCursor = (event: PointerEvent) => event.composedPath().some((entry) =>
  entry instanceof Element && entry.matches(NATIVE_CURSOR_SELECTOR)
)

const handlePointerMove = (event: PointerEvent) => {
  if (!enabled.value || event.pointerType !== 'mouse' || eventUsesNativeCursor(event)) {
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
  if (event.pointerType === 'mouse') resetCursor()
}

const handlePointerDown = (event: PointerEvent) => {
  if (event.pointerType === 'mouse') keyboardNavigationActive = false
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return
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
  if (document.visibilityState !== 'visible') resetCursor()
}

const handleCapabilityChange = () => {
  enabled.value = Boolean(mediaQuery?.matches)
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
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('click', handleMagneticClick, true)
  document.addEventListener('pointercancel', resetCursor)
  document.addEventListener('focusin', handleFocusIn)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('scroll', handleLayoutChange, { capture: true, passive: true })
  window.addEventListener('blur', resetCursor)
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
      'data-magnetic-ignore'
    ]
  })
  handleCapabilityChange()
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', handleCapabilityChange)
  document.removeEventListener('pointermove', handlePointerMove)
  document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('click', handleMagneticClick, true)
  document.removeEventListener('pointercancel', resetCursor)
  document.removeEventListener('focusin', handleFocusIn)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.removeEventListener('scroll', handleLayoutChange, true)
  window.removeEventListener('blur', resetCursor)
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
