/**
 * 模块：职业测验本地存储工具（career 相关）。
 * 职责：统一管理职业测验过程中在浏览器 localStorage 中保存的目标岗位、路径规划、
 *       能力画像草稿、信息录入草稿、深度问卷答案以及报告历史快照等数据，
 *       并提供按类型加载/保存/清理的工具函数（含整轮清理与仅衍生数据清理）。
 */
import type { CapabilityProfileResponse } from '@/api/capability'

export type TargetJob = {
  id: string
  jobName: string
  companyName: string
  city: string
  salary: string
  matchRate: number
  keyRequirements: string[]
  description?: string
}

export type EntryDraft = {
  basic?: { name?: string; email?: string; school?: string; major?: string; grade?: string; city?: string }
  target?: { role?: string; jobType?: string; cities?: string[]; salary?: string; availableAt?: string; avoid?: string }
  skills?: string[]
  certificates?: string[]
  experiences?: Array<{ title: string; desc: string }>
  values?: number[]
  mbtiResult?: string | null
  age?: number
  education?: string
  tendencyAnswers?: number[]
  mbtiAnswers?: number[]
  links?: { github?: string; portfolio?: string }
  questionnaireAnswers?: Record<string, string | string[]>
}

export type PlanTask = {
  id: string
  title: string
  done: boolean
}

export type PlanStage = {
  id: string
  name: string
  tasks: PlanTask[]
}

export type PathPlan = {
  id: string
  targetJobId: string
  stages: PlanStage[]
  updatedAt: string
}

export type CapabilityProfileDraft = {
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
  recommendKeyword?: string
  recommendedJobs: Array<{
    id: number
    jobName: string
    companyName: string
    location: string
    salaryRange: string
    industry?: string
    jobSourceUrl?: string
  }>
}

export type PathGraphDraft = {
  nodes: Array<{ id: string; name: string; type: 'current' | 'target' | 'alternative' }>
  links: Array<{ source: string; target: string; type: 'promotion' | 'career_change'; label: string; skills: string[] }>
  recommendations: Array<{ name: string; steps: string[] }>
}

export type DeepAssessmentDraft = Record<string, string | string[]>

const KEYS = {
  targetJob: 'career.targetJob',
  pathPlan: 'career.pathPlan',
  pathGraph: 'career.pathGraph',
  reportHistory: 'career.reportHistory',
  entryDraft: 'career.entryDraft',
  capabilityProfile: 'career.capabilityProfile',
  deepAssessment: 'career.deepAssessment'
} as const

export const loadTargetJob = (): TargetJob | null => {
  const raw = localStorage.getItem(KEYS.targetJob)
  if (!raw) return null
  try {
    return JSON.parse(raw) as TargetJob
  } catch {
    return null
  }
}

export const saveTargetJob = (job: TargetJob) => {
  localStorage.setItem(KEYS.targetJob, JSON.stringify(job))
}

export const clearTargetJob = () => {
  localStorage.removeItem(KEYS.targetJob)
}

export const loadPathPlan = (): PathPlan | null => {
  const raw = localStorage.getItem(KEYS.pathPlan)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PathPlan
  } catch {
    return null
  }
}

export const savePathPlan = (plan: PathPlan) => {
  localStorage.setItem(KEYS.pathPlan, JSON.stringify(plan))
}

export const clearPathPlan = () => {
  localStorage.removeItem(KEYS.pathPlan)
}

export const loadPathGraph = (): PathGraphDraft | null => {
  const raw = localStorage.getItem(KEYS.pathGraph)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PathGraphDraft
  } catch {
    return null
  }
}

export const savePathGraph = (graph: PathGraphDraft) => {
  localStorage.setItem(KEYS.pathGraph, JSON.stringify(graph))
}

export const clearPathGraph = () => {
  localStorage.removeItem(KEYS.pathGraph)
}

export const loadCapabilityProfileDraft = (): CapabilityProfileResponse | null => {
  const raw = localStorage.getItem(KEYS.capabilityProfile)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CapabilityProfileResponse
  } catch {
    return null
  }
}

export const saveCapabilityProfileDraft = (draft: CapabilityProfileResponse) => {
  localStorage.setItem(KEYS.capabilityProfile, JSON.stringify(draft))
}

export const clearCapabilityProfileDraft = () => {
  localStorage.removeItem(KEYS.capabilityProfile)
}

export const loadDeepAssessmentDraft = (): DeepAssessmentDraft | null => {
  const raw = localStorage.getItem(KEYS.deepAssessment)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DeepAssessmentDraft
  } catch {
    return null
  }
}

export const saveDeepAssessmentDraft = (answers: DeepAssessmentDraft) => {
  localStorage.setItem(KEYS.deepAssessment, JSON.stringify(answers))
}

export const clearDeepAssessmentDraft = () => {
  localStorage.removeItem(KEYS.deepAssessment)
}

export type ReportSnapshot = {
  id: string
  title: string
  targetJobName?: string
  createdAt: string
  content: {
    summary: string
    gaps: Array<{ label: string; items: string[] }>
    planStages: PlanStage[]
  }
}

export const loadReportHistory = (): ReportSnapshot[] => {
  const raw = localStorage.getItem(KEYS.reportHistory)
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? (list as ReportSnapshot[]) : []
  } catch {
    return []
  }
}

export const saveReportHistory = (next: ReportSnapshot[]) => {
  localStorage.setItem(KEYS.reportHistory, JSON.stringify(next))
}

export const clearReportHistory = () => {
  localStorage.removeItem(KEYS.reportHistory)
}

/**
 * 清理本轮职业测验中的大模型衍生数据：
 * - 能力画像草稿
 * - 路径规划与路径图谱
 * - 本地报告历史快照
 *
 * 保留用户手动填写的基础信息与问卷答案（entryDraft、deepAssessment）以及目标岗位选择。
 */
export const clearDerivedCareerData = () => {
  clearPathPlan()
  clearPathGraph()
  clearCapabilityProfileDraft()
  clearReportHistory()
}

export const loadEntryDraft = (): EntryDraft | null => {
  const raw = localStorage.getItem(KEYS.entryDraft)
  if (!raw) return null
  try {
    return JSON.parse(raw) as EntryDraft
  } catch {
    return null
  }
}

export const saveEntryDraft = (draft: EntryDraft) => {
  localStorage.setItem(KEYS.entryDraft, JSON.stringify(draft))
}

export const clearEntryDraft = () => {
  localStorage.removeItem(KEYS.entryDraft)
}

export const clearAllLocalCareerData = () => {
  clearTargetJob()
  clearEntryDraft()
  clearDeepAssessmentDraft()
  clearDerivedCareerData()
}
