<!--
  页面：我的报告 / 历史报告列表页（/reports）。
  职责：从后端拉取当前用户在 user_report_archive 表中的报告归档记录，
        左侧展示历史版本列表，右侧展示选中版本的概要、差距块和分阶段行动计划。
-->
<template>
  <div class="reports-page">
    <div class="page-container" v-loading="loadingList">
      <div class="header mb-6">
        <div class="title-row">
          <FileText :size="22" class="title-icon" />
          <h1 class="title">我的报告</h1>
        </div>
        <p class="text-sub">查看并管理你历史保存的职业规划报告</p>
      </div>

      <div v-if="!loadingList && archives.length === 0" class="empty card reports-empty">
        <div class="empty-title">还没有任何归档报告</div>
        <div class="text-sub mb-6">
          完成一轮测验并在报告页点击“保存归档”后，这里会出现你的历史报告。
        </div>
        <el-button type="primary" @click="goToReport">去生成我的第一份报告</el-button>
      </div>

      <div v-else class="layout">
        <aside class="list card">
          <div class="list-header">
            <div class="list-title">历史版本</div>
            <div class="list-sub">共 {{ archives.length }} 条</div>
          </div>
          <div v-if="archives.length === 0" class="list-empty text-sub">暂无数据</div>
          <div
            v-for="item in archives"
            :key="item.id"
            class="list-item"
            :class="{ active: item.id === selectedId }"
            @click="handleSelect(item)"
          >
            <div class="item-main">
              <div class="item-title">{{ item.title }}</div>
              <div class="item-meta">
                <span v-if="item.targetJobName" class="meta-tag">目标：{{ item.targetJobName }}</span>
              </div>
            </div>
            <div class="item-right">
              <div class="item-time">
                <Clock class="icon-clock" :size="14" />
                <span>{{ item.displayTime }}</span>
              </div>
              <ArrowRight :size="16" class="icon-arrow" />
            </div>
          </div>
        </aside>

        <main class="detail card" v-loading="loadingDetail">
          <div v-if="!selectedDetail" class="detail-empty text-sub">
            从左侧选择一条报告，可以在这里查看概要与行动计划。
          </div>
          <div v-else class="detail-body">
            <div class="detail-head">
              <div>
                <div class="detail-title">{{ selectedDetail.title }}</div>
                <div class="detail-meta text-sub">
                  <span>生成时间：{{ selectedDetail.createdAt }}</span>
                  <span v-if="selectedDetail.targetJob?.jobName">
                    ｜ 目标岗位：{{ selectedDetail.targetJob.jobName }}
                  </span>
                </div>
              </div>
            </div>

            <section class="sec">
              <div class="sec-title">A. 总览</div>
              <div class="sec-text">{{ selectedDetail.summary }}</div>
            </section>

            <section v-if="selectedDetail.gaps && selectedDetail.gaps.length" class="sec">
              <div class="sec-title">B. 差距与建议</div>
              <div class="gap-grid">
                <div v-for="g in selectedDetail.gaps" :key="g.label" class="gap card">
                  <div class="gap-title">{{ g.label }}</div>
                  <ul class="gap-list">
                    <li v-for="it in g.items" :key="it">{{ it }}</li>
                  </ul>
                </div>
              </div>
            </section>

            <section class="sec">
              <div class="sec-title">C. 分阶段行动计划</div>
              <div v-if="!selectedDetail.planStages || !selectedDetail.planStages.length" class="text-sub">
                该报告中暂未包含详细行动计划，可回到路径规划页完善后再次保存归档。
              </div>
              <div v-else class="plan-grid">
                <div v-for="s in selectedDetail.planStages" :key="s.id" class="plan-stage">
                  <div class="plan-name">{{ s.name }}</div>
                  <ul class="plan-list">
                    <li v-for="t in s.tasks" :key="t.id">
                      {{ t.done ? '已完成：' : '待完成：' }}{{ t.title }}
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <section class="sec">
              <div class="sec-title">D. 岗位匹配详析</div>
              <div class="sec-text">
                {{ selectedDetail.matchAnalysis || '该报告未提供岗位匹配详析内容。' }}
              </div>
            </section>

            <section class="sec">
              <div class="sec-title">E. 能力证据与亮点</div>
              <div v-if="!selectedDetail.evidenceHighlights.length" class="text-sub">暂无相关内容。</div>
              <ul v-else class="gap-list">
                <li v-for="it in selectedDetail.evidenceHighlights" :key="it">{{ it }}</li>
              </ul>
            </section>

            <section class="sec">
              <div class="sec-title">F. 技能提升路径</div>
              <div v-if="!selectedDetail.skillPath.length" class="text-sub">暂无相关内容。</div>
              <ul v-else class="gap-list">
                <li v-for="it in selectedDetail.skillPath" :key="it">{{ it }}</li>
              </ul>
            </section>

            <section class="sec">
              <div class="sec-title">G. 90天行动清单</div>
              <div v-if="!selectedDetail.action90Days.length" class="text-sub">暂无相关内容。</div>
              <ul v-else class="gap-list">
                <li v-for="it in selectedDetail.action90Days" :key="it">{{ it }}</li>
              </ul>
            </section>

            <section class="sec">
              <div class="sec-title">H. 风险与备选路径</div>
              <div v-if="!selectedDetail.risksAndAlternatives.length" class="text-sub">暂无相关内容。</div>
              <ul v-else class="gap-list">
                <li v-for="it in selectedDetail.risksAndAlternatives" :key="it">{{ it }}</li>
              </ul>
            </section>

            <section class="sec">
              <div class="sec-title">I. 简历与面试策略</div>
              <div v-if="!selectedDetail.resumeInterviewStrategies.length" class="text-sub">暂无相关内容。</div>
              <ul v-else class="gap-list">
                <li v-for="it in selectedDetail.resumeInterviewStrategies" :key="it">{{ it }}</li>
              </ul>
            </section>

          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { FileText, Clock, ArrowRight } from 'lucide-vue-next'
