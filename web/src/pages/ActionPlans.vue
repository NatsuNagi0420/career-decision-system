<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarRange, ChevronRight, ListChecks, Plus, Target } from 'lucide-vue-next'
import { m3Message } from '@/design-system/services/feedback'
import { M3ProgressOverlay } from '@/design-system/components'
import { generateActionPlanApi, listActionPlansApi, type ActionPlanSummary } from '@/api/actionPlans'
import { getDecisionProjectApi, listDecisionProjectsApi, type DecisionProject, type DecisionProjectSummary } from '@/api/decisionProjects'

defineOptions({ name: 'ActionPlansPage' })

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const generating = ref(false)
const plans = ref<ActionPlanSummary[]>([])
const projects = ref<DecisionProjectSummary[]>([])
const selectedProjectId = ref<number | null>(null)
const selectedProject = ref<DecisionProject | null>(null)
const durationWeeks = ref(4)
const startDate = ref(new Date().toISOString().slice(0, 10))
const showGenerator = computed(() => route.path.endsWith('/new') || route.query.projectId !== undefined)

const decidedProjects = computed(() => projects.value.filter((item) => item.primaryTarget))

const loadProject = async () => {
  if (!selectedProjectId.value) {
    selectedProject.value = null
    return
  }
  selectedProject.value = await getDecisionProjectApi(selectedProjectId.value)
}

const load = async () => {
  loading.value = true
  try {
    const [planRows, projectRows] = await Promise.all([listActionPlansApi(), listDecisionProjectsApi()])
    plans.value = planRows
    projects.value = projectRows
    const queryProjectId = Number(route.query.projectId)
    selectedProjectId.value = Number.isFinite(queryProjectId) && queryProjectId > 0
      ? queryProjectId
      : decidedProjects.value[0]?.id || null
    await loadProject()
  } finally {
    loading.value = false
  }
}

onMounted(load)

