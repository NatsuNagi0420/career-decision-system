import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Assistant from '../Assistant.vue'
import type { AssistantChatResponse, AssistantSessionSummary } from '@/api/assistant'

const assistantChatApi = vi.hoisted(() => vi.fn())
const assistantSessionApi = vi.hoisted(() => vi.fn())
const assistantSessionsApi = vi.hoisted(() => vi.fn())
const renameAssistantSessionApi = vi.hoisted(() => vi.fn())
const deleteAssistantSessionApi = vi.hoisted(() => vi.fn())
const replace = vi.hoisted(() => vi.fn())
const route = vi.hoisted(() => ({
  path: '/assistant',
  query: {} as Record<string, string>
}))
let wrapper: VueWrapper | undefined

vi.mock('@/api/assistant', () => ({
  assistantChatApi,
  assistantSessionApi,
  assistantSessionsApi,
  renameAssistantSessionApi,
  deleteAssistantSessionApi
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace })
}))

const confirm = vi.hoisted(() => vi.fn())
const m3Message = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn()
}))
vi.mock('@/design-system/services/feedback', () => ({
  M3ConfirmCancelledError: class M3ConfirmCancelledError extends Error {},
  m3Confirm: confirm,
  m3Message
}))

const summary = (overrides: Partial<AssistantSessionSummary> = {}): AssistantSessionSummary => ({
  id: 7,
  title: '岗位方向比较',
  lastPage: '/assistant',
  messageCount: 4,
  lastMessage: '先验证真实岗位。',
  createdAt: '2026-07-11T10:00:00',
  updatedAt: '2026-07-11T10:30:00',
  ...overrides
})

const response = (overrides: Partial<AssistantChatResponse> = {}): AssistantChatResponse => ({
  sessionId: 7,
  generationMode: 'llm',
  modelName: 'test-model',
  confidence: 0.9,
  reply: '先验证真实岗位。',
  evidenceBasis: [],
  uncertainties: [],
  nextStep: null,
  actions: [],
  ...overrides
})

