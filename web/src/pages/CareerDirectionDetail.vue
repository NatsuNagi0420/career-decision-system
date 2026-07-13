<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, Bookmark, BookmarkCheck, BriefcaseBusiness, CalendarClock, CheckCircle2,
  ChevronRight, CircleHelp, Gauge, MapPin, Plus, Route, Sparkles, Target, TriangleAlert
} from 'lucide-vue-next'
import CareerVisual from '@/components/CareerVisual.vue'
import { getCareerAsset, type CareerExperienceTask } from '@/content/careerAssets'
import { m3Message } from '@/design-system/services/feedback'
import { favoriteCareerDirectionApi, getCareerDirectionApi, unfavoriteCareerDirectionApi, type CareerDirection } from '@/api/careerDirections'
import { listJobsApi, type JobInfo } from '@/api/jobs'
import { listPersonalEvidenceApi, type PersonalEvidence } from '@/api/personalEvidence'
import { addActionTaskApi, listActionPlansApi, type ActionPlanSummary } from '@/api/actionPlans'
import { aggregateJobs, careerJobSearchTerms, matchEvidence } from '@/utils/careerInsights'

defineOptions({ name: 'CareerDirectionDetailPage' })

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const direction = ref<CareerDirection | null>(null)
const jobs = ref<JobInfo[]>([])
const evidence = ref<PersonalEvidence[]>([])
const plans = ref<ActionPlanSummary[]>([])
const addingTaskId = ref<string | null>(null)

const asset = computed(() => getCareerAsset(direction.value?.category))
const aggregate = computed(() => aggregateJobs(jobs.value))
const requirements = computed(() => Array.from(new Set([
  ...(direction.value?.commonSkills || []),
  ...aggregate.value.topSkills.map((item) => item.label)
])).slice(0, 16))
const evidenceMatches = computed(() => matchEvidence(requirements.value, evidence.value))
const matchedCount = computed(() => evidenceMatches.value.filter((item) => item.confidence !== 'missing').length)
const activePlan = computed(() => plans.value.find((plan) => plan.status === 'active') || plans.value[0] || null)

function formatSalary(value: number | null) {
  return value == null ? '未知' : value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
}

function formatDate(value: string | null) {
  if (!value) return '未提供'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
    : value
}

async function load() {
  loading.value = true
  try {
    const current = await getCareerDirectionApi(Number(route.params.id))
    direction.value = current
    const searchTerms = careerJobSearchTerms(current.name, current.commonSkills)
    const [jobResults, evidenceRows, planRows] = await Promise.all([
      Promise.all(searchTerms.map((keyword) => listJobsApi({ keyword, page: 1, pageSize: 50 }))),
      listPersonalEvidenceApi(),
      listActionPlansApi()
    ])
    jobs.value = Array.from(
      new Map(jobResults.flatMap((result) => result.list).map((job) => [job.id, job])).values()
    )
    evidence.value = evidenceRows
    plans.value = planRows
  } catch {
    m3Message.error('职业方向加载失败，请返回后重试')
    await router.replace('/explore')
  } finally {
    loading.value = false
  }
}

async function toggleFavorite() {
  if (!direction.value) return
  direction.value = direction.value.favorite
    ? await unfavoriteCareerDirectionApi(direction.value.id)
    : await favoriteCareerDirectionApi(direction.value.id)
}

async function addExperienceTask(task: CareerExperienceTask) {
  if (!activePlan.value) {
    m3Message.warning('请先确认职业目标并生成行动计划')
    await router.push('/action-plans')
    return
  }
  addingTaskId.value = task.id
  try {
    await addActionTaskApi(activePlan.value.id, {
      weekNo: 1,
      title: task.title,
      taskType: task.taskType,
      content: task.content,
      estimatedMinutes: task.duration.includes('小时') ? 180 : 75,
      acceptanceCriteria: task.deliverable
    })
    m3Message.success('体验任务已加入当前行动计划')
  } finally {
    addingTaskId.value = null
  }
}

function openJob(job: JobInfo) {
  router.push({ path: '/explore', query: { tab: 'jobs', jobId: String(job.id) } })
}

function addDirectionToProject() {
  if (direction.value) router.push({ path: '/explore', query: { directionId: String(direction.value.id), action: 'add' } })
}

onMounted(load)
</script>

