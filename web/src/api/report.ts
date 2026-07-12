import request from '@/utils/request'

export type ReportArchiveRequest = {
  title: string
  reportJson: Record<string, unknown>
  sortIndex?: number
  agentRunId?: number
}

export type ReportArchiveRecord = {
  id: string
  userId?: string
  decisionProjectId?: number | null
  agentRunId?: number | null
  snapshotVersion?: number | null
  generationRequestId?: string | null
  type: string
  title: string
  summary: string
  reportJson: string
  sortIndex: number
  createTime?: string
  updateTime?: string
  isDeleted?: number
}

export type ReportGenerateRequest = {
  entryDraft?: Record<string, unknown>
  capabilityProfile?: Record<string, unknown>
  targetJob?: Record<string, unknown>
  pathPlan?: Record<string, unknown>
  pathGraph?: Record<string, unknown>
}

export type ReportGenerateResponse = {
  summary: string
  gaps: Array<{ label: string; items: string[] }>
  planStages: Array<{ name: string; tasks: string[] }>
  agentRunId?: number
  matchAnalysis?: string
  evidenceHighlights?: string[]
  skillPath?: string[]
  action90Days?: string[]
  risksAndAlternatives?: string[]
  resumeInterviewStrategies?: string[]
}

type BackendCareerReport = {
  summary: string
  agentRunId?: number
  profile_tags?: string[]
  strengths?: string[]
  risks?: string[]
  recommended_careers?: Array<{
    title: string
    match_score: number
    reasons: string[]
    core_skills: string[]
    risks: string[]
  }>
  skill_gaps?: Array<{
    skill: string
    priority: string
    suggestion: string
  }>
  next_actions?: string[]
  confidence?: number
}

type BackendReportSnapshot = {
  id: string
  userId?: string
  decisionProjectId?: number | null
  agentRunId?: number | null
  snapshotVersion?: number | null
  generationRequestId?: string | null
  type: string
  title: string
  summary: string
  content: string
  createdAt?: string
  updatedAt?: string
}

type BackendReportPage = {
  items: BackendReportSnapshot[]
  page: number
  size: number
  total: number
  totalPages: number
}

function profileFromRequest(payload: ReportGenerateRequest) {
  const entry = payload.entryDraft ?? {}
  const basic = (entry.basic ?? {}) as Record<string, unknown>
  const target = (entry.target ?? {}) as Record<string, unknown>
  const experiences = (entry.experiences ?? []) as Array<Record<string, unknown>>

  return {
    name: basic.name,
    school: basic.school,
    major: basic.major,
    degree: basic.grade || entry.education,
    target_role: target.role || payload.targetJob?.jobName,
    target_cities: target.cities ?? [],
    expected_salary: target.salary || payload.targetJob?.salary,
    skills: entry.skills ?? [],
    certificates: entry.certificates ?? [],
    experiences: experiences.map((item) => `${item.title ?? ''}: ${item.desc ?? ''}`),
    values: Object.values((entry.questionnaireAnswers ?? {}) as Record<string, unknown>).flat().map(String)
  }
}

function mapCareerReport(data: BackendCareerReport): ReportGenerateResponse {
  const careers = data.recommended_careers ?? []
  const skillGaps = data.skill_gaps ?? []
  const nextActions = data.next_actions ?? []

  return {
    summary: data.summary,
    gaps: [
      {
        label: '能力差距',
        items: skillGaps.map((item) => `${item.skill}：${item.suggestion}`)
      },
      {
        label: '风险提示',
        items: data.risks ?? []
      }
    ].filter((block) => block.items.length),
    planStages: [
      {
        name: '近期行动',
        tasks: nextActions
      }
    ],
    agentRunId: data.agentRunId,
    matchAnalysis: careers.map((item) => `${item.title}：${item.match_score}%`).join('；'),
    evidenceHighlights: data.strengths ?? [],
    skillPath: skillGaps.map((item) => `${item.priority} - ${item.skill}：${item.suggestion}`),
    action90Days: nextActions,
    risksAndAlternatives: data.risks ?? [],
    resumeInterviewStrategies: careers.flatMap((item) => item.core_skills).slice(0, 6)
  }
}

function mapArchive(item: BackendReportSnapshot): ReportArchiveRecord {
  return {
    id: item.id,
    userId: item.userId,
    decisionProjectId: item.decisionProjectId,
    agentRunId: item.agentRunId,
    snapshotVersion: item.snapshotVersion,
    generationRequestId: item.generationRequestId,
    type: item.type,
    title: item.title,
    summary: item.summary,
    reportJson: item.content,
    sortIndex: 0,
    createTime: item.createdAt,
    updateTime: item.updatedAt,
    isDeleted: 0
  }
}

export const saveReportArchiveApi = (payload: ReportArchiveRequest) => {
  const summary = String((payload.reportJson.content as Record<string, unknown> | undefined)?.summary || payload.title)
  return request<BackendReportSnapshot>({
    url: '/reports/archive',
    method: 'post',
    data: {
      type: 'career',
      title: payload.title,
      summary,
      content: JSON.stringify(payload.reportJson),
      agentRunId: payload.agentRunId
    }
  })
}

export const generateReportApi = async (payload: ReportGenerateRequest) => {
  const data = await request<BackendCareerReport>({
    url: '/career-reports/generate',
    method: 'post',
    data: {
      requestId: `report-${Date.now()}`,
      profile: profileFromRequest(payload),
      assessment: {
        mbti_type: payload.entryDraft?.mbtiResult,
        strengths: payload.capabilityProfile?.tags ?? [],
        interests: payload.targetJob?.jobName ? [String(payload.targetJob.jobName)] : [],
        weaknesses: []
      }
    },
    timeout: 60000
  })
  return mapCareerReport(data)
}

export const listReportArchivesApi = async () => {
  const page = await request<BackendReportPage>({
    url: '/reports',
    method: 'get',
    params: { page: 0, size: 50 }
  })
  return page.items.map(mapArchive)
}

export const getReportArchiveDetailApi = async (id: number | string) => {
  const item = await request<BackendReportSnapshot>({
    url: `/reports/${id}`,
    method: 'get'
  })
  return mapArchive(item)
}

export const createDecisionSnapshotApi = (projectId: number, requestId: string) =>
  request<BackendReportSnapshot>({
    url: `/decision-projects/${projectId}/reports/snapshot`,
    method: 'post',
    data: { requestId }
  })

export const deleteReportArchiveApi = (id: number | string) =>
  request<void>({ url: `/reports/${id}`, method: 'delete' })
