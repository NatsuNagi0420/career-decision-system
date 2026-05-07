/**
 * 模块：AI 助手接口封装。
 * 职责：封装前端与后端 /assistant/chat 对话接口的请求与类型定义。
 */
import request from '@/utils/request'

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