<template>
  <div class="product-page">
    <div v-if="direction" class="product-shell direction-detail-shell">
      <nav class="back-row" aria-label="面包屑">
        <M3Button variant="text" type="button" @click="router.push('/explore')"><ArrowLeft :size="17" />职业探索</M3Button>
        <span>/</span><span>{{ direction.name }}</span>
      </nav>

      <header class="direction-hero">
        <div class="hero-copy">
          <span class="eyebrow">{{ asset.eyebrow }} · {{ direction.category }}</span>
          <h1>{{ direction.name }}</h1>
          <p class="hero-summary">{{ direction.summary }}</p>
          <p class="hero-scene">{{ asset.scene }}</p>
          <div class="hero-actions">
            <M3Button type="button" @click="addDirectionToProject"><Plus :size="17" />加入决策项目</M3Button>
            <M3Button variant="outlined" type="button" @click="toggleFavorite">
              <BookmarkCheck v-if="direction.favorite" :size="17" /><Bookmark v-else :size="17" />{{ direction.favorite ? '已收藏' : '收藏方向' }}
            </M3Button>
          </div>
        </div>
        <CareerVisual :visual="asset.visual" :label="direction.name" />
      </header>

      <section class="insight-band" aria-label="真实岗位样本概览">
        <div><BriefcaseBusiness :size="19" /><span>相关岗位样本</span><strong>{{ aggregate.sampleCount }}</strong></div>
        <div><Gauge :size="19" /><span>结构化技能</span><strong>{{ aggregate.topSkills.length }}</strong></div>
        <div><Target :size="19" /><span>已有证据覆盖</span><strong>{{ matchedCount }} / {{ requirements.length }}</strong></div>
        <div><CalendarClock :size="19" /><span>最近数据更新</span><strong>{{ formatDate(aggregate.latestSourceAt) }}</strong></div>
      </section>

      <main class="detail-grid">
        <div class="detail-main">
          <section class="content-section">
            <header><div><h2>这份工作通常做什么</h2><p>来自职业目录的结构化说明，用真实岗位继续核验。</p></div></header>
            <div class="numbered-list"><article v-for="(item, index) in direction.typicalWork" :key="item"><span>{{ index + 1 }}</span><p>{{ item }}</p></article></div>
          </section>

          <section class="content-section">
            <header><div><h2>常见产出物</h2><p>判断自己是否喜欢一个职业，先看它需要长期交付什么。</p></div></header>
            <div class="outcome-grid"><article v-for="item in asset.outcomes" :key="item"><CheckCircle2 :size="18" /><strong>{{ item }}</strong></article></div>
          </section>

          <section class="content-section">
            <header><div><h2>真实岗位聚合</h2><p>基于当前数据库中与“{{ direction.name }}”匹配的 {{ aggregate.sampleCount }} 个有效岗位样本。</p></div></header>
            <div v-if="aggregate.sampleCount" class="aggregate-grid">
              <article class="aggregate-block skill-block">
                <h3>高频技能与标签</h3>
                <div v-if="aggregate.topSkills.length" class="frequency-list">
                  <div v-for="item in aggregate.topSkills" :key="item.label"><span>{{ item.label }}</span><div><i :style="{ width: `${Math.max(item.ratio, 6)}%` }"></i></div><strong>{{ item.count }} 个</strong></div>
                </div>
                <p v-else>相关岗位尚未提供足够的结构化技能标签。</p>
              </article>
              <article class="aggregate-block"><h3>城市分布</h3><ul><li v-for="item in aggregate.cities" :key="item.label"><span>{{ item.label }}</span><strong>{{ item.count }} 个</strong></li></ul></article>
              <article class="aggregate-block"><h3>经验要求</h3><ul><li v-for="item in aggregate.experienceLevels" :key="item.label"><span>{{ item.label }}</span><strong>{{ item.count }} 个</strong></li></ul></article>
              <article class="aggregate-block"><h3>学历要求</h3><ul><li v-for="item in aggregate.educationLevels" :key="item.label"><span>{{ item.label }}</span><strong>{{ item.count }} 个</strong></li></ul></article>
              <article class="aggregate-block salary-block"><h3>薪资样本范围</h3><strong>{{ formatSalary(aggregate.salaryMin) }} - {{ formatSalary(aggregate.salaryMax) }}</strong><p>{{ aggregate.salarySampleCount }} 个岗位提供结构化薪资；仅表示样本范围，不代表市场平均值。</p></article>
            </div>
            <div v-else class="empty-insight"><CircleHelp :size="22" /><div><strong>暂时没有匹配样本</strong><p>这不代表市场没有该岗位，可在招聘岗位中使用技能或相近名称继续搜索。</p></div></div>
          </section>

          <section class="content-section">
            <header><div><h2>我的证据与岗位要求</h2><p>匹配只引用已经记录的项目、课程、实习和成果，不把关键词命中当作能力证明。</p></div><M3Button variant="text" href="/profile">管理个人证据<ChevronRight :size="16" /></M3Button></header>
            <div class="evidence-table">
              <article v-for="item in evidenceMatches" :key="item.requirement" :class="`match-${item.confidence}`">
                <div><span>{{ item.requirement }}</span><small>{{ item.confidence === 'direct' ? '直接命中' : item.confidence === 'related' ? '相关证据' : '缺少证据' }}</small></div>
                <p v-if="item.evidence">{{ item.evidence.title }}<template v-if="item.evidence.resultSummary"> · {{ item.evidence.resultSummary }}</template></p>
                <p v-else>暂未找到能够支持这项要求的个人证据。</p>
              </article>
            </div>
          </section>

          <section class="content-section">
            <header><div><h2>职业体验任务</h2><p>先完成低成本产出，再决定是否长期投入。</p></div></header>
            <div class="task-list">
              <article v-for="task in asset.experienceTasks" :key="task.id">
                <div class="task-index"><Sparkles :size="19" /></div>
                <div><span>{{ task.duration }}</span><h3>{{ task.title }}</h3><p>{{ task.content }}</p><small>完成标准：{{ task.deliverable }}</small></div>
                <M3Button variant="outlined" type="button" :disabled="addingTaskId === task.id" @click="addExperienceTask(task)"><Plus :size="16" />加入计划</M3Button>
              </article>
            </div>
          </section>

          <section class="content-section">
            <header><div><h2>相关真实岗位</h2><p>选择具体样本查看职责、来源并进行简历 JD 对照。</p></div></header>
            <div class="related-jobs">
              <M3Button v-for="job in jobs.slice(0, 6)" :key="job.id" class="related-job" variant="text" type="button" @click="openJob(job)">
                <div><strong>{{ job.jobName }}</strong><span>{{ job.companyName }}</span></div><span><MapPin :size="14" />{{ job.location || '地点未知' }}</span><ChevronRight :size="17" />
              </M3Button>
            </div>
          </section>
        </div>

        <aside class="detail-aside">
          <M3Card tag="section"><h2>常见能力</h2><div class="tag-row"><span v-for="item in direction.commonSkills" :key="item">{{ item }}</span></div></M3Card>
          <M3Card tag="section"><h2><Route :size="18" />成长路径</h2><ol><li v-for="item in direction.growthPath" :key="item">{{ item }}</li></ol></M3Card>
          <M3Card tag="section" class="warning-card"><h2><TriangleAlert :size="18" />常见误区</h2><ul><li v-for="item in direction.misconceptions" :key="item">{{ item }}</li></ul></M3Card>
          <M3Card tag="section"><h2>继续思考</h2><ul><li v-for="item in asset.starterQuestions" :key="item">{{ item }}</li></ul></M3Card>
        </aside>
      </main>
    </div>
    <div v-else class="product-shell loading-page"><M3CircularProgress v-if="loading" indeterminate label="正在加载职业方向" /></div>
  </div>
