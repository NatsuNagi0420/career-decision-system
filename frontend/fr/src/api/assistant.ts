/**
 * 模块：AI 助手接口封装。
 * 职责：封装前端与后端 /assistant/chat 对话接口的请求与类型定义。
 */
import request from '@/utils/request'
import Cookies from 'js-cookie'

export type AssistantChatRequest = {
  page: string
  message: string
  context?: Record<string, unknown>
}

export type AssistantChatResponse = {
  reply: string
}

export const assistantChatApi = (payload: AssistantChatRequest) => {
  return request<AssistantChatResponse>({
    url: '/assistant/chat',
    method: 'post',
    data: payload
  })
}

/**
 * 流式助手对话（SSE）
 * @param payload 对话请求
 * @returns fetch Response，调用方需自行处理 ReadableStream
 */
export const assistantChatStreamApi = async (
  payload: AssistantChatRequest
): Promise<Response> => {
  const token = Cookies.get('token')
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

  return fetch(`${baseURL}/assistant/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    body: JSON.stringify(payload)
  })
}

