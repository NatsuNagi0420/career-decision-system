import { del, get, patch, post, put } from '@/utils/request'

export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'deferred' | 'skipped'
export type PlanType = 'validation' | 'action'
export type TaskType =
  | 'career_research'
  | 'skill_learning'
  | 'project'
  | 'resume'
  | 'networking'
  | 'interview'
  | 'application'
  | 'custom'

export type TaskResult = {
  id: number
  description: string
  linkUrl: string | null
  verificationStatus: string
  createdAt: string
  updatedAt: string
}

export type ActionTask = {
  id: number
  weekNo: number
  title: string
  taskType: TaskType
  content: string
  status: TaskStatus
  dueAt: string | null
  estimatedMinutes: number | null
  acceptanceCriteria: string
  startedAt: string | null
  completedAt: string | null
  deferredTo: string | null
  skipReason: string | null
  sortOrder: number
  version: number
  results: TaskResult[]
  updatedAt: string
}

export type ActionWeek = {
  id: number
  weekNo: number
  title: string
  goal: string
  tasks: ActionTask[]
}

export type ActionPlanSummary = {
  id: number
  projectId: number
  targetId: number
  targetRole: string
  planType: PlanType
  status: string
  durationWeeks: number
  taskCount: number
  completedTaskCount: number
  progressPercent: number
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

export type ActionPlan = ActionPlanSummary & {
  overview: string
  version: number
  weeks: ActionWeek[]
}

export type ActionPlanPreviewTask = {
  title: string
  taskType: TaskType
  content: string
  estimatedMinutes: number
  acceptanceCriteria: string
  rationale: string
  capabilityGap: string | null
  jobRequirement: string | null
  sourceRefs: string[]
}

export type ActionPlanPreviewWeek = {
  weekNo: number
  goal: string
  tasks: ActionPlanPreviewTask[]
}

export type ActionPlanEvidenceBasis = {
  statement: string
  sourceRefs: string[]
}

export type ActionPlanPreview = {
  requestId: string
  projectId: number
  targetId: number
  targetRole: string
  planType: PlanType
  overview: string
  durationWeeks: number
  startDate: string
  endDate: string
  generationMode: 'llm' | 'fallback'
  modelName: string | null
  confidence: number
  evidenceBasis: ActionPlanEvidenceBasis[]
  uncertainties: string[]
  weeks: ActionPlanPreviewWeek[]
}

export type TodayTasks = {
  planId: number | null
  projectId: number | null
  targetId: number | null
  targetRole: string | null
  planType: PlanType | null
  weekNo: number
  completedThisWeek: number
  totalThisWeek: number
  tasks: ActionTask[]
  serverTime: string
}

export const listActionPlansApi = () => get<ActionPlanSummary[]>('/action-plans')
export const getActionPlanApi = (id: number) => get<ActionPlan>(`/action-plans/${id}`)
export const generateActionPlanApi = (data: {
  requestId: string
  projectId: number
  targetId?: number
  durationWeeks?: number
  startDate?: string
  planType?: PlanType
}) => post<ActionPlan>('/action-plans/generate', data)
export const previewActionPlanApi = (data: {
  requestId: string
  projectId: number
  targetId?: number
  durationWeeks?: number
  startDate?: string
  focus?: string
  planType?: PlanType
}) => post<ActionPlanPreview>('/action-plans/preview', data)
export const generateConfirmedActionPlanApi = (preview: ActionPlanPreview) =>
  post<ActionPlan>('/action-plans/generate-confirmed', {
    requestId: preview.requestId,
    projectId: preview.projectId,
    targetId: preview.targetId,
    durationWeeks: preview.durationWeeks,
    startDate: preview.startDate,
    planType: preview.planType,
    overview: preview.overview,
    weeks: preview.weeks
  })
export const getTodayTasksApi = () => get<TodayTasks>('/action-plans/current/today')
export const updateActionPlanApi = (id: number, data: { overview?: string; status?: string }) =>
  patch<ActionPlan>(`/action-plans/${id}`, data)
export const archiveActionPlanApi = (id: number) => del<void>(`/action-plans/${id}`)
export const addActionTaskApi = (
  planId: number,
  data: {
    weekNo: number
    title: string
    taskType: TaskType
    content?: string
    dueAt?: string | null
    estimatedMinutes?: number | null
    acceptanceCriteria: string
    sortOrder?: number
  }
) => post<ActionPlan>(`/action-plans/${planId}/tasks`, data)
export const updateActionTaskApi = (
  planId: number,
  taskId: number,
  data: {
    weekNo: number
    title: string
    taskType: TaskType
    content?: string
    dueAt?: string | null
    estimatedMinutes?: number | null
    acceptanceCriteria: string
    sortOrder?: number
    expectedVersion: number
  }
) => put<ActionPlan>(`/action-plans/${planId}/tasks/${taskId}`, data)
export const updateActionTaskStatusApi = (
  planId: number,
  taskId: number,
  data: { status: TaskStatus; reason?: string; deferredTo?: string; expectedVersion: number; requestId?: string }
) => patch<ActionPlan>(`/action-plans/${planId}/tasks/${taskId}/status`, {
  ...data,
  requestId: data.requestId || `web-task-status-${crypto.randomUUID()}`
})
export const deleteActionTaskApi = (planId: number, taskId: number, expectedVersion: number) =>
  del<ActionPlan>(`/action-plans/${planId}/tasks/${taskId}`, { expectedVersion })
export const reorderActionTasksApi = (planId: number, tasks: Array<{ id: number; version: number }>) =>
  put<ActionPlan>(`/action-plans/${planId}/tasks/order`, {
    taskIds: tasks.map((task) => task.id),
    expectedVersions: Object.fromEntries(tasks.map((task) => [task.id, task.version]))
  })
export const addTaskResultApi = (
  planId: number,
  taskId: number,
  data: { description: string; linkUrl?: string; saveAsEvidence?: boolean; requestId?: string }
) => post<ActionPlan>(`/action-plans/${planId}/tasks/${taskId}/results`, {
  ...data,
  requestId: data.requestId || `web-task-result-${crypto.randomUUID()}`
})