</template>

<style scoped>
.direction-detail-shell { max-width: 1280px; }
.back-row, .hero-actions { display: flex; align-items: center; gap: 10px; }
.back-row { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.direction-hero { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(320px, .7fr); gap: 42px; align-items: stretch; margin-top: 22px; padding-bottom: 32px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.hero-copy { display: flex; justify-content: center; flex-direction: column; align-items: flex-start; }
.eyebrow { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-large-size); font-weight: 600; }
.hero-copy h1 { margin: 10px 0; font-size: var(--md-sys-typescale-display-small-size); line-height: var(--md-sys-typescale-display-small-line-height); letter-spacing: 0; }
.hero-summary { max-width: 760px; margin: 0; font-size: var(--md-sys-typescale-title-medium-size); line-height: 1.6; }
.hero-scene { max-width: 720px; margin: 15px 0 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.65; }
.hero-actions { flex-wrap: wrap; margin-top: 24px; }
.insight-band { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 36px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.insight-band > div { display: grid; grid-template-columns: auto 1fr; gap: 6px 9px; padding: 18px 20px; border-right: 1px solid var(--md-sys-color-outline-variant); }
.insight-band > div:last-child { border-right: 0; }
.insight-band svg { grid-row: 1 / 3; color: var(--md-sys-color-primary); }
.insight-band span, .task-list span, .task-list small { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.insight-band strong { overflow-wrap: anywhere; font-size: var(--md-sys-typescale-title-medium-size); }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 42px; align-items: start; }
.detail-main { min-width: 0; }
.content-section { padding-bottom: 38px; margin-bottom: 38px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.content-section > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
.content-section h2, .detail-aside h2 { margin: 0; font-size: var(--md-sys-typescale-title-large-size); }
.content-section header p { margin: 6px 0 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.numbered-list, .evidence-table, .task-list, .related-jobs { display: grid; gap: 1px; background: var(--md-sys-color-outline-variant); }
.numbered-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.numbered-list article { display: grid; grid-template-columns: 32px 1fr; gap: 10px; padding: 18px; background: var(--md-sys-color-surface-container-lowest); }
.numbered-list article > span { display: grid; width: 28px; height: 28px; place-items: center; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.numbered-list p { margin: 3px 0 0; line-height: 1.55; }
.outcome-grid, .aggregate-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.outcome-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.outcome-grid article, .aggregate-block { padding: 16px; background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-small); }
.outcome-grid article { display: flex; gap: 10px; min-height: 78px; line-height: 1.45; }
.outcome-grid svg { flex: none; color: var(--career-sys-color-success); }
.aggregate-block h3 { margin: 0 0 14px; font-size: var(--md-sys-typescale-title-small-size); }
.aggregate-block ul { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.aggregate-block li { display: flex; justify-content: space-between; gap: 12px; color: var(--md-sys-color-on-surface-variant); }
.skill-block { grid-column: 1 / -1; }
.frequency-list { display: grid; gap: 10px; }
.frequency-list > div { display: grid; grid-template-columns: minmax(90px, 160px) minmax(80px, 1fr) 50px; align-items: center; gap: 10px; font-size: var(--md-sys-typescale-body-small-size); }
.frequency-list > div > div { height: 7px; overflow: hidden; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container-highest); }
.frequency-list i { display: block; height: 100%; border-radius: inherit; background: var(--md-sys-color-primary); }
.frequency-list strong { text-align: right; }
.salary-block > strong { display: block; color: var(--md-sys-color-tertiary); font-size: var(--md-sys-typescale-headline-small-size); }
.aggregate-block p, .empty-insight p { margin: 8px 0 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.empty-insight { display: flex; gap: 12px; padding: 18px; background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-small); }
.evidence-table article { display: grid; grid-template-columns: minmax(180px, .75fr) minmax(0, 1.25fr); gap: 18px; padding: 14px 16px; background: var(--md-sys-color-surface-container-lowest); border-left: 3px solid var(--md-sys-color-outline); }
.evidence-table article.match-direct { border-left-color: var(--career-sys-color-success); }
.evidence-table article.match-related { border-left-color: var(--md-sys-color-tertiary); }
.evidence-table article.match-missing { border-left-color: var(--md-sys-color-error); }
.evidence-table article > div { display: grid; gap: 3px; }
.evidence-table small, .evidence-table p { color: var(--md-sys-color-on-surface-variant); }
.evidence-table p { margin: 0; line-height: 1.5; }
.task-list article { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 17px; background: var(--md-sys-color-surface-container-lowest); }
.task-index { display: grid; width: 42px; height: 42px; place-items: center; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
.task-list h3 { margin: 3px 0; font-size: var(--md-sys-typescale-title-medium-size); }
.task-list p { margin: 0 0 5px; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
.related-job { display: grid; width: 100%; min-height: 0; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: center; border-radius: var(--md-sys-shape-corner-none); padding: 15px 16px; background: var(--md-sys-color-surface-container-lowest); color: inherit; text-align: left; }
.related-job:hover { background: var(--md-sys-color-surface-container); }
.related-job > div { display: grid; gap: 4px; }
.related-job span { display: inline-flex; align-items: center; gap: 5px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.detail-aside { position: sticky; top: 88px; display: grid; gap: 14px; }
.detail-aside section { padding: 18px; }
.detail-aside h2 { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: var(--md-sys-typescale-title-medium-size); }
.detail-aside ul, .detail-aside ol { display: grid; gap: 8px; margin: 0; padding-left: 20px; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
.tag-row { display: flex; flex-wrap: wrap; gap: 7px; }
.tag-row span { padding: 5px 8px; border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font-size: var(--md-sys-typescale-label-small-size); }
.warning-card { border-left: 3px solid var(--md-sys-color-tertiary); }
.loading-page { display: grid; min-height: 60vh; place-items: center; }
@media (max-width: 980px) { .direction-hero, .detail-grid { grid-template-columns: 1fr; } .direction-hero { gap: 24px; } .detail-aside { position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 680px) { .hero-copy h1 { font-size: var(--md-sys-typescale-headline-large-size); line-height: var(--md-sys-typescale-headline-large-line-height); } .insight-band { grid-template-columns: repeat(2, minmax(0, 1fr)); } .insight-band > div:nth-child(2) { border-right: 0; } .numbered-list, .outcome-grid, .aggregate-grid, .detail-aside { grid-template-columns: 1fr; } .skill-block { grid-column: auto; } .content-section > header { flex-direction: column; } .evidence-table article { grid-template-columns: 1fr; gap: 6px; } .task-list article { grid-template-columns: auto minmax(0, 1fr); } .task-list article > :last-child { grid-column: 1 / -1; width: 100%; } .related-job { grid-template-columns: minmax(0, 1fr) auto; } .related-job > span { grid-column: 1 / -1; grid-row: 2; } }
</style>
