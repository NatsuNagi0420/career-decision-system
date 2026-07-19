import request from '@/utils/request'
import type { CapabilityProfileRequest, CapabilityProfileResponse } from '@/api/capability'

type BackendJobSummary = {
  id: number
  title: string
  company: string
  city?: string
  location?: string
  direction?: string
  industry?: string
  companySize?: string
  salaryRange?: string
  salaryMin?: number
  salaryMax?: number
  experienceLevel?: string
  education?: string
  tags?: string[]
  summary?: string
  qualityScore?: number
  sourcePlatform?: string
  sourceUrl?: string
  sourceUpdatedText?: string
  sourceUpdatedAt?: string
}

type BackendJobDetail = BackendJobSummary & {
  education?: string
  responsibilities?: string[]
  requirements?: string[]
  growthPath?: string[]
  interviewFocus?: string[]
}

type BackendJobPage<T> = {
  items: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

type BackendDirectionJobItem = {
  job: BackendJobSummary
  matchScore: number
  matchSource: string
  reviewStatus: string
  matchReasons: string[]
}

type BackendDirectionJobPage = {
  items: BackendDirectionJobItem[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
  mappingVersion: string
}

type BackendFacetItem = {
  name: string
  count: number
}

type BackendJobFacets = {
  cities: BackendFacetItem[]
  directions: BackendFacetItem[]
  tags: BackendFacetItem[]
}

type BackendJobMatch = {
  job: BackendJobSummary
  matchScore: number
  reasons: string[]
}

export type JobInfo = {
  id: number
  jobName: string
  companyName: string
  updateDate: string
  salaryRange: string
  salaryMin?: number | null
  salaryMax?: number | null
  location: string
  industry?: string | null
  experienceLevel?: string | null
  education?: string | null
  companySize?: string | null
  companyType?: string | null
  jobCode?: string | null
  jobDetails?: string | null
  companyDetails?: string | null
  jobSourceUrl: string
  sourcePlatform?: string | null
  sourceUpdatedText?: string | null
  sourceUpdatedAt?: string | null
  qualityScore?: number | null
  tags?: string[]
  responsibilities?: string[]
  requirements?: string[]
  growthPath?: string[]
  interviewFocus?: string[]
}

export type JobListQuery = {
  keyword?: string
  location?: string
  locations?: string[]
  industry?: string
  companySize?: string
  companyType?: string
  salary?: string
  salaryMin?: number
  salaryMax?: number
  experienceLevel?: string
  page?: number
  pageSize?: number
}

export type PageResult<T> = {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export type DirectionMappedJob = {
  job: JobInfo
  matchScore: number
  matchSource: string
  reviewStatus: string
  matchReasons: string[]
}

export type DirectionJobResult = {
  list: DirectionMappedJob[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  mappingVersion: string
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

export type JobFacets = {
  locations: string[]
  industries: string[]
  companySizes: string[]
  companyTypes: string[]
}

function mapJob(job: BackendJobSummary | BackendJobDetail): JobInfo {
  const detail = job as BackendJobDetail

  return {
    id: job.id,
    jobName: job.title,
    companyName: job.company,
    updateDate: '',
    salaryRange: job.salaryRange || '薪资面议',
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    location: job.location || job.city || '',
    industry: job.industry || job.direction || null,
    experienceLevel: job.experienceLevel || null,
    education: job.education || null,
    companySize: job.companySize || null,
    companyType: job.direction || null,
    jobCode: String(job.id),
    // `summary` is the backend's plain-text view of the source JD. The raw
    // imported evidence remains in the database while the UI keeps this view
    // separate from extracted responsibilities and requirements.
    jobDetails: detail.summary || null,
    companyDetails: '',
    jobSourceUrl: job.sourceUrl || '',
    sourcePlatform: job.sourcePlatform || null,
    sourceUpdatedText: job.sourceUpdatedText || null,
    sourceUpdatedAt: job.sourceUpdatedAt || null,
    qualityScore: job.qualityScore ?? null,
    tags: job.tags ?? [],
    responsibilities: detail.responsibilities ?? [],
    requirements: detail.requirements ?? [],
    growthPath: detail.growthPath ?? [],
    interviewFocus: detail.interviewFocus ?? []
  }
}

function mapQuery(query: JobListQuery) {
  return {
    keyword: query.keyword,
    location: query.locations?.[0] || query.location,
    direction: query.industry || query.companyType,
    tag: query.companySize,
    salaryMin: query.salaryMin,
    salaryMax: query.salaryMax,
    experienceLevel: query.experienceLevel,
    page: Math.max((query.page ?? 1) - 1, 0),
    size: query.pageSize ?? 12
  }
}

export const listJobsApi = async (query: JobListQuery) => {
  const res = await request<BackendJobPage<BackendJobSummary>>({
    url: '/jobs',
    method: 'get',
    params: mapQuery(query)
  })
  return {
    list: res.items.map(mapJob),
    total: res.totalElements,
    page: res.page + 1,
    pageSize: res.size
  }
}

/**
 * Uses the server-owned, versioned direction mapping. Direction pages must not
 * rebuild this relation with ad-hoc client keyword searches.
 */
export const listCareerDirectionJobsApi = async (
  directionId: number,
  page = 1,
  pageSize = 50
): Promise<DirectionJobResult> => {
  const res = await request<BackendDirectionJobPage>({
    url: `/career-directions/${directionId}/jobs`,
    method: 'get',
    params: { page: Math.max(page - 1, 0), size: pageSize }
  })
  return {
    list: res.items.map((item) => ({ ...item, job: mapJob(item.job) })),
    total: res.totalElements,
    page: res.page + 1,
    pageSize: res.size,
    totalPages: res.totalPages,
    mappingVersion: res.mappingVersion
  }
}

export const recommendJobsApi = (query: Pick<JobListQuery, 'keyword' | 'location' | 'locations' | 'industry' | 'page' | 'pageSize'>) => {
  return listJobsApi(query)
}

export const recommendJobsByAiApi = async (payload: JobRecommendAiRequest) => {
  const profile = (payload.capabilityProfile || payload.entry || {}) as Record<string, unknown>
  const matches = await request<BackendJobMatch[]>({
    url: '/jobs/recommendations',
    method: 'post',
    data: {
      profile,
      assessment: payload.entry || {},
      limit: payload.limit ?? 6
    },
    timeout: 60000
  })

  return {
    keywords: payload.keywords ?? [],
    jobs: matches.map((match) => mapJob(match.job))
  }
}

export const getJobDetailApi = async (id: number) => {
  const detail = await request<BackendJobDetail>({
    url: `/jobs/${id}`,
    method: 'get'
  })
  return mapJob(detail)
}

export const listTargetJobsApi = async () => {
  const targets = await request<BackendJobSummary[]>({
    url: '/jobs/targets',
    method: 'get'
  })
  return targets.map(mapJob)
}

export const addTargetJobApi = async (jobId: number) => {
  const targets = await request<BackendJobSummary[]>({
    url: `/jobs/targets/${jobId}`,
    method: 'post'
  })
  return targets.map(mapJob)
}

export const removeTargetJobApi = async (jobId: number) => {
  const targets = await request<BackendJobSummary[]>({
    url: `/jobs/targets/${jobId}`,
    method: 'delete'
  })
  return targets.map(mapJob)
}

export const listFavoriteJobsApi = async () => {
  const favorites = await request<BackendJobSummary[]>({
    url: '/jobs/favorites',
    method: 'get'
  })
  return favorites.map(mapJob)
}

export const addFavoriteJobApi = async (jobId: number) => {
  const favorites = await request<BackendJobSummary[]>({
    url: `/jobs/favorites/${jobId}`,
    method: 'post'
  })
  return favorites.map(mapJob)
}

export const removeFavoriteJobApi = async (jobId: number) => {
  const favorites = await request<BackendJobSummary[]>({
    url: `/jobs/favorites/${jobId}`,
    method: 'delete'
  })
  return favorites.map(mapJob)
}

export const getJobFacetsApi = async () => {
  const facets = await request<BackendJobFacets>({
    url: '/jobs/facets',
    method: 'get'
  })
  const cities = facets.cities.map((item) => item.name).filter(Boolean)
  const directions = facets.directions.map((item) => item.name).filter(Boolean)
  const tags = facets.tags.map((item) => item.name).filter(Boolean)
  return {
    locations: cities,
    industries: directions,
    companySizes: tags,
    companyTypes: directions
  }
}
