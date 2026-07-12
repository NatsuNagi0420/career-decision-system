import type { DirectiveBinding, ObjectDirective } from 'vue'

export type MagneticTargetOptions = {
  /** Restricts a cursor instance to targets in the same group. */
  group?: string
  /** Overrides the attraction range token, in CSS pixels. */
  attractionRange?: number
}

type MagneticElement = HTMLElement & {
  __careerMagneticCleanup?: () => void
}

const DEFAULT_GROUP = 'default'

const clearTargetState = (element: MagneticElement) => {
  element.removeAttribute('data-magnetic-active')
  element.removeAttribute('data-magnetic-target')
  element.removeAttribute('data-magnetic-range')
}

const registerTarget = (
  element: MagneticElement,
  binding: DirectiveBinding<MagneticTargetOptions | undefined>
) => {
  const options = binding.value

  element.dataset.magneticTarget = options?.group || DEFAULT_GROUP

  if (typeof options?.attractionRange === 'number' && Number.isFinite(options.attractionRange)) {
    element.dataset.magneticRange = String(Math.max(0, options.attractionRange))
  } else {
    element.removeAttribute('data-magnetic-range')
  }
}

export const vMagnetic: ObjectDirective<MagneticElement, MagneticTargetOptions | undefined> = {
  mounted: (element, binding) => {
    registerTarget(element, binding)
    element.__careerMagneticCleanup = () => {
      clearTargetState(element)
      delete element.__careerMagneticCleanup
    }
  },
  updated: registerTarget,
  beforeUnmount: (element) => element.__careerMagneticCleanup?.()
}
