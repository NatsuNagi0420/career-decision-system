import { del, get, post, put } from '@/utils/request'
import type { TaskStatus } from './actionPlans'

export type WeeklyReview = {
  id: number
  planId: number
  projectId: number
  weekNo: number
  completedSummary: string | null
  evidenceSummary: string | null
  difficulties: string | null
  nextWeekMinutes: number | null
  confidenceTrend: 'increased' | 'stable' | 'decreased' | null
  confidenceReason: string | null
  adjustmentProposal: string | null
  status: 'draft' | 'submitted' | 'adjustments_applied'
  requestId: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

export const listWeeklyReviewsApi = (planId?: number) =>
  get<WeeklyReview[]>('/weekly-reviews', planId ? { planId } : undefined)
export const getWeeklyReviewApi = (id: number) => get<WeeklyReview>(`/weekly-reviews/${id}`)
export const saveWeeklyReviewApi = (data: {
  requestId: string
  planId: number
  weekNo: number
  completedSummary?: string
  evidenceSummary?: string
  difficulties?: string
  nextWeekMinutes?: number
  confidenceTrend?: 'increased' | 'stable' | 'decreased'
  confidenceReason?: string
  adjustmentProposal?: string
}) => put<WeeklyReview>('/weekly-reviews', data)
export const submitWeeklyReviewApi = (id: number) =>
  post<WeeklyReview>(`/weekly-reviews/${id}/submit`)
export const applyWeeklyReviewAdjustmentsApi = (
  id: number,
  data: {
    confirmed: boolean
    requestId: string
    adjustments: Array<{
      taskId: number
      status: TaskStatus
      reason?: string
      deferredTo?: string
      expectedVersion: number
    }>
  }
) => post<WeeklyReview>(`/weekly-reviews/${id}/adjustments/apply`, data)
export const deleteWeeklyReviewApi = (id: number) => del<void>(`/weekly-reviews/${id}`)
