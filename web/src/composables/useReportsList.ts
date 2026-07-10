import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getReportArchiveDetailApi, listReportArchivesApi, type ReportArchiveRecord } from '@/api/report'

export interface ArchiveListItem {
  id: string
  title: string
  displayTime: string
  targetJobName?: string
  raw: ReportArchiveRecord
}

export interface PlanTask {
  id: string
  title: string
  done: boolean
}

export interface PlanStage {
  id: string
  name: string
  tasks: PlanTask[]
}

export interface TargetJobLite {
  jobName?: string
  companyName?: string
  city?: string
  salary?: string
}

export interface GapBlock {
  label: string
  items: string[]
}

export interface ReportDetailView {
  id: string
  title: string
  createdAt: string
  targetJob?: TargetJobLite
  summary: string
  planStages: PlanStage[]
  gaps: GapBlock[]
  matchAnalysis?: string
  evidenceHighlights: string[]
  skillPath: string[]
  action90Days: string[]
  risksAndAlternatives: string[]
  resumeInterviewStrategies: string[]
}

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }
  return []
}

const parseArchiveToListItem = (item: ReportArchiveRecord): ArchiveListItem => {
  let createdAt = item.createTime || ''
  let title = item.title || '职业规划报告'
  let targetJobName: string | undefined

  try {
    const parsed = item.reportJson ? JSON.parse(item.reportJson) : {}
    const meta = (parsed as Record<string, unknown>).meta as Record<string, unknown> | undefined
    const targetJob = (parsed as Record<string, unknown>).targetJob as Record<string, unknown> | undefined
    createdAt = (meta?.createdAt as string) || createdAt
    title = (meta?.title as string) || title
    targetJobName = (targetJob?.jobName as string) || (meta?.targetJobName as string)
  } catch {
    // ignore parse error, fallback to raw fields
  }

  const displayTime = createdAt ? new Date(createdAt).toLocaleString() : ''

  return {
    id: item.id,
    title,
    displayTime,
    targetJobName,
    raw: item
  }
}

export function useReportsList() {
  const router = useRouter()

  const loadingList = ref(false)
  const loadingDetail = ref(false)
  const archives = ref<ArchiveListItem[]>([])
  const selectedId = ref<string | null>(null)
  const selectedDetail = ref<ReportDetailView | null>(null)

  const goToReport = () => {
    router.push('/report')
  }

  const fetchList = async () => {
    loadingList.value = true
    try {
      const res = await listReportArchivesApi()
      archives.value = (res || []).map(parseArchiveToListItem)
      const first = archives.value[0]
      if (first) {
        handleSelect(first)
      }
    } catch (e) {
      ElMessage.error((e as Error)?.message || '加载历史报告失败')
    } finally {
      loadingList.value = false
    }
  }

  const handleSelect = async (item: ArchiveListItem) => {
    if (!item) return
    selectedId.value = item.id
    loadingDetail.value = true
    try {
      const record = await getReportArchiveDetailApi(item.id)
      let parsed: Record<string, unknown> = {}
      try {
        parsed = record.reportJson ? JSON.parse(record.reportJson) : {}
      } catch {
        parsed = {}
      }
      const meta = (parsed.meta as Record<string, unknown>) || {}
      const targetJob = (parsed.targetJob as Record<string, unknown>) || {}
      const content = (parsed.content as Record<string, unknown>) || {}
      const plan = (parsed.plan as Record<string, unknown>) || {}

      const createdAt = (meta.createdAt as string) || record.createTime || ''
      const summary: string =
        (content.summary as string) ||
        `你的目标岗位为「${(targetJob.jobName as string) || '未指定'}」，系统已根据当时的录入信息生成了一份职业规划建议。`

      const gaps: GapBlock[] = Array.isArray(content.gaps) ? content.gaps : []

      const rawStages = Array.isArray(content.planStages)
        ? content.planStages
        : Array.isArray(plan.stages)
          ? plan.stages
          : []

      const planStages: PlanStage[] = rawStages.map((s: unknown, idx: number) => {
        const stage = s as Record<string, unknown>
        const name = typeof stage?.name === 'string' && stage.name.trim() ? stage.name.trim() : `阶段${idx + 1}`
        const rawTasks = Array.isArray(stage?.tasks) ? stage.tasks : []
        const tasks: PlanTask[] = rawTasks
          .map((t: unknown, tIdx: number) => {
            if (t && typeof t === 'object') {
              const task = t as Record<string, unknown>
              return {
                id: String(task.id ?? `task-${idx}-${tIdx}`),
                title: String(task.title ?? '').trim(),
                done: !!task.done
              }
            }
            return {
              id: `task-${idx}-${tIdx}`,
              title: String(t).trim(),
              done: false
            }
          })
          .filter((t: PlanTask) => t.title)

        return {
          id: String(stage?.id ?? `stage-${idx}`),
          name,
          tasks
        }
      })

      const matchAnalysis = typeof content.matchAnalysis === 'string' ? content.matchAnalysis : ''
      const evidenceHighlights = normalizeList(content.evidenceHighlights)
      const skillPath = normalizeList(content.skillPath)
      const action90Days = normalizeList(content.action90Days)
      const risksAndAlternatives = normalizeList(content.risksAndAlternatives)
      const resumeInterviewStrategies = normalizeList(content.resumeInterviewStrategies)

      selectedDetail.value = {
        id: record.id,
        title: (meta.title as string) || record.title || '职业规划报告',
        createdAt: createdAt ? new Date(createdAt).toLocaleString() : '',
        targetJob: {
          jobName: targetJob.jobName as string,
          companyName: targetJob.companyName as string,
          city: targetJob.city as string,
          salary: targetJob.salary as string
        },
        summary,
        planStages,
        gaps,
        matchAnalysis,
        evidenceHighlights,
        skillPath,
        action90Days,
        risksAndAlternatives,
        resumeInterviewStrategies
      }
    } catch (e) {
      ElMessage.error((e as Error)?.message || '加载报告详情失败')
    } finally {
      loadingDetail.value = false
    }
  }

  onMounted(() => {
    fetchList()
  })

  return {
    loadingList,
    loadingDetail,
    archives,
    selectedId,
    selectedDetail,
    goToReport,
    handleSelect
  }
}
