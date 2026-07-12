<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileClock, FileText, FileUser, ListChecks, Target, Trash2 } from 'lucide-vue-next'
import { m3Confirm, m3Message } from '@/design-system/services/feedback'
import { M3ProgressOverlay } from '@/design-system/components'
import type { ActionPlan, TaskStatus } from '@/api/actionPlans'
import {
  deleteArchivedPathPlanApi,
  getArchivedPathPlanDetailApi,
  listArchivedPathPlansApi,
  type BackendPathPlanArchive
} from '@/api/persistence'
import {
  deleteReportArchiveApi,
  getReportArchiveDetailApi,
  listReportArchivesApi,
  type ReportArchiveRecord
} from '@/api/report'
import {
  deleteResumeAnalysisArchiveApi,
  getResumeAnalysisArchiveDetailApi,
  listResumeAnalysisArchivesApi,
  type ResumeAnalysisArchiveDetail
} from '@/api/resume'

defineOptions({ name: 'HistoryPage' })

type SnapshotProject = {
  id: number
  title: string
  question: string
  status: string
  candidates?: Array<{
    id: number
    name: string
    recommendationReason?: string | null
    opposingFactors?: string | null
    uncertainties?: string | null
  }>
  evidence?: Array<{
    id: number
    title: string
    detail?: string | null
    sourceType?: string
    credibility?: string
    stance?: string
  }>
  targets?: Array<{
    targetType: 'primary' | 'backup'
    targetName: string
    decisionReason?: string | null
    mainRisks?: string | null
    reviewDate?: string | null
  }>
}

type DecisionSnapshotContent = {
  kind?: string
  projectVersion?: number
  capturedAt?: string
  project?: SnapshotProject
  actionPlan?: ActionPlan | null
}

type HistoryResourceType = 'report' | 'resume_analysis' | 'legacy_path_plan'
type HistoryFilter = 'all' | 'decision_snapshot' | 'legacy_report' | 'resume_analysis' | 'legacy_path_plan'

type HistoryItem = {
  key: string
  resourceType: HistoryResourceType
  id: number | string
  title: string
  typeLabel: string
  summary: string
  createdAt?: string
  reportType?: string
}

const loading = ref(true)
const detailLoading = ref(false)
const records = ref<HistoryItem[]>([])
const activeFilter = ref<HistoryFilter>('all')
const selected = ref<HistoryItem | null>(null)
const selectedReport = ref<ReportArchiveRecord | null>(null)
const selectedResume = ref<ResumeAnalysisArchiveDetail | null>(null)
const selectedPathPlan = ref<BackendPathPlanArchive | null>(null)
let detailRequestSerial = 0

const parsedContent = computed<Record<string, unknown>>(() => {
  if (!selectedReport.value?.reportJson) return {}
  try {
    return JSON.parse(selectedReport.value.reportJson) as Record<string, unknown>
  } catch {
    return { content: selectedReport.value.reportJson }
  }
})
const decisionSnapshot = computed(() => parsedContent.value as DecisionSnapshotContent)
const project = computed(() => selectedReport.value?.type === 'decision_snapshot' ? decisionSnapshot.value.project : undefined)
const snapshotActionPlan = computed(() => project.value ? decisionSnapshot.value.actionPlan : undefined)
const primaryTarget = computed(() => project.value?.targets?.find((item) => item.targetType === 'primary'))
const backupTarget = computed(() => project.value?.targets?.find((item) => item.targetType === 'backup'))
const legacyContent = computed<Record<string, unknown>>(() => {
  const content = parsedContent.value.content
  return content && typeof content === 'object' && !Array.isArray(content)
    ? content as Record<string, unknown>
    : parsedContent.value
})
const detailSummary = computed(() => {
  if (selectedReport.value) return selectedReport.value.summary
  if (selectedResume.value) {
    const role = selectedResume.value.targetRole ? `面向“${selectedResume.value.targetRole}”` : '未指定目标岗位'
    return `${role}的简历分析结果。简历原文没有存入数据库。`
  }
  if (selectedPathPlan.value) return selectedPathPlan.value.overview || '这是旧版五步流程保存的路径计划。'
  return selected.value?.summary || ''
})
const historyFilters: Array<{ value: HistoryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'decision_snapshot', label: '决策快照' },
  { value: 'legacy_report', label: '旧报告' },
  { value: 'resume_analysis', label: '简历分析' },
  { value: 'legacy_path_plan', label: '旧路径' }
]
const matchesFilter = (record: HistoryItem, filter: HistoryFilter) => {
  if (filter === 'all') return true
  if (filter === 'decision_snapshot') return record.reportType === 'decision_snapshot'
  if (filter === 'legacy_report') return record.resourceType === 'report' && record.reportType !== 'decision_snapshot'
  return record.resourceType === filter
}
const filteredRecords = computed(() => records.value.filter((record) => matchesFilter(record, activeFilter.value)))
const filterCount = (filter: HistoryFilter) => records.value.filter((record) => matchesFilter(record, filter)).length
const taskStatusLabel: Record<TaskStatus, string> = {
  todo: '待完成', in_progress: '进行中', completed: '已完成', deferred: '已延期', skipped: '已跳过'
}

