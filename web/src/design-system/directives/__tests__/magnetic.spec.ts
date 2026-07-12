import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { vMagnetic, type MagneticTargetOptions } from '../magnetic'

const MagneticHost = defineComponent({
  directives: { magnetic: vMagnetic },
  props: {
    options: {
      type: Object as () => MagneticTargetOptions,
      default: () => ({})
    }
  },
  template: '<a v-magnetic="options"><span class="indicator"></span></a>'
})

describe('v-magnetic target registry', () => {
  it('registers declarative target metadata without moving the target or its children', () => {
    const wrapper = mount(MagneticHost, {
      props: {
        options: {
          group: 'primary-navigation',
          attractionRange: 36
        }
      }
    })
    const target = wrapper.get('a').element as HTMLElement
    const indicator = wrapper.get('.indicator').element as HTMLElement

    expect(target.dataset.magneticTarget).toBe('primary-navigation')
    expect(target.dataset.magneticRange).toBe('36')
    expect(target.style.transform).toBe('')
    expect(indicator.style.transform).toBe('')
    expect(target.style.getPropertyValue('--career-magnetic-x')).toBe('')
    expect(target.style.getPropertyValue('--career-magnetic-y')).toBe('')
  })

  it('updates optional metadata and normalizes the attraction range', async () => {
    const wrapper = mount(MagneticHost, {
      props: {
        options: {
          group: 'primary-navigation',
          attractionRange: 20
        }
      }
    })
    const target = wrapper.get('a').element as HTMLElement

    await wrapper.setProps({ options: { group: 'secondary', attractionRange: -8 } })
    expect(target.dataset.magneticTarget).toBe('secondary')
    expect(target.dataset.magneticRange).toBe('0')

    await wrapper.setProps({ options: { attractionRange: Number.POSITIVE_INFINITY } })
    expect(target.dataset.magneticTarget).toBe('default')
    expect(target.dataset.magneticRange).toBeUndefined()
  })

  it('clears registration and active state when its host unmounts', () => {
    const wrapper = mount(MagneticHost, {
      props: { options: { group: 'primary-navigation' } }
    })
    const target = wrapper.get('a').element as HTMLElement
    target.dataset.magneticActive = 'true'

    wrapper.unmount()

    expect(target.dataset.magneticTarget).toBeUndefined()
    expect(target.dataset.magneticRange).toBeUndefined()
    expect(target.dataset.magneticActive).toBeUndefined()
  })
})
