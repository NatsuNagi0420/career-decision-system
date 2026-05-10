<!--
  页面：当前轮职业报告页（/report）。
  职责：基于当前目标岗位与路径规划数据生成一份可阅读的职业规划报告，
        支持本地快照保存与提交后端进行报告归档。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Navbar from '../components/Navbar.vue'
import { useRouter } from 'vue-router'
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
import { ElMessage } from 'element-plus'
import { FileText, Download, Save, ArrowLeft } from 'lucide-vue-next'
import { generateReportApi, saveReportArchiveApi, type ReportGenerateResponse } from '@/api/report'
import { activityMonitor } from '@/utils/activityMonitor'

defineOptions({
  name: 'CareerReportPage'
})

const router = useRouter()

const targetJob = ref<TargetJob | null>(null)
const plan = ref<PathPlan | null>(null)
const aiContent = ref<ReportGenerateResponse | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const createdAt = new Date().toLocaleString()

onMounted(async () => {
  loading.value = true
  errorMessage.value = null
  try {
    const draft = loadEntryDraft()
    if (!draft) {
      errorMessage.value = '还没有完成信息录入，请先在“综合信息录入”页面提交核心信息'
      ElMessage.warning('还没有完成信息录入，请先在“综合信息录入”页面提交核心信息')
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

type RenderTask = {
  id: string
  title: string
  done?: boolean
}

type RenderStage = {
  id: string
  name: string
  tasks: RenderTask[]
}

type GapBlock = {
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
    const label = normalizeText((v as any).label)
    if (!label) return
    const items = normalizeList((v as any).items, [])
    if (!items.length) return
    out.push({ label, items })
  })
  return out
}

const displaySummary = computed(() => normalizeText(aiContent.value?.summary) || summary.value)

const displayGaps = computed<GapBlock[]>(() => {
  const aiGaps = normalizeGaps(aiContent.value?.gaps)
  return aiGaps.length ? aiGaps : gapBlocks.value
})

const displayPlanStages = computed<RenderStage[]>(() => {
  const rawStages = (aiContent.value as any)?.planStages
  if (Array.isArray(rawStages) && rawStages.length) {
    return rawStages.map((s, idx) => {
      const name = normalizeText((s as any)?.name) || `阶段${idx + 1}`
      const rawTasks = Array.isArray((s as any)?.tasks) ? (s as any).tasks : []
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
  normalizeText((aiContent.value as any)?.matchAnalysis) ||
  `结合你的目标岗位「${targetJob.value?.jobName || '目标岗位'}」，系统将从能力画像与路径规划中提炼关键匹配点与差距方向。`
)

const evidenceHighlights = computed(() =>
  normalizeList((aiContent.value as any)?.evidenceHighlights, [
    '可在项目经历中提炼与岗位相关的成果证据',
    '补充量化结果以增强可信度'
  ])
)

const skillPath = computed(() =>
  normalizeList((aiContent.value as any)?.skillPath, [
    '拆分岗位核心能力为可执行的学习清单',
    '结合项目实战逐步沉淀可展示的能力成果'
  ])
)

const action90Days = computed(() =>
  normalizeList((aiContent.value as any)?.action90Days, [
    '第 1-30 天：聚焦 1-2 项关键技能与基础项目',
    '第 31-60 天：扩展项目深度并完善作品集',
    '第 61-90 天：准备投递与面试模拟复盘'
  ])
)

const risksAndAlternatives = computed(() =>
  normalizeList((aiContent.value as any)?.risksAndAlternatives, [
    '若核心技能进展缓慢，可先转向相近岗位积累经验',
    '提前准备备选行业或岗位方向，分散风险'
  ])
)

const resumeInterviewStrategies = computed(() =>
  normalizeList((aiContent.value as any)?.resumeInterviewStrategies, [
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
      reportJson
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
</script>

<template>
  <div class="report-page clay-page">
    <Navbar />
    <div class="page-container" v-loading="loading">
      <div class="header mb-6">
        <div class="title-row">
          <FileText :size="22" class="title-icon" />
          <h1 class="title">报告生成</h1>
          <span class="step-tag">第5步</span>
        </div>
        <p class="text-sub">预览、导出并归档你的专属职业规划报告</p>
      </div>

      <div v-if="!targetJob" class="empty card report-empty">
        <div class="empty-title">还缺少目标岗位与计划</div>
        <div class="text-sub mb-6">请先完成岗位探索与路径规划，再生成报告</div>
        <el-button type="primary" @click="router.push('/job-exploration')">去岗位探索</el-button>
      </div>

      <div v-else class="layout">
        <aside class="toc card">
          <div class="toc-title">目录</div>
          <a class="toc-link" href="#sec-summary">A. 总览</a>
          <a class="toc-link" href="#sec-target">B. 目标岗位</a>
          <a class="toc-link" href="#sec-gap">C. 差距清单</a>
          <a class="toc-link" href="#sec-plan">D. 行动计划</a>
          <a class="toc-link" href="#sec-match">E. 岗位匹配详析</a>
          <a class="toc-link" href="#sec-evidence">F. 能力证据与亮点</a>
          <a class="toc-link" href="#sec-skill">G. 技能提升路径</a>
          <a class="toc-link" href="#sec-90days">H. 90天行动清单</a>
          <a class="toc-link" href="#sec-risk">I. 风险与备选路径</a>
          <a class="toc-link" href="#sec-resume">J. 简历与面试策略</a>
          <div class="toc-actions">
            <el-button class="w-full" plain @click="goBack">
              <ArrowLeft :size="16" class="mr" />返回路径规划
            </el-button>
            <el-button class="w-full" type="primary" @click="exportPdf">
              <Download :size="16" class="mr" />下载/打印
            </el-button>
            <el-button class="w-full" type="primary" plain @click="saveSnapshot">
              <Save :size="16" class="mr" />保存归档
            </el-button>
          </div>
        </aside>

        <main class="content card">
          <div class="report-head">
            <div>
              <div class="report-title">职业规划报告</div>
              <div class="text-sub">生成时间：{{ createdAt }}</div>
            </div>
            <div class="report-badges">
              <el-tag effect="plain" type="info">目标岗位：{{ targetJob.jobName }}</el-tag>
              <el-tag effect="plain">{{ targetJob.salary }}</el-tag>
            </div>
          </div>

          <section id="sec-summary" class="sec">
            <div class="sec-title">A. 总览</div>
            <div class="sec-text">{{ displaySummary }}</div>
          </section>

          <section id="sec-target" class="sec">
            <div class="sec-title">B. 目标岗位</div>
            <div class="sec-text">
              岗位：{{ targetJob.jobName }}（{{ targetJob.companyName }} · {{ targetJob.city }}）
            </div>
            <div class="sec-text text-sub">
              关键要求：
            </div>
            <div class="tags">
              <el-tag v-for="s in targetJob.keyRequirements" :key="s" effect="plain">{{ s }}</el-tag>
            </div>
          </section>

          <section id="sec-gap" class="sec">
            <div class="sec-title">C. 差距清单</div>
            <div class="gap-grid">
              <div v-for="g in displayGaps" :key="g.label" class="gap card">
                <div class="gap-title">{{ g.label }}</div>
                <ul class="gap-list">
                  <li v-for="it in g.items" :key="it">{{ it }}</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="sec-plan" class="sec">
            <div class="sec-title">D. 分阶段行动计划</div>
            <div v-if="!displayPlanStages.length" class="text-sub">尚未生成行动计划，请回到路径规划页完善。</div>
            <div v-else class="plan-grid">
              <div v-for="s in displayPlanStages" :key="s.id" class="plan-stage">
                <div class="plan-name">{{ s.name }}</div>
                <ul class="plan-list">
                  <li v-for="t in s.tasks" :key="t.id">
                    {{ t.done ? '已完成：' : '待完成：' }}{{ t.title }}
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section id="sec-match" class="sec">
            <div class="sec-title">E. 岗位匹配详析</div>
            <div class="sec-text">{{ matchAnalysis }}</div>
          </section>

          <section id="sec-evidence" class="sec">
            <div class="sec-title">F. 能力证据与亮点</div>
            <ul class="gap-list">
              <li v-for="it in evidenceHighlights" :key="it">{{ it }}</li>
            </ul>
          </section>

          <section id="sec-skill" class="sec">
            <div class="sec-title">G. 技能提升路径</div>
            <ul class="gap-list">
              <li v-for="it in skillPath" :key="it">{{ it }}</li>
            </ul>
          </section>

          <section id="sec-90days" class="sec">
            <div class="sec-title">H. 90天行动清单</div>
            <ul class="gap-list">
              <li v-for="it in action90Days" :key="it">{{ it }}</li>
            </ul>
          </section>

          <section id="sec-risk" class="sec">
            <div class="sec-title">I. 风险与备选路径</div>
            <ul class="gap-list">
              <li v-for="it in risksAndAlternatives" :key="it">{{ it }}</li>
            </ul>
          </section>

          <section id="sec-resume" class="sec">
            <div class="sec-title">J. 简历与面试策略</div>
            <ul class="gap-list">
              <li v-for="it in resumeInterviewStrategies" :key="it">{{ it }}</li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-page {
  min-height: 100vh;
}

.header {
  text-align: left;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
}

.title-icon {
  color: var(--clay-ube-800);
}

.step-tag {
  font-size: 12px;
  color: var(--clay-ube-800);
  background: var(--clay-info-light, #fef6e7);
  border: 1px solid var(--clay-border-subtle);
  padding: 2px 10px;
  border-radius: 999px;
}

.layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.toc {
  padding: 16px;
  border-radius: var(--clay-radius-card);
  position: sticky;
  top: 84px;
}

.toc-title {
  font-weight: 900;
  margin-bottom: 12px;
}

.toc-link {
  display: block;
  padding: 8px 10px;
  border-radius: 10px;
  color: #334155;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.toc-link:hover {
  background: var(--clay-surface-variant);
  color: var(--clay-ube-800);
}

.toc-actions {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.content {
  padding: 18px;
  border-radius: var(--clay-radius-card);
  min-width: 0;
}

.report-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 18px;
}

.report-title {
  font-size: 20px;
  font-weight: 900;
  margin-bottom: 6px;
}

.report-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.sec {
  margin-bottom: 18px;
}

.sec-title {
  font-weight: 900;
  margin-bottom: 10px;
}

.sec-text {
  color: #334155;
  line-height: 1.7;
  font-size: 14px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.gap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.gap {
  padding: 14px;
  border-radius: 14px;
}

.gap-title {
  font-weight: 900;
  margin-bottom: 10px;
}

.gap-list {
  margin: 0;
  padding-left: 16px;
  color: #475569;
}

.plan-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.plan-stage {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: #fff;
}

.plan-name {
  font-weight: 900;
  margin-bottom: 10px;
}

.plan-list {
  margin: 0;
  padding-left: 16px;
  color: #475569;
}

.empty {
  padding: 32px;
  border-radius: var(--clay-radius-card);
}

.empty-title {
  font-size: 18px;
  font-weight: 900;
  margin-bottom: 10px;
}

.report-empty {
  position: relative;
  overflow: hidden;
}

.report-empty::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 160% at 0% 0%, rgba(248, 204, 101, 0.24) 0%, rgba(248, 204, 101, 0) 55%),
    radial-gradient(140% 180% at 100% 0%, rgba(193, 176, 255, 0.22) 0%, rgba(193, 176, 255, 0) 60%);
  opacity: 1;
  pointer-events: none;
}

.report-empty > * {
  position: relative;
}

.error-alert {
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--clay-error-light, #fef2f2);
  border: 1px solid var(--clay-error-border, #fecaca);
  color: var(--clay-error-text, #b91c1c);
  font-size: 13px;
}

.mr {
  margin-right: 6px;
}

@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .toc {
    position: static;
  }

  .gap-grid {
    grid-template-columns: 1fr;
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }
}

@media print {
  .toc {
    display: none;
  }
}
</style>
