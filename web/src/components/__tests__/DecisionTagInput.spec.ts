import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DecisionTagInput from '../DecisionTagInput.vue'
import M3Button from '@/design-system/components/M3Button.vue'
import M3IconButton from '@/design-system/components/M3IconButton.vue'
import M3TextField from '@/design-system/components/M3TextField.vue'

const components = { M3Button, M3IconButton, M3TextField }

describe('DecisionTagInput', () => {
  it('accepts Chinese punctuation and removes duplicate values', async () => {
    const wrapper = mount(DecisionTagInput, {
      props: { modelValue: ['成长空间'], label: '更在意什么' },
      global: { components }
    })
    const field = wrapper.get('md-outlined-text-field')
    ;(field.element as HTMLElement & { value: string }).value = '成长空间；能做出作品，实习岗位较多'
    await field.trigger('input')
    await field.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([
      '成长空间', '能做出作品', '实习岗位较多'
    ])
  })

  it('supports explicit keyboard-friendly ordering and removal controls', async () => {
    const wrapper = mount(DecisionTagInput, {
      props: { modelValue: ['兴趣', '成长'], label: '更在意什么' },
      global: { components }
    })

    await wrapper.get('[aria-label="将“成长”向前移动"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(['成长', '兴趣'])

    await wrapper.get('[aria-label="移除“兴趣”"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(['成长'])
  })

  it('respects the item limit', () => {
    const wrapper = mount(DecisionTagInput, {
      props: { modelValue: ['一', '二'], label: '条件', maxItems: 2 },
      global: { components }
    })

    expect(wrapper.get('md-outlined-text-field').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('已添加 2 / 2 项')
  })
})
