import request from '@/utils/request'

export type AssistantChatRequest = {
  requestId?: string
  sessionId?: number | null
  page: string
  message: string
  context?: Record<string, unknown>
}

export type AssistantResponseMode = 'direct' | 'coaching'

export type AssistantChatResponse = {
  sessionId: number
  generationMode: 'llm' | 'fallback'
  modelName: string | null
  confidence: number
  reply: string
  /** Optional presentation hints returned by newer agent contracts. */
  responseMode?: AssistantResponseMode
  mode?: AssistantResponseMode
  usedPersonalContext?: boolean
  evidenceBasis: Array<{ statement: string; sourceRefs: string[] }>
  uncertainties: string[]
  nextStep: string | null
  actions?: Array<{ label: string; action: string }>
  intent?: string
  agentRunId?: number
}

export const assistantChatApi = (payload: AssistantChatRequest) => {
  return request<AssistantChatResponse>({
    url: '/chat/messages',
    method: 'post',
    data: {
      requestId: payload.requestId || `chat-${crypto.randomUUID()}`,
      sessionId: payload.sessionId || null,
      page: payload.page,
      message: payload.message,
      context: payload.context ?? {}
    }
  })
}