import { getReportArchiveDetailApi, listReportArchivesApi, type ReportArchiveRecord } from '@/api/report'

interface ArchiveListItem {
  id: number
  title: string
  displayTime: string
  targetJobName?: string
  raw: ReportArchiveRecord
}

interface PlanTask {
  id: string
  title: string
  done: boolean
}

interface PlanStage {
  id: string
  name: string
  tasks: PlanTask[]
}

interface TargetJobLite {
  jobName?: string
  companyName?: string
  city?: string
  salary?: string
}

interface GapBlock {
  label: string
  items: string[]
}

interface ReportDetailView {
  id: number
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


const router = useRouter()

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }
  return []
}


const loadingList = ref(false)
const loadingDetail = ref(false)
const archives = ref<ArchiveListItem[]>([])
const selectedId = ref<number | null>(null)
const selectedDetail = ref<ReportDetailView | null>(null)

const goToReport = () => {
  router.push('/report')
}

const parseArchiveToListItem = (item: ReportArchiveRecord): ArchiveListItem => {
  let createdAt = item.createTime || ''
  let title = item.title || '职业规划报告'
  let targetJobName: string | undefined

  try {
    const parsed = item.reportJson ? JSON.parse(item.reportJson) : {}
    const meta = (parsed as any).meta || {}
    const targetJob = (parsed as any).targetJob || {}
    createdAt = meta.createdAt || createdAt
    title = meta.title || title
    targetJobName = targetJob.jobName || meta.targetJobName
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
    let parsed: any = {}
    try {
      parsed = record.reportJson ? JSON.parse(record.reportJson) : {}
    } catch {
      parsed = {}
    }
    const meta = parsed.meta || {}
    const targetJob = parsed.targetJob || {}
    const content = parsed.content || {}
    const plan = parsed.plan || {}

    const createdAt = meta.createdAt || record.createTime || ''
    const summary: string =
      content.summary ||
      `你的目标岗位为「${targetJob.jobName || '未指定'}」，系统已根据当时的录入信息生成了一份职业规划建议。`

    const gaps: GapBlock[] = Array.isArray(content.gaps) ? content.gaps : []

    const rawStages = Array.isArray(content.planStages)
      ? content.planStages
      : Array.isArray(plan.stages)
        ? plan.stages
        : []

    const planStages: PlanStage[] = rawStages.map((s: any, idx: number) => {
      const name = typeof s?.name === 'string' && s.name.trim() ? s.name.trim() : `阶段${idx + 1}`
      const rawTasks = Array.isArray(s?.tasks) ? s.tasks : []
      const tasks: PlanTask[] = rawTasks
        .map((t: any, tIdx: number) => {
          if (t && typeof t === 'object') {
            return {
              id: String(t.id ?? `task-${idx}-${tIdx}`),
              title: String(t.title ?? '').trim(),
              done: !!t.done
            }
          }
          return {
            id: `task-${idx}-${tIdx}`,
            title: String(t).trim(),
            done: false
          }
        })
        .filter((t: any) => t.title)

      return {
        id: String(s?.id ?? `stage-${idx}`),
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
      title: meta.title || record.title || '职业规划报告',
      createdAt: createdAt ? new Date(createdAt).toLocaleString() : '',
      targetJob: {
        jobName: targetJob.jobName,
        companyName: targetJob.companyName,
        city: targetJob.city,
        salary: targetJob.salary
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
</script>

<style scoped>
.reports-page {
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

.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.list {
  padding: 16px;
  border-radius: var(--clay-radius-card);
}

.list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.list-title {
  font-weight: 900;
}

.list-sub {
  font-size: 12px;
  color: var(--clay-text-subtle);
}

.list-empty {
  padding: 12px 0;
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease, box-shadow 0.15s ease;
}

.list-item:hover {
  background: #f5efe2;
  transform: translateY(-1px);
}

.list-item.active {
  background: #fef6e7;
  box-shadow: 0 0 0 1px var(--clay-border-subtle);
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 4px;
}

.item-meta {
  font-size: 12px;
  color: #64748b;
}

.meta-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f5efe2;
}

.item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin-left: 10px;
}

.item-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #a8a29e;
}

.icon-clock {
  color: #a8a29e;
}

.icon-arrow {
  color: #d6c8b3;
}

.detail {
  padding: 18px;
  border-radius: var(--clay-radius-card);
  min-width: 0;
}

.detail-empty {
  padding: 40px 0;
  text-align: center;
}

.detail-title {
  font-size: 20px;
  font-weight: 900;
  margin-bottom: 4px;
}

.detail-meta {
  font-size: 13px;
}

.sec {
  margin-top: 18px;
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

.reports-empty {
  position: relative;
  overflow: hidden;
}

.reports-empty::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 160% at 0% 0%, rgba(248, 204, 101, 0.24) 0%, rgba(248, 204, 101, 0) 55%),
    radial-gradient(140% 180% at 100% 0%, rgba(193, 176, 255, 0.22) 0%, rgba(193, 176, 255, 0) 60%);
  opacity: 1;
  pointer-events: none;
}

.reports-empty > * {
  position: relative;
}

@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .list {
    position: static;
  }

  .gap-grid {
    grid-template-columns: 1fr;
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }
}
</style>
