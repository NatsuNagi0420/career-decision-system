import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AiAssistant from '../AiAssistant.vue'
import type { AssistantChatResponse } from '@/api/assistant'

const assistantChatApi = vi.hoisted(() => vi.fn())
const deleteAssistantSessionApi = vi.hoisted(() => vi.fn())
const route = vi.hoisted(() => ({
  path: '/',
  fullPath: '/',
  params: {} as Record<string, string>,
  query: {} as Record<string, string>
}))
const push = vi.hoisted(() => vi.fn())
let wrapper: VueWrapper | undefined

vi.mock('@/api/assistant', () => ({ assistantChatApi, deleteAssistantSessionApi }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push })
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

const baseResponse = (overrides: Partial<AssistantChatResponse> = {}): AssistantChatResponse => ({
  sessionId: 1,
  generationMode: 'fallback',
  modelName: 'rule-context-mentor-v1',
  confidence: 0.58,
  reply: '先完成一个最小验证动作。',
  evidenceBasis: [{ statement: '当前页面提供了相关上下文。', sourceRefs: ['page-context'] }],
  uncertainties: ['仍需要更多现实反馈。'],
  nextStep: '记录一次验证结果。',
  actions: [{ label: '查看行动计划', action: 'go:action-plans' }],
  ...overrides
})

const stubs = {
  M3Fab: {
    inheritAttrs: false,
    props: ['label'],
    template: '<button v-bind="$attrs" :aria-label="label"><slot /></button>'
  },
  M3IconButton: {
    inheritAttrs: false,
    props: ['label'],
    template: '<button v-bind="$attrs" :aria-label="label"><slot /></button>'
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
  M3TextArea: {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  M3CircularProgress: { template: '<span />' }
}

const mountAssistant = () => {
  wrapper = mount(AiAssistant, {
    attachTo: document.body,
    global: { stubs }
  })
  return wrapper
}

const openAssistant = async () => {
  const trigger = document.body.querySelector<HTMLButtonElement>('button[aria-label="打开 AI 导师"]')
  expect(trigger).not.toBeNull()
  trigger?.click()
  await flushPromises()
}

const submitQuestion = async () => {
  const quickQuestion = document.body.querySelector<HTMLButtonElement>('.quick-questions button')
  quickQuestion?.click()
  await flushPromises()
  await flushPromises()
}

describe('AiAssistant response presentation', () => {
  beforeEach(() => {
    route.path = '/'
    route.fullPath = '/'
    route.params = {}
    route.query = {}
    assistantChatApi.mockReset()
    deleteAssistantSessionApi.mockReset().mockResolvedValue({ sessionId: 1, deleted: true })
    confirm.mockReset().mockResolvedValue(undefined)
    push.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.replaceChildren()
  })

  it('prioritizes the direct answer and keeps only weak metadata', async () => {
    assistantChatApi.mockResolvedValue(baseResponse({
      responseMode: 'direct',
      usedPersonalContext: true
    }))
    mountAssistant()
    await openAssistant()
    await submitQuestion()

    const response = document.body.querySelector<HTMLElement>('.mentor-message[data-response-mode="direct"]')
    expect(response).not.toBeNull()
    expect(response?.querySelector('.primary-answer')?.textContent).toContain('先完成一个最小验证动作')
    expect(response?.querySelector('.generation-status')?.textContent).toBe('规则建议')
    expect(response?.querySelector('.personal-context-status')?.textContent).toBe('已结合个人上下文')
    expect(response?.querySelector('.response-confidence')).toBeNull()
    expect(response?.querySelector('.coaching-details')).toBeNull()
    expect(response?.querySelector('.next-step')).toBeNull()
    expect(response?.textContent).not.toContain('当前页面提供了相关上下文')
    expect(response?.querySelector('.response-actions')).toBeNull()
    expect(response?.closest('.mentor-message-row')?.querySelector('[data-assistant-state]')?.getAttribute('data-assistant-state')).toBe('concerned')
  })

  it('keeps coaching evidence collapsed until requested', async () => {
    assistantChatApi.mockResolvedValue(baseResponse({
      responseMode: 'coaching',
      usedPersonalContext: false
    }))
    mountAssistant()
    await openAssistant()
    await submitQuestion()

    const response = document.body.querySelector<HTMLElement>('.mentor-message[data-response-mode="coaching"]')
    expect(response).not.toBeNull()
    expect(response?.querySelector('.response-confidence')).toBeNull()
    expect(response?.querySelector('.personal-context-status')?.textContent).toBe('未使用个人上下文')
    const details = response?.querySelector<HTMLDetailsElement>('.coaching-details')
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(response?.querySelector('.next-step')?.textContent).toContain('记录一次验证结果')
    expect(response?.querySelector('.response-actions')?.textContent).toContain('查看行动计划')

    details?.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    if (details) details.open = true
    expect(details?.open).toBe(true)
    expect(details?.textContent).toContain('当前页面提供了相关上下文')
    expect(details?.textContent).toContain('仍需要更多现实反馈')
  })

  it('deletes the current floating assistant session after confirmation', async () => {
    assistantChatApi.mockResolvedValue(baseResponse({ sessionId: 21 }))
    mountAssistant()
    await openAssistant()
    await submitQuestion()

    const deleteButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="删除会话"]')
    expect(deleteButton).not.toBeNull()
    deleteButton?.click()
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('无法恢复'),
      '删除会话',
      expect.objectContaining({ confirmButtonText: '删除会话' })
    )
    expect(deleteAssistantSessionApi).toHaveBeenCalledWith(21)
    expect(document.body.querySelector('button[aria-label="删除会话"]')).toBeNull()
  })
  it('switches the assistant portrait for listening, thinking and response states', async () => {
    let resolveResponse!: (value: AssistantChatResponse) => void
    assistantChatApi.mockReturnValue(new Promise<AssistantChatResponse>((resolve) => {
      resolveResponse = resolve
    }))
    mountAssistant()
    await openAssistant()

    const input = document.body.querySelector<HTMLTextAreaElement>('.mentor-input-field')
    input?.dispatchEvent(new FocusEvent('focus'))
    await flushPromises()
    expect(document.body.querySelector('.mentor-title [data-assistant-state]')?.getAttribute('data-assistant-state')).toBe('listening')

    document.body.querySelector<HTMLButtonElement>('.quick-questions button')?.click()
    await Promise.resolve()
    expect(document.body.querySelector('.pending')?.closest('.mentor-message-row')?.querySelector('[data-assistant-state]')?.getAttribute('data-assistant-state')).toBe('thinking')

    resolveResponse(baseResponse({
      confidence: 0.9,
      uncertainties: [],
      nextStep: null,
      actions: []
    }))
    await flushPromises()
    await flushPromises()
    const response = document.body.querySelector<HTMLElement>('.mentor-message[data-response-mode="coaching"]')
    expect(response?.closest('.mentor-message-row')?.querySelector('[data-assistant-state]')?.getAttribute('data-assistant-state')).toBe('explaining')
  })
})