const stubs = {
  AssistantAvatar: {
    props: ['state'],
    template: '<span class="avatar-stub" :data-assistant-state="state" />'
  },
  M3Button: {
    inheritAttrs: false,
    props: ['disabled'],
    template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>'
  },
  M3Card: {
    inheritAttrs: false,
    props: ['tag'],
    template: '<component :is="tag || \'article\'" v-bind="$attrs"><slot /></component>'
  },
  M3CircularProgress: { template: '<span class="progress-stub" />' },
  M3EmptyState: {
    props: ['title', 'description'],
    template: '<section><h2>{{ title }}</h2><p>{{ description }}</p><slot name="actions" /></section>'
  },
  M3ErrorState: {
    props: ['title', 'description'],
    template: '<section role="alert"><strong>{{ title }}</strong><p>{{ description }}</p><slot name="actions" /></section>'
  },
  M3IconButton: {
    inheritAttrs: false,
    props: ['label', 'disabled'],
    template: '<button v-bind="$attrs" :aria-label="label" :disabled="disabled"><slot /></button>'
  },
  M3TextArea: {
    inheritAttrs: false,
    props: ['modelValue', 'label', 'disabled'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :aria-label="label" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  M3TextField: {
    inheritAttrs: false,
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }
}

const mountAssistant = () => {
  wrapper = mount(Assistant, { global: { stubs } })
  return wrapper
}

describe('standalone Assistant', () => {
  beforeEach(() => {
    route.query = {}
    replace.mockReset().mockResolvedValue(undefined)
    assistantChatApi.mockReset()
    assistantSessionApi.mockReset()
    assistantSessionsApi.mockReset()
    renameAssistantSessionApi.mockReset()
    deleteAssistantSessionApi.mockReset().mockResolvedValue({ sessionId: 7, deleted: true })
    confirm.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('restores the visual state attached to every historical assistant reply', async () => {
    route.query = { session: '7' }
    assistantSessionsApi.mockResolvedValue([summary()])
    assistantSessionApi.mockResolvedValue({
      id: 7,
      title: '岗位方向比较',
      lastPage: '/assistant',
      createdAt: '2026-07-11T10:00:00',
      updatedAt: '2026-07-11T10:30:00',
      messages: [
        { id: 1, requestId: 'one', role: 'assistant', content: '信息不足。', response: response({ confidence: 0.3, reply: '信息不足。' }), createdAt: '2026-07-11T10:10:00' },
        { id: 2, requestId: 'two', role: 'assistant', content: '可以开始比较。', response: response({ reply: '可以开始比较。' }), createdAt: '2026-07-11T10:20:00' }
      ]
    })

    const page = mountAssistant()
    await flushPromises()
    await flushPromises()

    const states = page.findAll('.conversation-message-row.assistant [data-assistant-state]')
      .map((avatar) => avatar.attributes('data-assistant-state'))
    expect(states).toEqual(['warning', 'explaining'])
  })

  it('does not turn a persisted reply into a failed send when history refresh fails', async () => {
    assistantSessionsApi
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('历史刷新失败'))
    assistantChatApi.mockResolvedValue(response({
      sessionId: 8,
      reply: '消息已经成功保存。'
    }))

    const page = mountAssistant()
    await flushPromises()
    await page.get('textarea[aria-label="向穗奈提问"]').setValue('保留这条消息')
    await page.get('button[aria-label="发送消息"]').trigger('click')
    await flushPromises()
    await flushPromises()

    expect(assistantChatApi).toHaveBeenCalledTimes(1)
    expect(page.text()).toContain('消息已经成功保存。')
    expect(page.text()).toContain('会话历史暂时不可用')
    expect(page.find('.conversation-message.user.failed').exists()).toBe(false)
    expect(page.text()).not.toContain('发送失败，请重试后再继续会话')
  })

  it('permanently deletes the active session after confirmation and starts a new one', async () => {
    route.query = { session: '7' }
    assistantSessionsApi.mockResolvedValue([summary()])
    assistantSessionApi.mockResolvedValue({
      id: 7,
      title: '岗位方向比较',
      lastPage: '/assistant',
      createdAt: '2026-07-11T10:00:00',
      updatedAt: '2026-07-11T10:30:00',
      messages: [
        { id: 1, requestId: 'one', role: 'user', content: '旧消息', response: null, createdAt: '2026-07-11T10:10:00' }
      ]
    })

    const page = mountAssistant()
    await flushPromises()
    await flushPromises()

    await page.get('.conversation-actions button[aria-label="删除会话"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('无法恢复'),
      '删除会话',
      expect.objectContaining({ confirmButtonText: '删除会话' })
    )
    expect(deleteAssistantSessionApi).toHaveBeenCalledWith(7)
    expect(page.text()).toContain('还没有历史会话')
    expect(page.text()).toContain('你好，我是穗奈')
    expect(replace).toHaveBeenLastCalledWith({ path: '/assistant', query: {} })
  })

  it('deletes a different history item without changing the current conversation', async () => {
    assistantSessionsApi.mockResolvedValue([
      summary(),
      summary({ id: 8, title: '另一个讨论' })
    ])

    const page = mountAssistant()
    await flushPromises()

    await page.get('button[aria-label="删除会话：岗位方向比较"]').trigger('click')
    await flushPromises()

    expect(deleteAssistantSessionApi).toHaveBeenCalledWith(7)
    expect(page.text()).not.toContain('岗位方向比较')
    expect(page.text()).toContain('另一个讨论')
  })
  it('distinguishes a history loading error from an empty history and supports retry', async () => {
    assistantSessionsApi
      .mockRejectedValueOnce(new Error('网络暂时不可用'))
      .mockResolvedValueOnce([])

    const page = mountAssistant()
    await flushPromises()

    expect(page.text()).toContain('会话历史暂时不可用')
    expect(page.text()).not.toContain('还没有历史会话')

    await page.get('.sidebar-error button').trigger('click')
    await flushPromises()

    expect(assistantSessionsApi).toHaveBeenCalledTimes(2)
    expect(page.text()).toContain('还没有历史会话')
  })
})
