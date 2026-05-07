/**
 * 模块：岗位搜索与推荐接口封装。
 * 职责：定义岗位信息类型，封装岗位列表、推荐、详情以及筛选项获取等接口请求。
 */
import request from '@/utils/request'
import type { CapabilityProfileRequest, CapabilityProfileResponse } from '@/api/capability'

export type JobInfo = {
  id: number
  jobName: string
  companyName: string
  updateDate: string
  salaryRange: string
  location: string
  industry?: string | null
  companySize?: string | null
  companyType?: string | null
  jobCode?: string | null
  jobDetails?: string | null
  companyDetails?: string | null
  jobSourceUrl: string
}

export type JobListQuery = {
  keyword?: string
  location?: string
  locations?: string[]
  industry?: string
  companySize?: string
  companyType?: string
  salary?: string
  page?: number
  pageSize?: number
}

export type PageResult<T> = {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export const listJobsApi = (query: JobListQuery) => {
  return request<PageResult<JobInfo>>({
    url: '/jobs',
    method: 'get',
    params: query
  })
}

export const recommendJobsApi = (query: Pick<JobListQuery, 'keyword' | 'location' | 'locations' | 'industry' | 'page' | 'pageSize'>) => {
  return request<PageResult<JobInfo>>({
    url: '/jobs/recommend',
    method: 'get',
    params: query
  })
}

export type JobRecommendAiRequest = {
  entry?: CapabilityProfileRequest
  capabilityProfile?: CapabilityProfileResponse | Record<string, unknown>
  preferredJobIds?: number[]
  keywords?: string[]
  locations?: string[]
  limit?: number
}

export type JobRecommendAiResponse = {
  keywords: string[]
  jobs: JobInfo[]
}

export const recommendJobsByAiApi = (payload: JobRecommendAiRequest) => {
  return request<JobRecommendAiResponse>({
    url: '/jobs/recommend/ai',
    method: 'post',
    data: payload,
    timeout: 60000
  })
}

export const getJobDetailApi = (id: number) => {
  return request<JobInfo>({
    url: `/jobs/${id}`,
    method: 'get'
  })
}

export type JobFacets = {
  locations: string[]
  industries: string[]
  companySizes: string[]
  companyTypes: string[]
}

export const getJobFacetsApi = () => {
  return request<JobFacets>({
    url: '/jobs/facets',
    method: 'get'
  })
}

