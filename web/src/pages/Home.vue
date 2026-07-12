<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  CheckCircle2,
  CircleDot,
  Clock3,
  Compass,
  FolderKanban,
  FileText,
  PencilLine,
  RefreshCw,
  Sparkles,
  Target,
  TriangleAlert
} from 'lucide-vue-next'
import { getDashboardApi, type DashboardData } from '@/api/dashboard'
import type { TaskStatus } from '@/api/actionPlans'
import { getStoredUser } from '@/utils/session'

defineOptions({ name: 'DashboardPage' })

const router = useRouter()
const loading = ref(true)
const error = ref('')
const dashboard = ref<DashboardData | null>(null)
const userName = getStoredUser()?.username || '同学'

const stateContent: Record<DashboardData['state'], { eyebrow: string; title: string; description: string }> = {
  new_user: {
    eyebrow: '先认识你',
    title: '完成基础档案',
    description: '用几分钟记录专业、困惑和可投入时间，后续建议会以这些事实为边界。'
  },
  ready_to_explore: {
    eyebrow: '建立第一个问题',
    title: '开始一次职业决策',
    description: '把正在纠结的问题建成项目，再逐步补充候选方向和真实岗位证据。'
  },
  exploring: {
    eyebrow: '决策进行中',
    title: '继续验证当前选择',
    description: '回到项目补齐候选、比较依据和验证动作，证据足够后再确认目标。'
  },
  decided: {
    eyebrow: '目标已确认',
    title: '把结论变成行动',
    description: '基于主目标生成一份可编辑的四周计划，从最小的验证任务开始。'
  },
  executing: {
    eyebrow: '计划执行中',
    title: '完成今天最重要的任务',
    description: '聚焦当前周的任务，完成后留下成果说明或可验证链接。'
  },
  review_due: {
    eyebrow: '本周待复盘',
    title: '用结果修正下一周',
    description: '整理本周成果、阻碍和信心变化，再决定哪些任务需要调整。'
  }
}

const currentContent = computed(() => dashboard.value ? stateContent[dashboard.value.state] : null)
const currentProject = computed(() => dashboard.value?.currentProject)
const today = computed(() => dashboard.value?.today)
const risk = computed(() => dashboard.value?.executionRisk)
const completionPercent = computed(() => {
  if (!today.value?.totalThisWeek) return 0
  return Math.round(today.value.completedThisWeek / today.value.totalThisWeek * 100)
})

const statusLabels: Record<TaskStatus, string> = {
  todo: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  deferred: '已延期',
  skipped: '已跳过'
}

const loadDashboard = async () => {
  loading.value = true
  error.value = ''
  try {
    dashboard.value = await getDashboardApi()
  } catch {
    error.value = '工作台暂时无法加载，请检查后端服务后重试。'
  } finally {
    loading.value = false
  }
}

const goPrimaryAction = () => {
  if (dashboard.value?.primaryActionPath) router.push(dashboard.value.primaryActionPath)
}

onMounted(loadDashboard)
</script>

