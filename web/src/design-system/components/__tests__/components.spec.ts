import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import M3Card from '../M3Card.vue'
import M3Button from '../M3Button.vue'
import M3Select from '../M3Select.vue'
import M3TextField from '../M3TextField.vue'

describe('MD3 component adapters', () => {
  it('keeps default-slot icons and labels in one centered flex row', () => {
    const wrapper = mount(M3Button, {
      slots: { default: '<svg aria-hidden="true"></svg><span>新建项目</span>' }
    })
    const label = wrapper.get('.m3-button__label')
    expect(label.find('svg').exists()).toBe(true)
    expect(label.text()).toBe('新建项目')
  })

  it('emits trimmed numeric text-field values for v-model modifiers', async () => {
    const wrapper = mount(M3TextField, {
      props: { modelValue: '', modelModifiers: { trim: true, number: true } }
    })
    const field = wrapper.get('md-outlined-text-field')
    ;(field.element as HTMLElement & { value: string }).value = ' 42 '
    await field.trigger('input')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([42])
  })

  it('inherits an accessible name from a wrapping label', () => {
    const wrapper = mount({
      components: { M3TextField },
      template: '<label>用户名<M3TextField /></label>'
    })
    expect(wrapper.get('md-outlined-text-field').attributes('aria-label')).toBe('用户名')
  })

  it('preserves bound numeric option values in M3Select', async () => {
    const wrapper = mount(M3Select, {
      props: { modelValue: 2 },
      slots: { default: '<option value="1">一</option><option value="2">二</option>' }
    })
    const select = wrapper.get('select').element as HTMLSelectElement
    ;(select.options[0] as HTMLOptionElement & { _value?: number })._value = 1
    ;(select.options[1] as HTMLOptionElement & { _value?: number })._value = 2
    select.selectedIndex = 0
    await wrapper.get('select').trigger('change')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([1])
  })

  it('uses a non-submitting button for interactive cards', async () => {
    const wrapper = mount(M3Card, {
      props: { tag: 'button', interactive: true },
      slots: { default: '打开计划' }
    })
    await nextTick()
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
  })
})