const generate = async () => {
  if (!selectedProject.value) {
    m3Message.warning('请先选择一个已确认目标的决策项目')
    return
  }
  const target = selectedProject.value.targets.find((item) => item.targetType === 'primary')
  if (!target) {
    m3Message.warning('该项目尚未确认主目标')
    return
  }
  generating.value = true
  try {
    const plan = await generateActionPlanApi({
      requestId: `web-action-${selectedProject.value.id}-${crypto.randomUUID()}`,
      projectId: selectedProject.value.id,
      targetId: target.id,
      durationWeeks: durationWeeks.value,
      startDate: startDate.value
    })
    m3Message.success('行动计划已生成')
    router.replace(`/action-plans/${plan.id}`)
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="product-page">
    <div class="product-shell">
      <header class="product-header">
        <div><h1>行动计划</h1><p>围绕已确认目标按周执行。任务需要具体动作、预计耗时和可检查的验收标准。</p></div>
        <M3Button v-if="!showGenerator" type="button" @click="router.push('/action-plans/new')"><Plus :size="17" />生成计划</M3Button>
      </header>

      <main class="plans-content loading-host">
        <M3ProgressOverlay :visible="loading" label="正在加载行动计划" />
        <section v-if="showGenerator" class="generator-layout">
          <M3Card tag="div" class="generator-form">
            <div class="generator-heading"><CalendarRange :size="22" /><div><h2>生成默认行动计划</h2><p>默认 4 周，可调整为 2 至 12 周。生成后每项任务都可以编辑。</p></div></div>
            <label class="field-label">已确认目标的决策项目
              <M3Select v-model="selectedProjectId"  @change="loadProject">
                <option :value="null" disabled>请选择</option>
                <option v-for="project in decidedProjects" :key="project.id" :value="project.id">{{ project.title }} · {{ project.primaryTarget }}</option>
              </M3Select>
            </label>
            <div class="form-grid two-columns">
              <label class="field-label">计划周数
                <div class="week-stepper"><M3IconButton label="减少一周" variant="outlined" @click="durationWeeks = Math.max(2, durationWeeks - 1)">−</M3IconButton><strong>{{ durationWeeks }} 周</strong><M3IconButton label="增加一周" variant="outlined" @click="durationWeeks = Math.min(12, durationWeeks + 1)">＋</M3IconButton></div>
              </label>
              <label class="field-label">开始日期<M3DatePicker v-model="startDate" /></label>
            </div>
            <M3Button class="generate-button" type="button" :disabled="generating || !selectedProject" @click="generate"><ListChecks :size="17" />{{ generating ? '正在生成' : '生成并保存计划' }}</M3Button>
          </M3Card>

          <M3Card tag="aside" class="target-preview">
            <template v-if="selectedProject">
              <span>计划围绕</span><h2>{{ selectedProject.targets.find((item) => item.targetType === 'primary')?.targetName }}</h2><p>{{ selectedProject.question }}</p>
              <dl><div><dt>决策理由</dt><dd>{{ selectedProject.targets[0]?.decisionReason }}</dd></div><div><dt>主要风险</dt><dd>{{ selectedProject.targets[0]?.mainRisks || '未填写' }}</dd></div><div><dt>已有岗位样本</dt><dd>{{ selectedProject.jobSamples.length }} 个</dd></div></dl>
            </template>
            <div v-else class="empty-target"><Target :size="26" /><strong>选择一个已确认的目标</strong><span>尚未确认目标的项目不会出现在生成列表中。</span></div>
          </M3Card>
        </section>

        <template v-else>
          <section v-if="plans.length" class="plan-list">
            <M3Card v-for="plan in plans" :key="plan.id" class="plan-row" tag="button" variant="filled" interactive @click="router.push(`/action-plans/${plan.id}`)">
              <div class="plan-icon"><ListChecks :size="20" /></div>
              <div class="plan-copy"><span>{{ plan.status === 'active' ? '执行中' : plan.status }}</span><h2>{{ plan.targetRole }}</h2><p>{{ plan.durationWeeks }} 周 · {{ plan.startDate }} 至 {{ plan.endDate }}</p></div>
              <div class="progress-block"><strong>{{ plan.progressPercent }}%</strong><span>{{ plan.completedTaskCount }} / {{ plan.taskCount }} 个任务</span><M3LinearProgress :value="plan.progressPercent / 100" :label="`${plan.targetRole}计划进度`" /></div>
              <ChevronRight :size="19" />
            </M3Card>
          </section>

          <M3Card tag="section" v-else-if="!loading" class="empty-plans">
            <div class="plan-icon large"><ListChecks :size="26" /></div><h2>目标确认后，用行动继续验证</h2><p>计划不是一次性承诺，而是一组可以调整、延期、跳过和复盘的具体任务。</p><M3Button type="button" @click="router.push('/action-plans/new')"><Plus :size="17" />生成第一个计划</M3Button>
          </M3Card>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.plans-content { margin-top: 24px; }
.generator-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 22px; align-items: start; }
.generator-form, .target-preview { padding: 24px; }
.generator-form { display: grid; gap: 22px; }
.generator-heading { display: flex; align-items: flex-start; gap: 12px; color: var(--md-sys-color-primary); }
.generator-heading h2 { margin: 0; color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-title-large-size); }.generator-heading p { margin: 6px 0 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.form-grid { display: grid; gap: 16px; }.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.week-stepper { display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; gap: 8px; }
.week-stepper strong { text-align: center; }
.generate-button { justify-self: start; }
.target-preview { position: sticky; top: 88px; }
.target-preview > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }.target-preview h2 { margin: 5px 0 8px; }.target-preview > p { color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.target-preview dl { display: grid; gap: 1px; margin: 20px 0 0; background: var(--md-sys-color-outline-variant); }.target-preview dl div { display: grid; gap: 5px; background: var(--md-sys-color-surface-container-lowest); padding: 12px 0; }.target-preview dt { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }.target-preview dd { margin: 0; font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.empty-target { display: flex; min-height: 270px; align-items: center; justify-content: center; flex-direction: column; gap: 10px; color: var(--md-sys-color-on-surface-variant); text-align: center; }.empty-target span { max-width: 230px; font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.plan-list { display: grid; gap: 12px; }.plan-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) 220px 20px; align-items: center; gap: 16px; padding: 18px; color: var(--md-sys-color-on-surface); text-align: left; cursor: pointer; }.plan-row:hover { background: var(--md-sys-color-surface-container); }
.plan-icon { display: inline-flex; width: 44px; height: 44px; align-items: center; justify-content: center; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); }.plan-icon.large { width: 54px; height: 54px; }
.plan-copy span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); font-weight: 500; }.plan-copy h2 { margin: 4px 0; font-size: var(--md-sys-typescale-title-medium-size); }.plan-copy p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.progress-block { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 6px 10px; }.progress-block strong { color: var(--md-sys-color-primary); }.progress-block span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }.progress-block > :last-child { grid-column: 1 / -1; }
.empty-plans { display: flex; min-height: 360px; align-items: center; justify-content: center; flex-direction: column; gap: 12px; padding: 30px; text-align: center; }.empty-plans h2 { margin: 5px 0 0; }.empty-plans p { max-width: 520px; margin: 0 0 8px; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
@media (max-width: 860px) { .generator-layout { grid-template-columns: 1fr; } .target-preview { position: static; } .plan-row { grid-template-columns: 46px 1fr 20px; }.progress-block { grid-column: 2 / -1; } }
@media (max-width: 600px) { .two-columns { grid-template-columns: 1fr; } .plan-row { grid-template-columns: 42px 1fr; }.plan-row > svg { display: none; }.progress-block { grid-column: 1 / -1; } }
</style>
