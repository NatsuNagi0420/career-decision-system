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

export const listCareerDirectionsApi = (params?: { keyword?: string; category?: string }) =>
  get<CareerDirection[]>('/career-directions', params)
export const getCareerDirectionApi = (id: number) => get<CareerDirection>(`/career-directions/${id}`)
export const createCareerDirectionApi = (data: CareerDirectionPayload) =>
  post<CareerDirection>('/career-directions', data)
export const updateCareerDirectionApi = (id: number, data: CareerDirectionPayload) =>
  put<CareerDirection>(`/career-directions/${id}`, data)
export const deleteCareerDirectionApi = (id: number) => del<void>(`/career-directions/${id}`)
export const favoriteCareerDirectionApi = (id: number) =>
  post<CareerDirection>(`/career-directions/${id}/favorite`)
export const unfavoriteCareerDirectionApi = (id: number) =>
  del<CareerDirection>(`/career-directions/${id}/favorite`)
