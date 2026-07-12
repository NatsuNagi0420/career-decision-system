import { post } from '@/utils/request'
import type { TaskStatus, TaskType } from './actionPlans'

export type EvidenceBasis = {
  statement: string
  sourceRefs: string[]
}

export type SuggestedAction = {
  actionType: string
  title: string
  rationale: string
  acceptanceCriteria: string | null
}

export type CoachingResponse = {
  generationMode: 'llm' | 'fallback'
  modelName: string | null
  confidence: number
  conclusion: string
  evidenceBasis: EvidenceBasis[]
  counterArguments: string[]
  uncertainties: string[]
  nextActions: SuggestedAction[]
  agentRunId?: number
}

export type CandidateSuggestion = {
  directionId: number | null
  name: string
  recommendationReason: string
  opposingFactors: string
  uncertainties: string
  validationActions: string[]
}

export type DecisionCoachResponse = CoachingResponse & {
  candidateSuggestions: CandidateSuggestion[]
}

export type CandidateAssessment = {
  candidateId: number
  candidateName: string
  score: number | null
  assessment: string
  evidenceRefs: string[]
  opposingFactors: string[]
  uncertainty: string
  validationAction: string
}

export type JobComparisonResponse = CoachingResponse & {
  candidateAssessments: CandidateAssessment[]
}

export type TaskSuggestion = {
  weekNo: number
  title: string
  taskType: TaskType
  content: string
  estimatedMinutes: number
  acceptanceCriteria: string
  rationale: string
}

export type ActionCoachResponse = CoachingResponse & {
  taskSuggestions: TaskSuggestion[]
}

export type TaskAdjustmentSuggestion = {
  taskId: number
  taskTitle: string
  status: Exclude<TaskStatus, 'completed'>
  reason: string
  deferredDays: number | null
}

export type WeeklyReviewCoachResponse = CoachingResponse & {
  reviewSummary: string
  adjustmentSuggestions: TaskAdjustmentSuggestion[]
}

const coachingPayload = (prefix: string, focus?: string) => ({
  requestId: `${prefix}-${crypto.randomUUID()}`,
  focus: focus?.trim() || undefined
})

export const coachDecisionApi = (projectId: number, focus?: string) =>
  post<DecisionCoachResponse>(`/decision-projects/${projectId}/coach`, coachingPayload('decision-coach', focus))

export const suggestJobComparisonApi = (projectId: number, focus?: string) =>
  post<JobComparisonResponse>(
    `/decision-projects/${projectId}/comparison/suggest`,
    coachingPayload('job-comparison', focus)
  )

export const coachActionPlanApi = (planId: number, focus?: string) =>
  post<ActionCoachResponse>(`/action-plans/${planId}/coach`, coachingPayload('action-coach', focus))

export const coachWeeklyReviewApi = (reviewId: number, focus?: string) =>
  post<WeeklyReviewCoachResponse>(
    `/weekly-reviews/${reviewId}/coach`,
    coachingPayload('weekly-review', focus)
  )