<template>
  <div class="product-page dashboard-page">
    <div class="product-shell dashboard-shell">
      <header class="dashboard-header">
        <div>
          <span class="date-label">{{ new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()) }}</span>
          <h1>{{ userName }}，今天从这里继续</h1>
        </div>
        <span v-if="dashboard" class="sync-label"><CircleDot :size="14" />已同步</span>
      </header>

      <M3Card tag="div" v-if="loading" class="loading-state">正在整理你的当前进度...</M3Card>

      <M3Card tag="section" v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <M3Button variant="outlined" type="button" @click="loadDashboard"><RefreshCw :size="17" />重新加载</M3Button>
      </M3Card>

      <template v-else-if="dashboard && currentContent">
        <M3Card tag="section" class="primary-next">
          <div class="next-icon" aria-hidden="true">
            <CheckCircle2 v-if="dashboard.state === 'review_due'" :size="25" />
            <CalendarCheck2 v-else-if="dashboard.state === 'executing'" :size="25" />
            <Target v-else-if="dashboard.state === 'decided'" :size="25" />
            <Compass v-else-if="dashboard.state === 'new_user'" :size="25" />
            <FolderKanban v-else :size="25" />
          </div>
          <div class="next-copy">
            <span>{{ currentContent.eyebrow }}</span>
            <h2>{{ currentContent.title }}</h2>
            <p>{{ currentContent.description }}</p>
          </div>
          <M3Button class="primary-command" type="button" @click="goPrimaryAction">
            {{ dashboard.primaryActionLabel }}<ArrowRight :size="18" />
          </M3Button>
        </M3Card>

        <nav v-if="dashboard.state === 'new_user'" class="secondary-entry" aria-label="档案补充入口">
          <span>{{ dashboard.profile?.major || dashboard.profile?.grade ? `已记录：${[dashboard.profile?.major, dashboard.profile?.grade].filter(Boolean).join(' · ')}` : '也可以先补充已有材料：' }}</span>
          <router-link to="/profile?section=resume"><FileText :size="15" />粘贴简历文本</router-link>
          <router-link to="/profile?section=experience"><PencilLine :size="15" />手动填写经历</router-link>
        </nav>

        <div class="dashboard-grid">
          <section class="dashboard-section">
            <div class="section-heading">
              <div><BriefcaseBusiness :size="18" /><h2>当前决策</h2></div>
              <span v-if="currentProject">{{ currentProject.candidateCount }} 个候选</span>
            </div>
            <M3Card tag="div" v-if="currentProject" class="project-summary">
              <span class="stage-label">{{ currentProject.currentStage }}</span>
              <h3>{{ currentProject.title }}</h3>
              <p>{{ currentProject.question }}</p>
              <dl>
                <div><dt>主目标</dt><dd>{{ currentProject.primaryTarget || '尚未确认' }}</dd></div>
                <div><dt>岗位样本</dt><dd>{{ currentProject.jobSampleCount }} 个</dd></div>
                <div><dt>待验证</dt><dd>{{ currentProject.openQuestionCount || 0 }} 项</dd></div>
                <div><dt>成果证据</dt><dd>{{ currentProject.resultCount || 0 }} 个</dd></div>
              </dl>
              <div v-if="dashboard.latestAgentAdvice" class="agent-note"><Sparkles :size="15" /><div><strong>最近 AI 建议</strong><p>{{ dashboard.latestAgentAdvice.conclusion }}</p></div></div>
            </M3Card>
            <M3Card tag="div" v-else class="quiet-empty">还没有进行中的决策项目</M3Card>
          </section>

          <section class="dashboard-section">
            <div class="section-heading">
              <div><Clock3 :size="18" /><h2>本周行动</h2></div>
              <span v-if="today?.planId">{{ today.completedThisWeek }} / {{ today.totalThisWeek }}</span>
            </div>
            <M3Card tag="div" v-if="today?.planId" class="week-summary">
              <div class="progress-row">
                <div><strong>第 {{ today.weekNo }} 周</strong><span>{{ today.targetRole }}</span></div>
                <strong>{{ completionPercent }}%</strong>
              </div>
              <M3LinearProgress class="progress-track" :value="completionPercent / 100" label="本周任务完成进度" />
              <ul v-if="today.tasks.length" class="task-preview">
                <li v-for="task in today.tasks.slice(0, 4)" :key="task.id">
                  <span :class="['task-dot', task.status]"></span>
                  <span>{{ task.title }}</span>
                  <small>{{ statusLabels[task.status] }}</small>
                </li>
              </ul>
              <p v-else class="week-complete">本周任务已经处理完，可以进入复盘。</p>
              <nav class="action-shortcuts"><router-link :to="`/action-plans/${today.planId}`">完整计划</router-link><router-link :to="`/weekly-reviews/new?planId=${today.planId}&weekNo=${today.weekNo}`">本周复盘</router-link></nav>
            </M3Card>
            <M3Card tag="div" v-else class="quiet-empty">确认职业目标后会在这里显示行动进度</M3Card>
          </section>
        </div>

        <section v-if="risk && (risk.overdueTaskCount || risk.deferredTaskCount || risk.completedWithoutEvidenceCount)" class="risk-strip">
          <div class="risk-title"><TriangleAlert :size="18" /><strong>执行提醒</strong><span>这些事项值得在下一步处理中顺手确认</span></div>
          <ul>
            <li v-if="risk.overdueTaskCount">{{ risk.overdueTaskCount }} 项任务已超过截止时间</li>
            <li v-if="risk.deferredTaskCount">{{ risk.deferredTaskCount }} 项任务处于延期状态</li>
            <li v-if="risk.completedWithoutEvidenceCount">{{ risk.completedWithoutEvidenceCount }} 项已完成任务还没有成果说明</li>
          </ul>
          <router-link to="/action-plans">查看行动计划</router-link>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dashboard-shell { max-width: 1120px; }
