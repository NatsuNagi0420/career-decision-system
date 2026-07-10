import request from '@/utils/request'

export type AssistantChatRequest = {
  page: string
  message: string
  context?: Record<string, unknown>
}

export type AssistantChatResponse = {
  reply: string
  actions?: Array<{ label: string; action: string }>
  intent?: string
}

export const assistantChatApi = (payload: AssistantChatRequest) => {
  return request<AssistantChatResponse>({
    url: '/chat/messages',
    method: 'post',
    data: {
      requestId: `chat-${Date.now()}`,
      page: payload.page,
      message: payload.message,
      context: payload.context ?? {}
    }
  })
}

export const assistantChatStreamApi = async (_payload: AssistantChatRequest): Promise<Response> => {
  return new Response(null, { status: 501, statusText: 'Streaming chat is not available' })
}
