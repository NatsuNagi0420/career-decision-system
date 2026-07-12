import request from '@/utils/request'

export type BackendMilestone = {
  title: string
  duration: string
  tasks: string[]
  acceptance: string[]
}

type BackendPathPlan = {
  target_role: string
  overview: string
  milestones: BackendMilestone[]
  checkpoints: string[]
  agentRunId?: number
}

export type PathPlanArchivePayload = {
  targetRole: string
  overview?: string
  agentRunId?: number
  milestones: BackendMilestone[]
  checkpoints?: string[]
}

export type BackendPathPlanTask = {
  id: number
  content: string
  status: string
  completedAt?: string
}

export type BackendPathPlanMilestone = {
  id: number
  title: string
  duration: string
  tasks: BackendPathPlanTask[]
  acceptance: string[]
}

export type BackendPathPlanArchive = {
  id: number
  agentRunId?: number
  targetRole: string
  overview: string
  status: string
  taskCount: number
  completedTaskCount: number
  progressPercent: number
  milestones: BackendPathPlanMilestone[]
  checkpoints: string[]
  createdAt?: string
  updatedAt?: string
}

export type BackendPathPlanArchiveSummary = Omit<BackendPathPlanArchive, 'milestones' | 'checkpoints'> & {
  milestoneCount: number
}

function profileFromPayload(payload: Record<string, unknown>) {
  const basic = (payload.basic ?? {}) as Record<string, unknown>
  const target = (payload.target ?? {}) as Record<string, unknown>
  const experiences = (payload.experiences ?? []) as Array<Record<string, unknown>>

  return {
    name: basic.name,
    school: basic.school,
    major: basic.major,
    degree: basic.grade || payload.education,
    target_role: target.role,
    target_cities: target.cities ?? [],
    expected_salary: target.salary,
    skills: payload.skills ?? [],
    certificates: payload.certificates ?? [],
    experiences: experiences.map((item) => `${item.title ?? ''}: ${item.desc ?? ''}`),
    values: Object.values((payload.questionnaireAnswers ?? {}) as Record<string, unknown>).flat().map(String)
  }
}

function targetRoleFromPayload(payload: Record<string, unknown>) {
  const target = (payload.target ?? {}) as Record<string, unknown>
  return String(target.role || payload.targetRole || '目标岗位')
}

function mapPathPlan(data: BackendPathPlan) {
  const nodes = [
    {
      id: 'current',
      name: '当前能力',
      type: 'current' as const
    },
    ...data.milestones.map((milestone, index) => ({
      id: `milestone-${index + 1}`,
      name: milestone.title,
      type: 'alternative' as const
    })),
    {
      id: 'target',
      name: data.target_role,
      type: 'target' as const
    }
  ]

  const links = data.milestones.map((milestone, index) => ({
    source: index === 0 ? 'current' : `milestone-${index}`,
    target: `milestone-${index + 1}`,
    type: 'promotion' as const,
    label: milestone.duration,
    skills: milestone.tasks
  }))

  links.push({
    source: data.milestones.length ? `milestone-${data.milestones.length}` : 'current',
    target: 'target',
    type: 'promotion' as const,
    label: '完成目标',
    skills: data.checkpoints
  })

  return {
    nodes,
    links,
    recommendations: data.milestones.map((milestone) => ({
      name: milestone.title,
      steps: [...milestone.tasks, ...milestone.acceptance]
    })),
    rawPlan: {
      targetRole: data.target_role,
      overview: data.overview,
      agentRunId: data.agentRunId,
      milestones: data.milestones,
      checkpoints: data.checkpoints
    }
  }
}

export const generatePathPlanApi = async (payload: Record<string, unknown> = {}) => {
  const data = await request<BackendPathPlan>({
    url: '/path-plans/generate',
    method: 'post',
    data: {
      requestId: `path-${Date.now()}`,
      profile: profileFromPayload(payload),
      targetRole: targetRoleFromPayload(payload)
    },
    timeout: 60000
  })
  return mapPathPlan(data)
}

export const generatePathPlanStreamApi = async (_payload: Record<string, unknown> = {}): Promise<Response> => {
  return new Response(null, { status: 501, statusText: 'Streaming path planning is not available' })
}

export const archivePathPlanApi = async (payload: PathPlanArchivePayload) => {
  return request<BackendPathPlanArchive>({
    url: '/path-plans/archive',
    method: 'post',
    data: {
      targetRole: payload.targetRole,
      overview: payload.overview || '',
      agentRunId: payload.agentRunId,
      milestones: payload.milestones,
      checkpoints: payload.checkpoints ?? []
    }
  })
}

export const listArchivedPathPlansApi = () =>
  request<BackendPathPlanArchiveSummary[]>({
    url: '/path-plans',
    method: 'get',
    params: { page: 0, size: 50 }
  })

export const getArchivedPathPlanDetailApi = (id: number) =>
  request<BackendPathPlanArchive>({
    url: `/path-plans/${id}`,
    method: 'get'
  })

export const deleteArchivedPathPlanApi = (id: number) =>
  request<void>({
    url: `/path-plans/${id}`,
    method: 'delete'
  })
