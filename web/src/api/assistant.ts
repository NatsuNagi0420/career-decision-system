import request from '@/utils/request'

const ASSISTANT_CHAT_TIMEOUT_MS = 180_000

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

export type AssistantSessionSummary = {
  id: number
  title: string
  lastPage: string | null
  messageCount: number
  lastMessage: string | null
  createdAt: string
  updatedAt: string
}

export type AssistantSessionMessage = {
  id: number
  requestId: string | null
  role: 'user' | 'assistant'
  content: string
  response: AssistantChatResponse | null
  createdAt: string
}

export type AssistantSessionDetail = {
  id: number
  title: string
  lastPage: string | null
  createdAt: string
  updatedAt: string
  messages: AssistantSessionMessage[]
}

export const assistantChatApi = (payload: AssistantChatRequest) => {
  return request<AssistantChatResponse>({
    url: '/chat/messages',
    method: 'post',
    timeout: ASSISTANT_CHAT_TIMEOUT_MS,
    data: {
      requestId: payload.requestId || `chat-${crypto.randomUUID()}`,
      sessionId: payload.sessionId || null,
      page: payload.page,
      message: payload.message,
      context: payload.context ?? {}
    }
  })
}

export const assistantSessionsApi = () => request<AssistantSessionSummary[]>({
  url: '/chat/sessions',
  method: 'get'
})

export const assistantSessionApi = (sessionId: number) => request<AssistantSessionDetail>({
  url: `/chat/sessions/${sessionId}`,
  method: 'get'
})

export const renameAssistantSessionApi = (sessionId: number, title: string) =>
  request<AssistantSessionSummary>({
    url: `/chat/sessions/${sessionId}`,
    method: 'patch',
    data: { title }
  })

export type DeleteAssistantSessionResponse = {
  sessionId: number
  deleted: boolean
}

export const deleteAssistantSessionApi = (sessionId: number) =>
  request<DeleteAssistantSessionResponse>({
    url: `/chat/sessions/${sessionId}`,
    method: 'delete',
    showError: false
  })
