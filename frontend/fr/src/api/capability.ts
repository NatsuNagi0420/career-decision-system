/**
 * 模块：能力画像相关接口封装。
 * 职责：定义能力画像请求/响应结构，并封装生成能力画像的 HTTP 请求。
 */
import request from '@/utils/request'

export type EntryBasic = {
  name?: string
  email?: string
  school?: string
  major?: string
  grade?: string
  city?: string
}

export type EntryTarget = {
  role?: string
  jobType?: string
  cities?: string[]
  salary?: string
  availableAt?: string
  avoid?: string
}

export type EntryLinks = {
  github?: string
  portfolio?: string
}

export type EntryExperience = {
  title: string
  desc: string
}

export type CapabilityProfileRequest = {
  userId?: number
  basic?: EntryBasic
  target?: EntryTarget
  skills?: string[]
  certificates?: string[]
  experiences?: EntryExperience[]
  values?: number[]
  mbtiResult?: string | null
  age?: number
  education?: string
  tendencyAnswers?: number[]
  mbtiAnswers?: number[]
  links?: EntryLinks
  questionnaireAnswers?: Record<string, string | string[]>
}

export type CapabilityProfileResponse = {
  completenessScore: number
  competitivenessStars: number
  tags: string[]
  radar: {
    indicators: Array<{ name: string; max: number }>
    values: number[]
  }
  suggestions: {
    shortTerm: string
    longTerm: string
  }
  matchScores?: number[]
  recommendedKeywords: string[]
  recommendKeyword: string
  recommendedJobs: Array<{
    id: number
    jobName: string
    companyName: string
    location: string
    salaryRange: string
  }>
}

export const generateCapabilityProfileDraftApi = (payload: CapabilityProfileRequest) => {
  return request<CapabilityProfileResponse>({
    url: '/capability/profile/draft',
    method: 'post',
    data: payload,
    timeout: 60000
  })
}
