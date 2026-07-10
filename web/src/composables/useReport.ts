import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  loadCapabilityProfileDraft,
  loadEntryDraft,
  loadPathGraph,
  loadPathPlan,
  loadReportHistory,
  loadTargetJob,
  saveReportHistory,
  type PathPlan,
  type ReportSnapshot,
  type TargetJob
} from '../utils/storage'
import { generateReportApi, saveReportArchiveApi, type ReportGenerateResponse } from '@/api/report'
import { activityMonitor } from '@/utils/activityMonitor'

export interface RenderTask {
  id: string
  title: string
  done?: boolean
}

export interface RenderStage {
  id: string
  name: string
  tasks: RenderTask[]
}

export interface GapBlock {
  label: string
  items: string[]
}

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const normalizeList = (value: unknown, fallback: string[]) => {
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v).trim()).filter(Boolean)
    return items.length ? items : fallback
  }
  const text = normalizeText(value)
  return text ? [text] : fallback
}

const normalizeGaps = (value: unknown) => {
  if (!Array.isArray(value)) return [] as GapBlock[]
  const out: GapBlock[] = []
  value.forEach((v) => {
    if (!v || typeof v !== 'object') return
    const obj = v as Record<string, unknown>
    const label = normalizeText(obj.label)
    if (!label) return
    const items = normalizeList(obj.items, [])
    if (!items.length) return
    out.push({ label, items })
  })
  return out
}

