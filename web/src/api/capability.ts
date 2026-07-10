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

type BackendCapabilityProfile = {
  completeness_score?: number
  competitiveness_stars?: number
  tags?: string[]
  radar?: Array<{ name: string; value: number }>
  strengths?: string[]
  suggestions?: string[]
}

type BackendJobSummary = {
  id: number
  title: string
  company: string
  city?: string
  location?: string
  salaryRange?: string
}

type BackendJobMatch = {
  job: BackendJobSummary
  matchScore: number
  reasons: string[]
}

function normalizeProfilePayload(payload: CapabilityProfileRequest) {
  const profile = {
    user_id: payload.userId ? String(payload.userId) : undefined,
    name: payload.basic?.name,
    school: payload.basic?.school,
    major: payload.basic?.major,
    degree: payload.education || payload.basic?.grade,
    target_role: payload.target?.role,
    target_cities: payload.target?.cities ?? [],
    expected_salary: payload.target?.salary,
    skills: payload.skills ?? [],
    certificates: payload.certificates ?? [],
    experiences: (payload.experiences ?? []).map((item) => `${item.title}: ${item.desc}`),
    values: [
      ...(payload.values ?? []).map(String),
      ...Object.values(payload.questionnaireAnswers ?? {}).flat().map(String)
    ]
  }

  return {
    requestId: `profile-${Date.now()}`,
    userId: payload.userId ? String(payload.userId) : undefined,
    profile,
    assessment: {
      mbti_type: payload.mbtiResult ?? undefined,
      interests: payload.target?.role ? [payload.target.role] : [],
      strengths: payload.skills ?? [],
      weaknesses: []
    }
  }
}

function mapCapabilityProfile(data: BackendCapabilityProfile): CapabilityProfileResponse {
  const radar = data.radar ?? []
  const suggestions = data.suggestions ?? []
  const tags = data.tags ?? []

  return {
    completenessScore: data.completeness_score ?? 70,
    competitivenessStars: data.competitiveness_stars ?? 3,
    tags,
    radar: {
      indicators: radar.map((item) => ({ name: item.name, max: 100 })),
      values: radar.map((item) => item.value)
    },
    suggestions: {
      shortTerm: suggestions.slice(0, 2).join('；') || '继续完善核心技能与项目经历。',
      longTerm: suggestions.slice(2).join('；') || '围绕目标岗位沉淀可展示的作品与经验。'
    },
    matchScores: [],
    recommendedKeywords: tags,
    recommendKeyword: tags[0] || '',
    recommendedJobs: []
  }
}

export const generateCapabilityProfileDraftApi = async (payload: CapabilityProfileRequest) => {
  const normalizedPayload = normalizeProfilePayload(payload)
  const data = await request<BackendCapabilityProfile>({
    url: '/profiles/generate',
    method: 'post',
    data: normalizedPayload,
    timeout: 60000
  })

  const profile = mapCapabilityProfile(data)

  try {
    const matches = await request<BackendJobMatch[]>({
      url: '/jobs/recommendations',
      method: 'post',
      data: {
        profile: normalizedPayload.profile,
        assessment: normalizedPayload.assessment,
        limit: 3
      },
      timeout: 30000
    })

    profile.recommendedJobs = matches.map((match) => ({
      id: match.job.id,
      jobName: match.job.title,
      companyName: match.job.company,
      location: match.job.location || match.job.city || '',
      salaryRange: match.job.salaryRange || '薪资面议'
    }))
    profile.matchScores = matches.map((match) => match.matchScore)
  } catch (error) {
    console.warn('Failed to load capability job recommendations:', error)
  }

  return profile
}

export const generateCapabilityProfileStreamApi = async (_payload: CapabilityProfileRequest): Promise<Response> => {
  return new Response(null, { status: 501, statusText: 'Streaming profile generation is not available' })
}
