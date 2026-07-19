<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, BriefcaseBusiness, CheckCircle2, GitCompareArrows,
  Plus, Search, Target, TriangleAlert, X
} from 'lucide-vue-next'
import CareerVisual from '@/components/CareerVisual.vue'
import { getCareerAsset, type CareerAsset } from '@/content/careerAssets'
import { m3Message } from '@/design-system/services/feedback'
import {
  getCareerDirectionApi, getCareerDirectionInsightsApi,
  type CareerDirection, type CareerDirectionInsights
} from '@/api/careerDirections'
import { listPersonalEvidenceApi, type PersonalEvidence } from '@/api/personalEvidence'
import {
  addDecisionCandidateApi, getDecisionProjectApi, listDecisionProjectsApi,
  type DecisionProjectSummary
} from '@/api/decisionProjects'
import { matchEvidence, type EvidenceRequirementMatch } from '@/utils/careerInsights'

defineOptions({ name: 'CareerDirectionComparePage' })

type CompareMode = 'overview' | 'jobs' | 'evidence'
type ComparisonItem = {
  direction: CareerDirection
  asset: CareerAsset
  aggregate: CareerDirectionInsights
  matches: EvidenceRequirementMatch[]
}
type ComparisonRow = {
  label: string
  presentation: 'text' | 'list' | 'tags' | 'metric'
  values: string[][]
}

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const activeMode = ref<CompareMode>('overview')
const selectedIds = ref<number[]>([])
const items = ref<ComparisonItem[]>([])
const personalEvidence = ref<PersonalEvidence[]>([])
const projects = ref<DecisionProjectSummary[]>([])
const targetProjectId = ref<number | null>(null)
const showProjectDialog = ref(false)
const savingProject = ref(false)

const columnStyle = computed(() => ({ '--compare-count': Math.max(items.value.length, 2) }))

function formatSalary(aggregate: CareerDirectionInsights) {
  const format = (value: number | null) => value == null ? '未知' : value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
  return aggregate.salarySampleCount ? `${format(aggregate.salaryMin)} - ${format(aggregate.salaryMax)}` : '样本未提供结构化薪资'
}

function formatDate(value: string | null) {
  if (!value) return '未提供'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
    : value
}

const comparisonRows = computed<ComparisonRow[]>(() => {
  if (activeMode.value === 'overview') {
    return [
      { label: '职业定位', presentation: 'text', values: items.value.map((item) => [item.direction.summary]) },
      { label: '典型工作', presentation: 'list', values: items.value.map((item) => item.direction.typicalWork.slice(0, 5)) },
      { label: '常见产出物', presentation: 'list', values: items.value.map((item) => item.asset.outcomes) },
      { label: '核心技能', presentation: 'tags', values: items.value.map((item) => item.direction.commonSkills.slice(0, 8)) },
      { label: '工作方式', presentation: 'tags', values: items.value.map((item) => item.direction.workTypes) },
      { label: '常见行业', presentation: 'tags', values: items.value.map((item) => item.direction.industryTags) },
      { label: '成长路径', presentation: 'list', values: items.value.map((item) => item.direction.growthPath) },
      { label: '需要警惕的误区', presentation: 'list', values: items.value.map((item) => item.direction.misconceptions) }
    ]
  }
  if (activeMode.value === 'jobs') {
    return [
      { label: '相关岗位样本', presentation: 'metric', values: items.value.map((item) => [`${item.aggregate.sampleCount} 个`]) },
      { label: '薪资样本范围', presentation: 'metric', values: items.value.map((item) => [formatSalary(item.aggregate)]) },
      { label: '高频技能', presentation: 'list', values: items.value.map((item) => item.aggregate.topSkills.map((row) => `${row.label} · ${row.count} 个样本`)) },
      { label: '高频岗位要求', presentation: 'list', values: items.value.map((item) => item.aggregate.commonRequirements.map((row) => `${row.label} · ${row.count} 个样本`)) },
      { label: '城市分布', presentation: 'list', values: items.value.map((item) => item.aggregate.cities.map((row) => `${row.label} · ${row.count} 个`)) },
      { label: '经验要求', presentation: 'list', values: items.value.map((item) => item.aggregate.experienceLevels.map((row) => `${row.label} · ${row.count} 个`)) },
      { label: '学历要求', presentation: 'list', values: items.value.map((item) => item.aggregate.educationLevels.map((row) => `${row.label} · ${row.count} 个`)) },
      { label: '最近样本更新', presentation: 'text', values: items.value.map((item) => [formatDate(item.aggregate.latestSourceAt)]) }
    ]
  }
  return [
    {
      label: '证据覆盖',
      presentation: 'metric',
      values: items.value.map((item) => [`${item.matches.filter((match) => match.evidence).length} / ${item.matches.length}`])
    },
    {
      label: '已有证据',
      presentation: 'list',
      values: items.value.map((item) => item.matches
        .filter((match) => match.evidence)
        .map((match) => `${match.requirement} · ${match.evidence!.title}`))
    },
    {
      label: '缺少证据',
      presentation: 'list',
      values: items.value.map((item) => item.matches
        .filter((match) => !match.evidence)
        .map((match) => match.requirement))
    },
    {
      label: '建议体验任务',
      presentation: 'list',
      values: items.value.map((item) => item.asset.experienceTasks.map((task) => `${task.title} · ${task.duration}`))
    },
    {
      label: '判断边界',
      presentation: 'text',
      values: items.value.map(() => ['关键词关联只能提示可能相关的证据，不能替代对成果质量和真实岗位要求的人工判断。'])
    }
  ]
})

