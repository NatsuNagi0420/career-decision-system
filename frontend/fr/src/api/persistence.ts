/**
 * 模块：职业测验相关接口封装。
 * 职责：提供职业路径生成接口。
 */
import request from '@/utils/request'
import Cookies from 'js-cookie'

export const generatePathPlanApi = (req: Record<string, unknown> = {}) => {
  return request<Record<string, unknown>>({
    url: '/path-plan/generate',
    method: 'post',
    data: req
  })
}

/**
 * 流式生成职业路径规划（SSE）
 */
export const generatePathPlanStreamApi = async (payload: Record<string, unknown> = {}): Promise<Response> => {
  const token = Cookies.get('token')
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

  return fetch(`${baseURL}/path-plan/generate/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    body: JSON.stringify(payload)
  })
}
