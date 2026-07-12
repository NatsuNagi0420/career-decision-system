import { get } from '@/utils/request'
import type { TodayTasks } from './actionPlans'

export type DashboardProject = {
  id: number
  title: string
  question: string
  status: string
  currentStage: string
  candidateCount: number
  jobSampleCount: number
  openQuestionCount: number
  resultCount?: number
  primaryTarget: string | null
  updatedAt: string
}

export type DashboardData = {
  state: 'new_user' | 'ready_to_explore' | 'exploring' | 'decided' | 'executing' | 'review_due'
  primaryAction: string
  primaryActionLabel: string
  primaryActionPath: string
  onboardingCompleted: boolean
  profile: {
    displayName: string | null
    school: string | null
    major: string | null
    grade: string | null
    city: string | null
    externalAiConsent: boolean
    updatedAt: string | null
  } | null
  currentProject: DashboardProject | null
  today: TodayTasks
  executionRisk?: {
    overdueTaskCount: number
    deferredTaskCount: number
    completedWithoutEvidenceCount: number
    recentResultCount: number
  }
  latestAgentAdvice?: {
    id: number
    agentType: string
    generationMode: string | null
    conclusion: string
    nextStep: string | null
    createdAt: string | null
  } | null
  latestReview: {
    id: number
    planId: number
    weekNo: number
    status: string
    updatedAt: string
  } | null
  generatedAt: string
}

export const getDashboardApi = () => get<DashboardData>('/dashboard')