async function load() {
  const rawIds = String(route.query.directions || '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
  selectedIds.value = Array.from(new Set(rawIds)).slice(0, 3)
  if (selectedIds.value.length < 2) {
    m3Message.warning('请先选择至少 2 个职业方向')
    await router.replace('/explore')
    return
  }

  loading.value = true
  try {
    const [directions, evidenceRows, projectRows] = await Promise.all([
      Promise.all(selectedIds.value.map((id) => getCareerDirectionApi(id))),
      listPersonalEvidenceApi(),
      listDecisionProjectsApi()
    ])
    personalEvidence.value = evidenceRows
    projects.value = projectRows
    targetProjectId.value = projectRows.find((project) => project.current)?.id || projectRows[0]?.id || null

    items.value = await Promise.all(directions.map(async (direction) => {
      const aggregate = await getCareerDirectionInsightsApi(direction.id)
      const requirements = Array.from(new Set([
        ...direction.commonSkills,
        ...aggregate.commonRequirements.map((row) => row.label),
        ...aggregate.topSkills.map((row) => row.label)
      ])).slice(0, 16)
      return {
        direction,
        asset: getCareerAsset(direction.category),
        aggregate,
        matches: matchEvidence(requirements, evidenceRows)
      }
    }))
  } catch {
    m3Message.error('职业方向对比加载失败，请返回后重试')
  } finally {
    loading.value = false
  }
}

async function removeDirection(id: number) {
  selectedIds.value = selectedIds.value.filter((item) => item !== id)
  items.value = items.value.filter((item) => item.direction.id !== id)
  if (selectedIds.value.length < 2) {
    await router.push('/explore')
    return
  }
  await router.replace({ query: { directions: selectedIds.value.join(',') } })
}

function openProjectDialog() {
  if (!projects.value.length) {
    router.push('/decision-projects/new')
    return
  }
  showProjectDialog.value = true
}

async function addAllToProject() {
  if (!targetProjectId.value) return
  savingProject.value = true
  try {
    let project = await getDecisionProjectApi(targetProjectId.value)
    const existingDirectionIds = new Set(project.candidates.map((candidate) => candidate.directionId).filter(Boolean))
    const existingNames = new Set(project.candidates.map((candidate) => candidate.name))
    const pending = items.value.filter((item) =>
      !existingDirectionIds.has(item.direction.id) && !existingNames.has(item.direction.name)
    )
    const availableCandidateSlots = Math.max(0, 5 - project.candidates.length)
    if (pending.length > availableCandidateSlots) {
      m3Message.warning(`该项目还可加入 ${availableCandidateSlots} 个候选，请先移除部分方向或选择其他项目`)
      return
    }
    for (const item of pending) {
      project = await addDecisionCandidateApi(targetProjectId.value, {
        directionId: item.direction.id,
        name: item.direction.name,
        recommendationReason: `从快速对比加入：${item.direction.summary}`,
        uncertainties: `当前聚合 ${item.aggregate.sampleCount} 个相关岗位样本，仍需结合具体 JD 和个人行动验证。`,
        validationActions: [item.asset.experienceTasks[0]?.title || '完成一次低成本职业体验'],
        sourceType: 'catalog',
        expectedVersion: project.version
      })
    }
    showProjectDialog.value = false
    m3Message.success(pending.length ? `已将 ${pending.length} 个方向加入决策项目` : '这些方向已经在该决策项目中')
  } finally {
    savingProject.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="product-page">
    <div class="product-shell compare-shell">
      <nav class="compare-back"><M3Button variant="text" type="button" @click="router.push('/explore')"><ArrowLeft :size="17" />返回职业探索</M3Button></nav>
      <header class="compare-header">
        <div><span>职业探索</span><h1>职业方向快速对比</h1><p>并排查看职业事实、真实岗位样本和个人证据。这里不生成综合排名，选择仍需通过行动验证。</p></div>
        <M3Button type="button" :disabled="items.length < 2" @click="openProjectDialog"><Plus :size="17" />加入决策项目</M3Button>
      </header>

      <M3Tabs class="compare-tabs" aria-label="对比内容">
        <M3Tab :active="activeMode === 'overview'" @click="activeMode = 'overview'"><template #icon><GitCompareArrows :size="18" /></template>关键差异</M3Tab>
        <M3Tab :active="activeMode === 'jobs'" @click="activeMode = 'jobs'"><template #icon><BriefcaseBusiness :size="18" /></template>真实岗位</M3Tab>
        <M3Tab :active="activeMode === 'evidence'" @click="activeMode = 'evidence'"><template #icon><Target :size="18" /></template>我的证据</M3Tab>
      </M3Tabs>

      <div v-if="loading" class="compare-loading"><M3CircularProgress indeterminate label="正在加载职业方向对比" /></div>
      <div v-else-if="items.length >= 2" class="comparison-scroll" tabindex="0" aria-label="职业方向对比表，可横向滚动">
        <section class="comparison-matrix" :style="columnStyle">
          <div class="matrix-corner"><span>比较维度</span><small>{{ items.length }} 个方向</small></div>
          <header v-for="item in items" :key="item.direction.id" class="direction-column-head">
            <CareerVisual :visual="item.asset.visual" :label="item.direction.name" compact />
            <div><span>{{ item.direction.category }}</span><h2>{{ item.direction.name }}</h2></div>
            <M3IconButton :label="`移出对比：${item.direction.name}`" @click="removeDirection(item.direction.id)"><X :size="17" /></M3IconButton>
          </header>

          <template v-for="row in comparisonRows" :key="row.label">
            <div class="row-label"><strong>{{ row.label }}</strong></div>
            <article v-for="(values, index) in row.values" :key="`${row.label}-${items[index]?.direction.id}`" class="matrix-cell" :class="`cell-${row.presentation}`">
              <strong v-if="row.presentation === 'metric'">{{ values[0] || '未知' }}</strong>
              <p v-else-if="row.presentation === 'text'">{{ values[0] || '暂无可靠数据' }}</p>
              <div v-else-if="row.presentation === 'tags'" class="cell-tags"><span v-for="value in values" :key="value">{{ value }}</span><small v-if="!values.length">暂无可靠数据</small></div>
              <ul v-else-if="values.length"><li v-for="value in values" :key="value">{{ value }}</li></ul>
              <p v-else class="no-data">暂无可靠数据</p>
            </article>
          </template>
        </section>
      </div>

      <section v-if="!loading && activeMode === 'jobs'" class="sample-note"><TriangleAlert :size="18" /><p>岗位数量和薪资只表示当前数据库匹配样本，不代表完整市场规模或平均薪资。不同方向的样本量不一致时，不应直接比较绝对数量。</p></section>
      <section v-if="!loading && activeMode === 'evidence' && !personalEvidence.length" class="sample-note"><Search :size="18" /><p>你还没有个人证据，当前只能展示岗位要求。先记录课程、项目、实习或行动成果，再判断哪些方向有真实基础。</p></section>
    </div>

    <M3Dialog v-model="showProjectDialog" title="加入决策项目">
      <div class="project-dialog">
        <p>将 {{ items.length }} 个方向作为候选加入同一个决策项目。已有候选不会重复创建。</p>
        <label class="field-label">决策项目<M3Select v-model="targetProjectId"><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.title }}</option></M3Select></label>
      </div>
      <template #actions><M3Button variant="outlined" type="button" @click="showProjectDialog = false">取消</M3Button><M3Button type="button" :disabled="savingProject" @click="addAllToProject"><CheckCircle2 :size="16" />确认加入</M3Button></template>
    </M3Dialog>
  </div>
</template>

<style scoped>
.compare-shell { max-width: 1280px; }
.compare-back { margin-bottom: 12px; }
.compare-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.compare-header > div > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-large-size); font-weight: 600; }
.compare-header h1 { margin: 7px 0 8px; font-size: var(--md-sys-typescale-headline-medium-size); line-height: var(--md-sys-typescale-headline-medium-line-height); }
.compare-header p { max-width: 760px; margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
.compare-tabs { margin: 22px 0; }
.compare-loading { display: grid; min-height: 420px; place-items: center; }
.comparison-scroll { overflow-x: auto; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); scrollbar-width: thin; }
.comparison-scroll:focus-visible { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }
.comparison-matrix { display: grid; min-width: calc(160px + var(--compare-count) * 230px); grid-template-columns: 160px repeat(var(--compare-count), minmax(230px, 1fr)); }
.matrix-corner, .direction-column-head, .row-label, .matrix-cell { min-width: 0; border-right: 1px solid var(--md-sys-color-outline-variant); border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.matrix-corner { display: grid; align-content: end; gap: 4px; padding: 16px; background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); }
.matrix-corner small { font-size: var(--md-sys-typescale-label-small-size); }
.direction-column-head { position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 12px; background: var(--md-sys-color-surface-container-low); }
.direction-column-head > div > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }
.direction-column-head h2 { margin: 3px 0 0; font-size: var(--md-sys-typescale-title-medium-size); overflow-wrap: anywhere; }
.row-label { padding: 16px; background: var(--md-sys-color-surface-container); font-size: var(--md-sys-typescale-body-small-size); }
.matrix-cell { padding: 16px; background: color-mix(in srgb, var(--md-sys-color-surface) 92%, transparent); }
.matrix-cell p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.matrix-cell > strong { color: var(--md-sys-color-tertiary); font-size: var(--md-sys-typescale-title-large-size); overflow-wrap: anywhere; }
.matrix-cell ul { display: grid; gap: 7px; margin: 0; padding-left: 18px; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
.cell-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.cell-tags span { border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); padding: 4px 7px; font-size: var(--md-sys-typescale-label-small-size); }
.cell-tags small, .no-data { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.sample-note { display: flex; align-items: flex-start; gap: 10px; margin-top: 18px; border-left: 3px solid var(--md-sys-color-tertiary); background: var(--md-sys-color-tertiary-container); padding: 12px 14px; color: var(--md-sys-color-on-tertiary-container); }
.sample-note svg { flex: none; }
.sample-note p, .project-dialog p { margin: 0; line-height: 1.55; }
.project-dialog { display: grid; gap: 18px; min-width: min(520px, 72vw); }
@media (min-width: 981px) { .compare-shell { padding-right: 72px; } }
@media (max-width: 680px) { .compare-header { align-items: stretch; flex-direction: column; } .compare-header > :last-child { width: 100%; } .comparison-matrix { min-width: calc(128px + var(--compare-count) * 210px); grid-template-columns: 128px repeat(var(--compare-count), minmax(210px, 1fr)); } .matrix-corner, .row-label, .matrix-cell { padding: 12px; } .direction-column-head { grid-template-columns: 44px minmax(0, 1fr) auto; padding: 9px; } .project-dialog { min-width: 0; } }
</style>