.dashboard-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.dashboard-header h1 { margin: 5px 0 0; font-size: var(--md-sys-typescale-headline-medium-size); line-height: 1.25; }
.date-label, .sync-label { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.sync-label { display: inline-flex; align-items: center; gap: 6px; color: var(--career-sys-color-success); }
.loading-state, .error-state { margin-top: 28px; padding: 34px; color: var(--md-sys-color-on-surface-variant); }
.error-state { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.error-state p { margin: 0; }
.primary-next { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; align-items: center; gap: 20px; margin-top: 28px; padding: 26px; border-left: 4px solid var(--md-sys-color-primary); }
.next-icon { width: 52px; height: 52px; display: grid; place-items: center; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); }
.next-copy > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }
.next-copy h2 { margin: 5px 0 7px; font-size: var(--md-sys-typescale-title-large-size); }
.next-copy p { max-width: 650px; margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
.primary-command { min-width: 172px; }
.secondary-entry { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; margin-top: 12px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.secondary-entry a { display: inline-flex; align-items: center; gap: 5px; color: var(--md-sys-color-primary); text-decoration: none; }
.dashboard-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; margin-top: 34px; }
.dashboard-section { min-width: 0; }
.section-heading, .section-heading > div { display: flex; align-items: center; justify-content: space-between; gap: 9px; }
.section-heading { margin-bottom: 12px; }
.section-heading h2 { margin: 0; font-size: var(--md-sys-typescale-title-medium-size); }
.section-heading svg { color: var(--md-sys-color-primary); }
.section-heading > span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.project-summary, .week-summary { min-height: 246px; padding: 22px; }
.stage-label { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); font-weight: 500; }
.project-summary h3 { margin: 8px 0; font-size: var(--md-sys-typescale-title-large-size); }
.project-summary > p { min-height: 48px; margin: 0 0 20px; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.project-summary dl { display: grid; gap: 1px; margin: 0; background: var(--md-sys-color-outline-variant); }
.project-summary dl div { display: grid; grid-template-columns: 80px 1fr; gap: 12px; padding: 10px 0; background: var(--md-sys-color-surface-container-lowest); font-size: var(--md-sys-typescale-body-medium-size); }
.project-summary dt { color: var(--md-sys-color-on-surface-variant); }
.project-summary dd { margin: 0; font-weight: 500; }
.agent-note { display: flex; align-items: flex-start; gap: 8px; margin-top: 15px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 12px; color: var(--md-sys-color-primary); }
.agent-note div { min-width: 0; }
.agent-note strong { font-size: var(--md-sys-typescale-label-small-size); }
.agent-note p { display: -webkit-box; overflow: hidden; margin: 3px 0 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.progress-row { display: flex; justify-content: space-between; gap: 16px; }
.progress-row div { display: grid; gap: 4px; }
.progress-row div span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.progress-track { margin: 16px 0 18px; }
.task-preview { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.task-preview li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-height: 35px; border-top: 1px solid var(--md-sys-color-outline-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.task-preview small { color: var(--md-sys-color-on-surface-variant); }
.task-dot { width: 7px; height: 7px; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-outline-variant); }
.task-dot.in_progress { background: var(--career-sys-color-info); }
.task-dot.completed { background: var(--career-sys-color-success); }
.task-dot.deferred, .task-dot.skipped { background: var(--md-sys-color-tertiary); }
.week-complete { margin: 28px 0 0; color: var(--career-sys-color-success); }
.action-shortcuts { display: flex; justify-content: flex-end; gap: 14px; margin-top: 13px; }
.action-shortcuts a { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); text-decoration: none; }
.quiet-empty { min-height: 246px; display: grid; place-items: center; padding: 28px; color: var(--md-sys-color-on-surface-variant); text-align: center; }
.risk-strip { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 18px; margin-top: 28px; border-left: 3px solid var(--md-sys-color-tertiary); background: color-mix(in srgb, var(--md-sys-color-tertiary) 8%, var(--md-sys-color-surface-container-lowest)); padding: 15px 17px; }
.risk-title { display: flex; align-items: center; gap: 8px; color: var(--md-sys-color-tertiary); }
.risk-title span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); font-weight: 400; }
.risk-strip ul { grid-column: 1; display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0; padding-left: 20px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.risk-strip > a { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); text-decoration: none; white-space: nowrap; }
@media (max-width: 820px) { .primary-next { grid-template-columns: 48px 1fr; } .primary-command { grid-column: 1 / -1; width: 100%; } .dashboard-grid { grid-template-columns: 1fr; } .risk-strip { grid-template-columns: 1fr; } .risk-strip ul, .risk-strip > a { grid-column: auto; grid-row: auto; } }
@media (max-width: 560px) { .dashboard-header { align-items: flex-start; flex-direction: column; } .dashboard-header h1 { font-size: var(--md-sys-typescale-headline-small-size); } .primary-next { grid-template-columns: 1fr; padding: 20px; } .primary-command { grid-column: auto; } .error-state { align-items: stretch; flex-direction: column; } }
</style>
