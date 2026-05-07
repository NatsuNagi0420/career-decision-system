/**
 * 模块：职业测验相关接口封装。
 * 职责：提供职业路径生成接口。
 */
import request from '@/utils/request'

export const generatePathPlanApi = (req: any = {}) => {
  return request<any>({
    url: '/path-plan/generate',
    method: 'post',
    data: req
  })
}