export function useReport() {
  const router = useRouter()

  const targetJob = ref<TargetJob | null>(null)
  const plan = ref<PathPlan | null>(null)
  const aiContent = ref<ReportGenerateResponse | null>(null)
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  const createdAt = new Date().toLocaleString()

  const loadReportData = async () => {
    loading.value = true
    errorMessage.value = null
    try {
      const draft = loadEntryDraft()
      if (!draft) {
        errorMessage.value = '还没有完成信息录入，请先在"综合信息录入"页面提交核心信息'
        ElMessage.warning('还没有完成信息录入，请先在"综合信息录入"页面提交核心信息')
        router.push('/entry/comprehensive')
        return
      }

      const job = loadTargetJob()
      targetJob.value = job
      plan.value = loadPathPlan()

      try {
        const content = await generateReportApi({
          entryDraft: draft ?? undefined,
          capabilityProfile: loadCapabilityProfileDraft() ?? undefined,
          targetJob: job ?? undefined,
          pathPlan: plan.value ?? undefined,
          pathGraph: loadPathGraph() ?? undefined
        })
        aiContent.value = content ?? null
        activityMonitor.recordAction('报告生成完成', { reportGenerated: true })
      } catch {
        // AI 生成失败时保持本地兜底内容
      }
    } catch (e) {
      const msg = (e as Error)?.message || '加载报告数据失败，请稍后重试'
      errorMessage.value = msg
      ElMessage.error(msg)
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    loadReportData()
  })

  const summary = computed(() => {
    const job = targetJob.value
    if (!job) return '请先在岗位探索选择目标岗位，再生成报告。'
    return `你的目标岗位为「${job.jobName}」，当前系统将根据你的录入信息与行动计划，输出一份可执行的成长路线与投递建议。`
  })

  const gapBlocks = computed(() => {
    const job = targetJob.value
    const skills = job?.keyRequirements?.slice(0, 6) || []
    return [
      {
        label: '关键技能差距（示意）',
        items: skills.length ? skills : ['核心技能将从目标岗位要求中提取']
      },
      {
        label: '行动建议（示意）',
        items: ['优先补齐核心技能并产出作品集', '按阶段投递与复盘提升命中率', '结合面试反馈迭代简历与项目表述']
      }
    ]
  })

  const displaySummary = computed(() => normalizeText(aiContent.value?.summary) || summary.value)

  const displayGaps = computed<GapBlock[]>(() => {
    const aiGaps = normalizeGaps(aiContent.value?.gaps)
    return aiGaps.length ? aiGaps : gapBlocks.value
  })

  const displayPlanStages = computed<RenderStage[]>(() => {
    const rawStages = (aiContent.value as Record<string, unknown> | null)?.planStages
    if (Array.isArray(rawStages) && rawStages.length) {
      return rawStages.map((s, idx) => {
        const stage = s as Record<string, unknown>
        const name = normalizeText(stage?.name) || `阶段${idx + 1}`
        const rawTasks = Array.isArray(stage?.tasks) ? stage.tasks : []
        const tasks = rawTasks
          .map((t: unknown, tIdx: number) => ({
            id: `ai-task-${idx}-${tIdx}`,
            title: String(t).trim(),
            done: false
          }))
          .filter((t: RenderTask) => t.title)
        return {
          id: `ai-stage-${idx}`,
          name,
          tasks
        }
      })
    }

    if (plan.value?.stages?.length) {
      return plan.value.stages.map((s) => ({
        id: s.id,
        name: s.name,
        tasks: s.tasks.map((t) => ({ id: t.id, title: t.title, done: t.done }))
      }))
    }

    return []
  })

  const matchAnalysis = computed(() =>
    normalizeText((aiContent.value as Record<string, unknown> | null)?.matchAnalysis) ||
    `结合你的目标岗位「${targetJob.value?.jobName || '目标岗位'}」，系统将从能力画像与路径规划中提炼关键匹配点与差距方向。`
  )

  const evidenceHighlights = computed(() =>
    normalizeList((aiContent.value as Record<string, unknown> | null)?.evidenceHighlights, [
      '可在项目经历中提炼与岗位相关的成果证据',
      '补充量化结果以增强可信度'
    ])
  )

  const skillPath = computed(() =>
    normalizeList((aiContent.value as Record<string, unknown> | null)?.skillPath, [
      '拆分岗位核心能力为可执行的学习清单',
      '结合项目实战逐步沉淀可展示的能力成果'
    ])
  )

  const action90Days = computed(() =>
    normalizeList((aiContent.value as Record<string, unknown> | null)?.action90Days, [
      '第 1-30 天：聚焦 1-2 项关键技能与基础项目',
      '第 31-60 天：扩展项目深度并完善作品集',
      '第 61-90 天：准备投递与面试模拟复盘'
    ])
  )

  const risksAndAlternatives = computed(() =>
    normalizeList((aiContent.value as Record<string, unknown> | null)?.risksAndAlternatives, [
      '若核心技能进展缓慢，可先转向相近岗位积累经验',
      '提前准备备选行业或岗位方向，分散风险'
    ])
  )

  const resumeInterviewStrategies = computed(() =>
    normalizeList((aiContent.value as Record<string, unknown> | null)?.resumeInterviewStrategies, [
      '简历突出可量化成果与岗位关键词匹配',
      '准备 3-5 个与目标岗位高度相关的项目复盘故事'
    ])
  )

  const canExport = computed(() => !!targetJob.value)

  const exportPdf = () => {
    if (!canExport.value) {
      ElMessage.warning('请先完成目标岗位与路径规划')
      return
    }
    window.print()
  }

  const saveSnapshot = async () => {
    if (!canExport.value) {
      ElMessage.warning('请先完成目标岗位与路径规划')
      return
    }
    const id = `r-${Date.now()}`

    const snapshotStages = displayPlanStages.value.map((s, idx) => ({
      id: s.id || `stage-${id}-${idx}`,
      name: s.name || `阶段${idx + 1}`,
      tasks: s.tasks.map((t, tIdx) => ({
        id: t.id || `task-${id}-${idx}-${tIdx}`,
        title: t.title,
        done: !!t.done
      }))
    }))

    const next: ReportSnapshot = {
      id,
      title: `职业规划报告 - ${targetJob.value?.jobName || '未命名'}`,
      targetJobName: targetJob.value?.jobName,
      createdAt: new Date().toISOString(),
      content: {
        summary: displaySummary.value,
        gaps: displayGaps.value,
        planStages: snapshotStages
      }
    }

    const reportJson = {
      meta: {
        id,
        createdAt: next.createdAt,
        title: next.title
      },
      targetJob: targetJob.value,
      plan: plan.value,
      capabilityProfile: loadCapabilityProfileDraft(),
      pathGraph: loadPathGraph(),
      content: {
        ...next.content,
        matchAnalysis: matchAnalysis.value,
        evidenceHighlights: evidenceHighlights.value,
        skillPath: skillPath.value,
        action90Days: action90Days.value,
        risksAndAlternatives: risksAndAlternatives.value,
        resumeInterviewStrategies: resumeInterviewStrategies.value
      }
    }

    try {
      await saveReportArchiveApi({
        title: next.title,
        sortIndex: Date.now(),
        reportJson,
        agentRunId: aiContent.value?.agentRunId
      })
    } catch (e) {
      ElMessage.error((e as Error)?.message || '归档保存失败')
      return
    }

    const history = loadReportHistory()
    history.unshift(next)
    saveReportHistory(history.slice(0, 20))
    ElMessage.success('已保存到历史版本')
  }

  const goBack = () => {
    router.push('/path-planning')
  }

  return {
    targetJob,
    plan,
    loading,
    errorMessage,
    createdAt,
    displaySummary,
    displayGaps,
    displayPlanStages,
    matchAnalysis,
    evidenceHighlights,
    skillPath,
    action90Days,
    risksAndAlternatives,
    resumeInterviewStrategies,
    canExport,
    exportPdf,
    saveSnapshot,
    goBack
  }
}