const formatDate = (value?: string) => {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const historyTime = (value?: string) => {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const clearDetail = () => {
  selectedReport.value = null
  selectedResume.value = null
  selectedPathPlan.value = null
}

const selectFilter = async (filter: HistoryFilter) => {
  activeFilter.value = filter
  if (selected.value && matchesFilter(selected.value, filter)) return
  detailRequestSerial += 1
  detailLoading.value = false
  selected.value = null
  clearDetail()
  if (filteredRecords.value[0]) await loadDetail(filteredRecords.value[0])
}

const loadDetail = async (record: HistoryItem) => {
  const requestSerial = ++detailRequestSerial
  selected.value = record
  detailLoading.value = true
  clearDetail()
  try {
    if (record.resourceType === 'report') {
      const detail = await getReportArchiveDetailApi(record.id)
      if (requestSerial === detailRequestSerial) selectedReport.value = detail
    } else if (record.resourceType === 'resume_analysis') {
      const detail = await getResumeAnalysisArchiveDetailApi(Number(record.id))
      if (requestSerial === detailRequestSerial) selectedResume.value = detail
    } else {
      const detail = await getArchivedPathPlanDetailApi(Number(record.id))
      if (requestSerial === detailRequestSerial) selectedPathPlan.value = detail
    }
  } finally {
    if (requestSerial === detailRequestSerial) detailLoading.value = false
  }
}

const load = async () => {
  loading.value = true
  try {
    const [reports, resumeAnalyses, pathPlans] = await Promise.all([
      listReportArchivesApi(),
      listResumeAnalysisArchivesApi(),
      listArchivedPathPlansApi()
    ])

    records.value = [
      ...reports.map((record): HistoryItem => ({
        key: `report-${record.id}`,
        resourceType: 'report',
        id: record.id,
        title: record.title,
        typeLabel: record.type === 'decision_snapshot'
          ? `决策快照 v${record.snapshotVersion || 1}`
          : '旧版职业报告',
        summary: record.summary,
        createdAt: record.createTime,
        reportType: record.type
      })),
      ...resumeAnalyses.map((record): HistoryItem => ({
        key: `resume-${record.id}`,
        resourceType: 'resume_analysis',
        id: record.id,
        title: record.targetRole ? `${record.targetRole}简历分析` : '简历分析',
        typeLabel: '简历分析',
        summary: `综合评分 ${record.score ?? '未评分'}，发现 ${record.issueCount} 个问题。`,
        createdAt: record.createdAt
      })),
      ...pathPlans.map((record): HistoryItem => ({
        key: `path-${record.id}`,
        resourceType: 'legacy_path_plan',
        id: record.id,
        title: record.targetRole ? `${record.targetRole}路径计划` : '旧版路径计划',
        typeLabel: '旧版路径计划',
        summary: record.overview || `${record.milestoneCount} 个阶段，${record.taskCount} 项任务。`,
        createdAt: record.createdAt
      }))
    ].sort((left, right) => historyTime(right.createdAt) - historyTime(left.createdAt))

    if (filteredRecords.value[0]) await loadDetail(filteredRecords.value[0])
  } finally {
    loading.value = false
  }
}

const remove = async (record: HistoryItem) => {
  const impact = record.resourceType === 'legacy_path_plan'
    ? '旧路径计划会被归档并从列表移除，新行动计划不会受影响。'
    : record.resourceType === 'resume_analysis'
      ? '该分析结果会被删除，个人档案不会受影响。'
      : '此操作只删除历史记录，不影响决策项目。'
  await m3Confirm(`删除“${record.title}”？${impact}`, '删除历史记录', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
  })

  if (record.resourceType === 'report') {
    await deleteReportArchiveApi(record.id)
  } else if (record.resourceType === 'resume_analysis') {
    await deleteResumeAnalysisArchiveApi(Number(record.id))
  } else {
    await deleteArchivedPathPlanApi(Number(record.id))
  }

  records.value = records.value.filter((item) => item.key !== record.key)
  if (selected.value?.key === record.key) {
    selected.value = null
    clearDetail()
    if (filteredRecords.value[0]) await loadDetail(filteredRecords.value[0])
  }
  m3Message.success('历史记录已删除')
}

void load()
</script>

<template>
  <div class="product-page">
    <div class="product-shell history-shell">
      <header class="product-header">
        <div><h1>历史记录</h1><p>集中查看决策快照、旧职业报告、简历分析与旧版路径计划。</p></div>
        <span class="record-count">{{ records.length }} 条</span>
      </header>

      <M3Tabs v-if="!loading && records.length" class="history-filters" aria-label="历史记录类型筛选">
        <M3Tab
          v-for="filter in historyFilters"
          :key="filter.value"
          :active="activeFilter === filter.value"
          @click="selectFilter(filter.value)"
        >
          {{ filter.label }}<span>{{ filterCount(filter.value) }}</span>
        </M3Tab>
      </M3Tabs>

      <M3Card tag="div" v-if="loading" class="history-state">正在加载历史记录...</M3Card>
      <M3Card tag="div" v-else-if="!records.length" class="history-state">
        <FileClock :size="30" />
        <strong>还没有历史记录</strong>
        <span>确认职业目标后，可以在决策项目中保存第一份快照。</span>
      </M3Card>

      <div v-else class="history-layout">
        <aside class="history-list" aria-label="历史记录列表">
          <M3Card
            v-for="record in filteredRecords"
            :key="record.key"
            tag="button"
            variant="filled"
            interactive
            :class="{ active: selected?.key === record.key }"
            @click="loadDetail(record)"
          >
            <span class="record-icon">
              <Target v-if="record.reportType === 'decision_snapshot'" :size="17" />
              <FileUser v-else-if="record.resourceType === 'resume_analysis'" :size="17" />
              <ListChecks v-else-if="record.resourceType === 'legacy_path_plan'" :size="17" />
              <FileText v-else :size="17" />
            </span>
            <span class="record-copy">
              <strong>{{ record.title }}</strong>
              <small>{{ record.typeLabel }} · {{ formatDate(record.createdAt) }}</small>
            </span>
          </M3Card>
          <p v-if="!filteredRecords.length" class="empty-filter">当前类型还没有记录。</p>
        </aside>

        <M3Card tag="main" class="history-detail loading-host">
          <M3ProgressOverlay :visible="detailLoading" label="正在加载历史详情" />
          <template v-if="selected">
            <header class="detail-header">
              <div><span>{{ selected.typeLabel }}</span><h2>{{ selected.title }}</h2><p>{{ formatDate(selected.createdAt) }}</p></div>
              <M3IconButton class="danger-icon" label="删除历史记录" @click="remove(selected)">
                <Trash2 :size="17" />
              </M3IconButton>
            </header>

            <section class="summary-band"><strong>摘要</strong><p>{{ detailSummary }}</p></section>

            <template v-if="selectedReport">
              <template v-if="project">
                <section class="detail-section"><h3>决策问题</h3><p>{{ project.question }}</p></section>
                <section class="target-band">
                  <div><span>主目标</span><strong>{{ primaryTarget?.targetName || '未记录' }}</strong><p>{{ primaryTarget?.decisionReason }}</p></div>
                  <div v-if="backupTarget"><span>备选目标</span><strong>{{ backupTarget.targetName }}</strong><p>{{ backupTarget.decisionReason }}</p></div>
                </section>
                <section class="metric-band snapshot-metrics" aria-label="快照版本信息">
                  <div><span>项目数据版本</span><strong>v{{ decisionSnapshot.projectVersion ?? '未知' }}</strong></div>
                  <div><span>保存时间</span><strong>{{ formatDate(decisionSnapshot.capturedAt || selected.createdAt) }}</strong></div>
                  <div><span>行动计划</span><strong>{{ snapshotActionPlan ? `${snapshotActionPlan.durationWeeks} 周` : '尚未生成' }}</strong></div>
                </section>
                <section v-if="project.candidates?.length" class="detail-section">
                  <h3>候选方向</h3>
                  <div class="snapshot-list">
                    <article v-for="candidate in project.candidates" :key="candidate.id">
                      <strong>{{ candidate.name }}</strong>
                      <dl>
                        <div><dt>支持</dt><dd>{{ candidate.recommendationReason || '未记录' }}</dd></div>
                        <div><dt>反对</dt><dd>{{ candidate.opposingFactors || '未记录' }}</dd></div>
                        <div><dt>不确定</dt><dd>{{ candidate.uncertainties || '未记录' }}</dd></div>
                      </dl>
                    </article>
                  </div>
                </section>
                <section v-if="project.evidence?.length" class="detail-section">
                  <h3>项目证据</h3>
                  <div class="evidence-table">
                    <div v-for="item in project.evidence" :key="item.id">
                      <span>{{ item.sourceType }} · {{ item.credibility }} · {{ item.stance }}</span>
                      <strong>{{ item.title }}</strong>
                      <p>{{ item.detail }}</p>
                    </div>
                  </div>
                </section>
                <section class="detail-section">
                  <h3>快照中的行动计划</h3>
                  <template v-if="snapshotActionPlan">
                    <p>{{ snapshotActionPlan.overview }}</p>
                    <div class="snapshot-plan-progress"><strong>{{ snapshotActionPlan.progressPercent }}%</strong><span>{{ snapshotActionPlan.completedTaskCount }} / {{ snapshotActionPlan.taskCount }} 个任务已完成</span></div>
                    <div class="snapshot-plan-weeks">
                      <article v-for="week in snapshotActionPlan.weeks" :key="week.id">
                        <header><span>第 {{ week.weekNo }} 周</span><strong>{{ week.goal }}</strong></header>
                        <ul>
                          <li v-for="task in week.tasks" :key="task.id">
                            <span>{{ taskStatusLabel[task.status] }}</span>
                            <div><strong>{{ task.title }}</strong><small>验收：{{ task.acceptanceCriteria }}<template v-if="task.results.length"> · {{ task.results.length }} 条成果</template></small></div>
                          </li>
                        </ul>
                      </article>
                    </div>
                  </template>
                  <p v-else>保存这份快照时尚未生成行动计划。</p>
                </section>
              </template>

              <template v-else>
                <section class="detail-section"><h3>报告内容</h3><p v-if="typeof legacyContent.summary === 'string'">{{ legacyContent.summary }}</p><p v-else>这是旧版流程生成的历史报告，原始内容已保留。</p></section>
                <section v-if="Array.isArray(legacyContent.evidenceHighlights)" class="detail-section"><h3>能力证据</h3><ul><li v-for="item in legacyContent.evidenceHighlights" :key="String(item)">{{ item }}</li></ul></section>
                <section v-if="Array.isArray(legacyContent.risksAndAlternatives)" class="detail-section"><h3>风险与备选</h3><ul><li v-for="item in legacyContent.risksAndAlternatives" :key="String(item)">{{ item }}</li></ul></section>
              </template>
            </template>

            <template v-else-if="selectedResume">
              <section class="metric-band" aria-label="简历分析评分">
                <div><span>综合评分</span><strong>{{ selectedResume.score ?? '--' }}</strong></div>
                <div><span>ATS 评分</span><strong>{{ selectedResume.atsScore ?? '--' }}</strong></div>
                <div><span>关键词匹配</span><strong>{{ selectedResume.keywordMatch ?? '--' }}</strong></div>
              </section>
              <section class="detail-section"><h3>发现的问题</h3><ul v-if="selectedResume.issues.length"><li v-for="item in selectedResume.issues" :key="item">{{ item }}</li></ul><p v-else>没有记录明确问题。</p></section>
              <section class="detail-section"><h3>修改建议</h3><ul v-if="selectedResume.suggestions.length"><li v-for="item in selectedResume.suggestions" :key="item">{{ item }}</li></ul><p v-else>没有记录修改建议。</p></section>
              <section v-if="selectedResume.improvedFragments.length" class="detail-section"><h3>参考改写</h3><ul><li v-for="item in selectedResume.improvedFragments" :key="item">{{ item }}</li></ul></section>
            </template>

            <template v-else-if="selectedPathPlan">
              <section class="metric-band path-metrics" aria-label="旧路径计划进度">
                <div><span>目标方向</span><strong>{{ selectedPathPlan.targetRole || '未记录' }}</strong></div>
                <div><span>任务进度</span><strong>{{ selectedPathPlan.completedTaskCount }} / {{ selectedPathPlan.taskCount }}</strong></div>
                <div><span>完成比例</span><strong>{{ selectedPathPlan.progressPercent }}%</strong></div>
              </section>
              <section class="detail-section">
                <h3>阶段与任务</h3>
                <div class="milestone-list">
                  <article v-for="(milestone, index) in selectedPathPlan.milestones" :key="milestone.id" class="milestone-block">
                    <header><span>阶段 {{ index + 1 }} · {{ milestone.duration || '周期未记录' }}</span><strong>{{ milestone.title }}</strong></header>
                    <ul v-if="milestone.tasks.length" class="task-list"><li v-for="task in milestone.tasks" :key="task.id"><span :class="{ done: task.status === 'done' }">{{ task.status === 'done' ? '已完成' : '待完成' }}</span>{{ task.content }}</li></ul>
                    <div v-if="milestone.acceptance.length" class="acceptance"><strong>验收标准</strong><ul><li v-for="item in milestone.acceptance" :key="item">{{ item }}</li></ul></div>
                  </article>
                </div>
              </section>
            </template>
          </template>
          <div v-else class="empty-detail"><FileClock :size="28" /><span>当前筛选下没有可查看的记录。</span></div>
        </M3Card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-shell { max-width: 1180px; }
.record-count { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.history-filters { width: fit-content; max-width: 100%; margin-top: 20px; }
.history-filters span { display: inline-grid; min-width: 18px; height: 18px; place-items: center; border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-outline-variant); color: currentColor; font-size: var(--md-sys-typescale-label-small-size); }
.history-state { min-height: 260px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 9px; margin-top: 28px; padding: 30px; color: var(--md-sys-color-on-surface-variant); text-align: center; }
.history-layout { display: grid; grid-template-columns: 310px minmax(0, 1fr); gap: 20px; align-items: start; margin-top: 18px; }
.history-list { overflow: hidden; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-surface-container-low); }
.history-list > * { width: 100%; min-height: 72px; display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 10px; border-radius: var(--md-sys-shape-corner-none); border-bottom: 1px solid var(--md-sys-color-outline-variant); padding: 11px 13px; text-align: left; }
.history-list > *:last-of-type { border-bottom: 0; }
.history-list > .active { border-left: 3px solid var(--md-sys-color-primary); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); padding-left: 10px; }
.record-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); }
.record-copy { min-width: 0; display: grid; gap: 5px; }
.record-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--md-sys-typescale-body-medium-size); }
.record-copy small { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); line-height: 1.4; }
.empty-filter { margin: 0; padding: 30px 14px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); text-align: center; }
.history-detail { min-width: 0; min-height: 320px; padding: 24px; }
.empty-detail { display: flex; min-height: 270px; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: var(--md-sys-color-on-surface-variant); text-align: center; }
.detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.detail-header span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); font-weight: 500; }
.detail-header h2 { margin: 5px 0; font-size: var(--md-sys-typescale-title-large-size); }
.detail-header p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.danger-icon { color: var(--md-sys-color-error); }
.summary-band { display: grid; grid-template-columns: 80px 1fr; gap: 14px; padding: 20px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.summary-band strong { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); }
.summary-band p, .detail-section > p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.7; }
.detail-section { padding-top: 24px; }
.detail-section h3 { margin: 0 0 12px; font-size: var(--md-sys-typescale-title-medium-size); }
.target-band, .metric-band { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin-top: 22px; background: var(--md-sys-color-outline-variant); }
.target-band { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.snapshot-metrics strong { font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.45; }
.target-band > div, .metric-band > div { display: grid; gap: 7px; padding: 18px; background: var(--md-sys-color-surface-container); }
.target-band span, .metric-band span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }
.target-band strong, .metric-band strong { font-size: var(--md-sys-typescale-title-medium-size); overflow-wrap: anywhere; }
.target-band p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.snapshot-list, .evidence-table { display: grid; gap: 1px; background: var(--md-sys-color-outline-variant); }
.snapshot-list article, .evidence-table > div { padding: 15px 0; background: var(--md-sys-color-surface-container-lowest); }
.snapshot-list dl { display: grid; gap: 7px; margin: 10px 0 0; }
.snapshot-list dl div { display: grid; grid-template-columns: 64px 1fr; gap: 9px; font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.snapshot-list dt { color: var(--md-sys-color-on-surface-variant); }
.snapshot-list dd { margin: 0; }
.evidence-table > div { display: grid; gap: 5px; padding: 13px 0; }
.evidence-table span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.evidence-table p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.snapshot-plan-progress { display: flex; align-items: baseline; gap: 8px; margin: 12px 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.snapshot-plan-progress strong { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-title-medium-size); }
.snapshot-plan-weeks { display: grid; border-top: 1px solid var(--md-sys-color-outline-variant); }
.snapshot-plan-weeks > article { padding: 15px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.snapshot-plan-weeks header { display: grid; gap: 4px; }
.snapshot-plan-weeks header span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }
.snapshot-plan-weeks header strong { font-size: var(--md-sys-typescale-body-medium-size); }
.snapshot-plan-weeks ul { display: grid; gap: 8px; margin-top: 10px; padding-left: 0; list-style: none; }
.snapshot-plan-weeks li { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 8px; align-items: start; }
.snapshot-plan-weeks li > span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); font-weight: 500; }
.snapshot-plan-weeks li > div { display: grid; gap: 3px; }
.snapshot-plan-weeks li strong { font-size: var(--md-sys-typescale-body-small-size); }
.snapshot-plan-weeks li small { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); line-height: 1.5; }
.detail-section ul { margin: 0; padding-left: 18px; color: var(--md-sys-color-on-surface-variant); line-height: 1.7; }
.milestone-list { display: grid; }
.milestone-block { padding: 18px 0; border-top: 1px solid var(--md-sys-color-outline-variant); }
.milestone-block:first-child { border-top: 0; padding-top: 0; }
.milestone-block > header { display: grid; gap: 5px; }
.milestone-block > header span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }
.milestone-block > header strong { font-size: var(--md-sys-typescale-body-medium-size); }
.detail-section ul.task-list { display: grid; gap: 7px; margin-top: 12px; padding-left: 0; list-style: none; }
.task-list li { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 9px; align-items: start; }
.task-list li > span { color: var(--career-sys-color-warning); font-size: var(--md-sys-typescale-label-small-size); font-weight: 500; }
.task-list li > span.done { color: var(--career-sys-color-success); }
.acceptance { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; margin-top: 12px; font-size: var(--md-sys-typescale-body-small-size); }
.acceptance > strong { color: var(--md-sys-color-on-surface-variant); }
.acceptance ul { padding-left: 16px; }
@media (max-width: 860px) { .history-layout { grid-template-columns: 1fr; } .history-list { display: flex; overflow-x: auto; } .history-list > * { min-width: 260px; border-right: 1px solid var(--md-sys-color-outline-variant); border-bottom: 0; } .history-list > .active { border-left: 0; border-bottom: 3px solid var(--md-sys-color-primary); padding-left: 13px; } }
@media (max-width: 600px) { .history-detail { padding: 18px 14px; } .summary-band { grid-template-columns: 1fr; } .target-band, .metric-band { grid-template-columns: 1fr; } .acceptance { grid-template-columns: 1fr; } }
</style>
