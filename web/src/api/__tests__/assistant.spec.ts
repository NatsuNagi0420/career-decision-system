import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/request', () => ({
  default: requestMock
}))

import { assistantChatApi, assistantSessionsApi, deleteAssistantSessionApi } from '@/api/assistant'

describe('assistant API timeout', () => {
  beforeEach(() => {
    requestMock.mockReset()
    requestMock.mockResolvedValue({})
  })

  it('gives model-backed chat its own long-running timeout', () => {
    assistantChatApi({
      requestId: 'chat-timeout-test',
      page: '/assistant',
      message: '请帮我分析这个方向'
    })

    expect(requestMock).toHaveBeenCalledWith({
      url: '/chat/messages',
      method: 'post',
      timeout: 180_000,
      data: {
        requestId: 'chat-timeout-test',
        sessionId: null,
        page: '/assistant',
        message: '请帮我分析这个方向',
        context: {}
      }
    })
  })

  it('uses the permanent-delete contract for a session', () => {
    deleteAssistantSessionApi(42)

    expect(requestMock).toHaveBeenCalledWith({
      url: '/chat/sessions/42',
      method: 'delete',
      showError: false
    })
  })
  it('keeps ordinary assistant history requests on the shared timeout', () => {
    assistantSessionsApi()

    expect(requestMock).toHaveBeenCalledWith({
      url: '/chat/sessions',
      method: 'get'
    })
  })
})
