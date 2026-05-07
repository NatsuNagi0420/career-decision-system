/**
 * 模块：报告归档相关接口封装。
 * 职责：封装职业规划报告归档的前端请求，包括保存当前报告归档、
 *       查询当前用户的历史归档列表以及获取单条归档详情。
 */
import request from '@/utils/request'

export type ReportArchiveRequest = {
  title: string
  reportJson: Record<string, unknown>
  sortIndex?: number
}

export type ReportArchiveRecord = {
  id: number
  userId?: number
  title: string
  reportJson: string
  sortIndex: number
  createTime?: string
  updateTime?: string
  isDeleted?: number
}

export const saveReportArchiveApi = (payload: ReportArchiveRequest) => {
  return request<void>({
    url: '/report/archive',
    method: 'post',
    data: payload
  })
}

export type ReportGenerateRequest = {
  entryDraft?: Record<string, unknown>
  capabilityProfile?: Record<string, unknown>
  targetJob?: Record<string, unknown>
  pathPlan?: Record<string, unknown>
  pathGraph?: Record<string, unknown>
}

export type ReportGenerateResponse = {
  summary: string
  gaps: Array<{ label: string; items: string[] }>
  planStages: Array<{ name: string; tasks: string[] }>
  matchAnalysis?: string
  evidenceHighlights?: string[]
  skillPath?: string[]
  action90Days?: string[]
  risksAndAlternatives?: string[]
  resumeInterviewStrategies?: string[]
}


export const generateReportApi = (payload: ReportGenerateRequest) => {
  return request<ReportGenerateResponse>({
    url: '/report/generate',
    method: 'post',
    data: payload,
    timeout: 60000
  })
}


export const listReportArchivesApi = () => {
  return request<ReportArchiveRecord[]>({
    url: '/report/archive/list',
    method: 'get'
  })
}

export const getReportArchiveDetailApi = (id: number | string) => {
  return request<ReportArchiveRecord>({
    url: `/report/archive/${id}`,
    method: 'get'
  })
}
