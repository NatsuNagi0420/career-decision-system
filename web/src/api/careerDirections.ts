import { del, get, post, put } from '@/utils/request'

export type CareerDirection = {
  id: number
  code: string | null
  name: string
  category: string
  summary: string
  typicalWork: string[]
  commonSkills: string[]
  growthPath: string[]
  misconceptions: string[]
  majorTags: string[]
  industryTags: string[]
  workTypes: string[]
  custom: boolean
  favorite: boolean
  updatedAt: string
}

export type CareerDirectionPayload = Pick<
  CareerDirection,
  | 'name'
  | 'category'
  | 'summary'
  | 'typicalWork'
  | 'commonSkills'
  | 'growthPath'
  | 'misconceptions'
  | 'majorTags'
  | 'industryTags'
  | 'workTypes'
>

type BackendFacetItem = { name: string; count: number }
type BackendDirectionInsights = {
  directionId: number
  directionName: string
  sampleSize: number
  salary: {
    minimumMonthly: number | null
    averageMinimumMonthly: number | null
    averageMaximumMonthly: number | null
    maximumMonthly: number | null
    sampleSize: number
  }
  cities: BackendFacetItem[]
  educationLevels: BackendFacetItem[]
  experienceLevels: BackendFacetItem[]
  skills: BackendFacetItem[]
  commonRequirements?: BackendFacetItem[]
  latestSourceUpdatedAt: string | null
  mappingVersion: string
}

export type DirectionInsightItem = { label: string; count: number; ratio: number }
export type CareerDirectionInsights = {
  directionId: number
  directionName: string
  sampleCount: number
  topSkills: DirectionInsightItem[]
  commonRequirements: DirectionInsightItem[]
  cities: DirectionInsightItem[]
  experienceLevels: DirectionInsightItem[]
  educationLevels: DirectionInsightItem[]
  salarySampleCount: number
  salaryMin: number | null
  salaryMax: number | null
  averageSalaryMin: number | null
  averageSalaryMax: number | null
  latestSourceAt: string | null
  mappingVersion: string
}

const insightItems = (items: BackendFacetItem[], sampleCount: number): DirectionInsightItem[] =>
  items.map((item) => ({
    label: item.name,
    count: item.count,
    ratio: sampleCount ? Math.round(item.count / sampleCount * 100) : 0
  }))

export const listCareerDirectionsApi = (params?: { keyword?: string; category?: string }) =>
  get<CareerDirection[]>('/career-directions', params)
export const getCareerDirectionApi = (id: number) => get<CareerDirection>(`/career-directions/${id}`)
export const getCareerDirectionInsightsApi = async (id: number): Promise<CareerDirectionInsights> => {
  const value = await get<BackendDirectionInsights>(`/career-directions/${id}/insights`)
  return {
    directionId: value.directionId,
    directionName: value.directionName,
    sampleCount: value.sampleSize,
    topSkills: insightItems(value.skills, value.sampleSize),
    commonRequirements: insightItems(value.commonRequirements ?? [], value.sampleSize),
    cities: insightItems(value.cities, value.sampleSize),
    experienceLevels: insightItems(value.experienceLevels, value.sampleSize),
    educationLevels: insightItems(value.educationLevels, value.sampleSize),
    salarySampleCount: value.salary.sampleSize,
    salaryMin: value.salary.minimumMonthly,
    salaryMax: value.salary.maximumMonthly,
    averageSalaryMin: value.salary.averageMinimumMonthly,
    averageSalaryMax: value.salary.averageMaximumMonthly,
    latestSourceAt: value.latestSourceUpdatedAt,
    mappingVersion: value.mappingVersion
  }
}
export const createCareerDirectionApi = (data: CareerDirectionPayload) =>
  post<CareerDirection>('/career-directions', data)
export const updateCareerDirectionApi = (id: number, data: CareerDirectionPayload) =>
  put<CareerDirection>(`/career-directions/${id}`, data)
export const deleteCareerDirectionApi = (id: number) => del<void>(`/career-directions/${id}`)
export const favoriteCareerDirectionApi = (id: number) =>
  post<CareerDirection>(`/career-directions/${id}/favorite`)
export const unfavoriteCareerDirectionApi = (id: number) =>
  del<CareerDirection>(`/career-directions/${id}/favorite`)
