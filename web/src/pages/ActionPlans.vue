<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarRange, CheckCircle2, ChevronRight, ListChecks, Plus, RotateCcw, Sparkles, Target } from 'lucide-vue-next'
import { m3Message } from '@/design-system/services/feedback'
import { M3ProgressOverlay } from '@/design-system/components'
import {
  generateConfirmedActionPlanApi, listActionPlansApi, previewActionPlanApi,
  type ActionPlanPreview, type ActionPlanSummary, type PlanType
} from '@/api/actionPlans'
import { getDecisionProjectApi, listDecisionProjectsApi, type DecisionProject, type DecisionProjectSummary } from '@/api/decisionProjects'

defineOptions({ name: 'ActionPlansPage' })

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const previewing = ref(false)
const confirming = ref(false)
const planPreview = ref<ActionPlanPreview | null>(null)
const plans = ref<ActionPlanSummary[]>([])
const projects = ref<DecisionProjectSummary[]>([])
const selectedProjectId = ref<number | null>(null)
const selectedProject = ref<DecisionProject | null>(null)
const durationWeeks = ref(4)
const startDate = ref(new Date().toISOString().slice(0, 10))
const showGenerator = computed(() => route.path.endsWith('/new') || route.query.projectId !== undefined)

const decidedProjects = computed(() => projects.value.filter((item) => item.primaryTarget))
const primaryTarget = computed(() => selectedProject.value?.targets.find((item) => item.targetType === 'primary') ?? null)
const selectedPlanType = computed<PlanType>(() => {
  if (primaryTarget.value?.verificationStatus !== 'verified') return 'validation'
  return route.query.planType === 'validation' ? 'validation' : 'action'
})
const maxPlanWeeks = computed(() => selectedPlanType.value === 'validation' ? 4 : 12)

const loadProject = async () => {
  planPreview.value = null
  if (!selectedProjectId.value) {
    selectedProject.value = null
    return
  }
  selectedProject.value = await getDecisionProjectApi(selectedProjectId.value)
  durationWeeks.value = selectedPlanType.value === 'validation'
    ? Math.min(4, Math.max(2, durationWeeks.value))
    : Math.min(12, Math.max(2, durationWeeks.value))
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
watch([durationWeeks, startDate], () => { planPreview.value = null })

const previewPlan = async () => {
  if (!selectedProject.value) {
    m3Message.warning('请先选择一个已确认目标的决策项目')
    return
  }
  const target = primaryTarget.value
  if (!target) {
    m3Message.warning('这次思考还没有保存想先尝试的方向。')
    return
  }
  previewing.value = true
  try {
    planPreview.value = await previewActionPlanApi({
      requestId: `web-action-preview-${selectedProject.value.id}-${crypto.randomUUID()}`,
      projectId: selectedProject.value.id,
      targetId: target.id,
      durationWeeks: durationWeeks.value,
      startDate: startDate.value,
      planType: selectedPlanType.value
    })
    m3Message.success(selectedPlanType.value === 'validation'
      ? '短期了解计划已经整理好，你可以先看看'
      : '下一步计划已经整理好，你可以先看看')
  } finally {
    previewing.value = false
  }
}

const confirmPlan = async () => {
  if (!planPreview.value) return
  confirming.value = true
  try {
    const plan = await generateConfirmedActionPlanApi(planPreview.value)
    m3Message.success('行动计划已确认并保存')
    router.replace(`/action-plans/${plan.id}`)
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="product-page">
    <div class="product-shell">
      <header class="product-header">
        <div><h1>下一步计划</h1><p>把目前的想法变成几件可以慢慢完成、也可以随时调整的小事。</p></div>
        <M3Button v-if="!showGenerator" type="button" @click="router.push('/action-plans/new')"><Plus :size="17" />生成计划</M3Button>
      </header>

      <main class="plans-content loading-host">
        <M3ProgressOverlay :visible="loading" label="正在加载行动计划" />
        <section v-if="showGenerator" class="generator-layout">
          <M3Card tag="div" class="generator-form">
            <div class="generator-heading"><CalendarRange :size="22" /><div><h2>{{ selectedPlanType === 'validation' ? '先安排一段时间多了解一些' : '安排接下来要做的事情' }}</h2><p>{{ selectedPlanType === 'validation' ? '用 2 至 4 周看看这个方向是否真的适合你，不需要现在就做长期承诺。' : '我们会参考真实岗位和你已有的经历，先整理一份可以修改的计划。' }}</p></div></div>
            <label class="field-label">选择这次思考
              <M3Select v-model="selectedProjectId"  @change="loadProject">
                <option :value="null" disabled>请选择</option>
                <option v-for="project in decidedProjects" :key="project.id" :value="project.id">{{ project.title }} · {{ project.primaryTarget }}</option>
              </M3Select>
            </label>
            <div class="form-grid two-columns">
              <label class="field-label">想先安排几周？
                <div class="week-stepper"><M3IconButton label="减少一周" variant="outlined" @click="durationWeeks = Math.max(2, durationWeeks - 1)">−</M3IconButton><strong>{{ durationWeeks }} 周</strong><M3IconButton label="增加一周" variant="outlined" @click="durationWeeks = Math.min(maxPlanWeeks, durationWeeks + 1)">＋</M3IconButton></div>
              </label>
              <label class="field-label">开始日期<M3DatePicker v-model="startDate" /></label>
            </div>
            <M3Button class="generate-button" type="button" :disabled="previewing || confirming || !selectedProject" @click="previewPlan"><Sparkles :size="17" />{{ previewing ? '正在整理' : planPreview ? '重新整理一份' : '先看看计划' }}</M3Button>
          </M3Card>

          <M3Card tag="aside" class="target-preview">
            <template v-if="selectedProject">
              <span>{{ selectedPlanType === 'validation' ? '目前想先试试' : '已经比较了解' }}</span><h2>{{ primaryTarget?.targetName }}</h2><p>{{ selectedProject.question }}</p>
              <dl><div><dt>为什么想先试试</dt><dd>{{ primaryTarget?.decisionReason }}</dd></div><div><dt>还需要留意</dt><dd>{{ primaryTarget?.mainRisks || '可以以后再补充' }}</dd></div><div><dt>已经查看的岗位</dt><dd>{{ selectedProject.jobSamples.length }} 个</dd></div></dl>
            </template>
            <div v-else class="empty-target"><Target :size="26" /><strong>选择一个已确认的目标</strong><span>尚未确认目标的项目不会出现在生成列表中。</span></div>
          </M3Card>

          <M3Card v-if="planPreview" tag="section" class="plan-preview" aria-label="行动计划草稿">
            <header class="preview-header">
              <div><span>保存前先看看</span><h2>{{ planPreview.targetRole }} · {{ planPreview.durationWeeks }} 周</h2><p>{{ planPreview.overview }}</p></div>
              <div class="preview-meta"><span>{{ planPreview.planType === 'validation' ? '多了解一些' : '继续向目标前进' }}</span><strong>{{ planPreview.generationMode === 'llm' ? '已结合 AI 建议' : '根据已有信息整理' }}</strong></div>
            </header>

            <div class="preview-context">
              <section><h3>我们参考了这些信息</h3><ul><li v-for="item in planPreview.evidenceBasis" :key="`${item.statement}-${item.sourceRefs.join()}`">{{ item.statement }}</li></ul></section>
              <section><h3>还可以继续了解</h3><ul><li v-for="item in planPreview.uncertainties" :key="item">{{ item }}</li></ul></section>
            </div>

            <div class="preview-weeks">
              <article v-for="week in planPreview.weeks" :key="week.weekNo" class="preview-week">
                <header><span>第 {{ week.weekNo }} 周</span><h3>{{ week.goal }}</h3></header>
                <div class="preview-tasks">
                  <section v-for="task in week.tasks" :key="`${week.weekNo}-${task.title}`">
                    <div class="preview-task-title"><CheckCircle2 :size="17" /><strong>{{ task.title }}</strong><span>{{ task.estimatedMinutes }} 分钟</span></div>
                    <p>{{ task.content }}</p>
                    <dl>
                      <div v-if="task.jobRequirement"><dt>岗位依据</dt><dd>{{ task.jobRequirement }}</dd></div>
                      <div v-if="task.capabilityGap"><dt>能力缺口</dt><dd>{{ task.capabilityGap }}</dd></div>
                      <div><dt>为什么做</dt><dd>{{ task.rationale }}</dd></div>
                      <div><dt>做到什么程度</dt><dd>{{ task.acceptanceCriteria }}</dd></div>
                    </dl>
                  </section>
                </div>
              </article>
            </div>

            <footer class="preview-actions"><M3Button variant="outlined" type="button" :disabled="previewing || confirming" @click="previewPlan"><RotateCcw :size="16" />换一份看看</M3Button><M3Button type="button" :disabled="confirming" @click="confirmPlan"><CheckCircle2 :size="17" />{{ confirming ? '正在保存' : '保存这份计划' }}</M3Button></footer>
          </M3Card>
        </section>

        <template v-else>
          <section v-if="plans.length" class="plan-list">
            <M3Card v-for="plan in plans" :key="plan.id" class="plan-row" tag="button" variant="filled" interactive @click="router.push(`/action-plans/${plan.id}`)">
              <div class="plan-icon"><ListChecks :size="20" /></div>
              <div class="plan-copy"><span>{{ plan.planType === 'validation' ? '正在多了解一些' : plan.status === 'active' ? '正在进行' : plan.status }}</span><h2>{{ plan.targetRole }}</h2><p>{{ plan.durationWeeks }} 周 · {{ plan.startDate }} 至 {{ plan.endDate }}</p></div>
              <div class="progress-block"><strong>{{ plan.progressPercent }}%</strong><span>{{ plan.completedTaskCount }} / {{ plan.taskCount }} 个任务</span><M3LinearProgress :value="plan.progressPercent / 100" :label="`${plan.targetRole}计划进度`" /></div>
              <ChevronRight :size="19" />
            </M3Card>
          </section>

          <M3Card tag="section" v-else-if="!loading" class="empty-plans">
            <div class="plan-icon large"><ListChecks :size="26" /></div><h2>选好想试的方向后，用行动继续了解</h2><p>计划不是一次性承诺，而是一组可以调整、延期、跳过和回看的具体任务。</p><M3Button type="button" @click="router.push('/action-plans/new')"><Plus :size="17" />生成第一个计划</M3Button>
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
.plan-preview { display: grid; grid-column: 1 / -1; gap: 22px; padding: 24px; }
.preview-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.preview-header > div:first-child { min-width: 0; }
.preview-header span, .preview-week > header span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-medium-size); font-weight: 600; }
.preview-header h2 { margin: 5px 0 8px; font-size: var(--md-sys-typescale-title-large-size); }
.preview-header p { max-width: 760px; margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.preview-meta { display: grid; flex: none; justify-items: end; gap: 5px; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-secondary-container); padding: 10px 12px; color: var(--md-sys-color-on-secondary-container); }
.preview-context { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.preview-context section { border-left: 3px solid var(--md-sys-color-primary); background: var(--md-sys-color-surface-container); padding: 14px 16px; }
.preview-context section + section { border-left-color: var(--md-sys-color-tertiary); }
.preview-context h3 { margin: 0 0 8px; font-size: var(--md-sys-typescale-title-small-size); }
.preview-context ul { display: grid; gap: 6px; margin: 0; padding-left: 18px; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
.preview-weeks { display: grid; gap: 16px; }
.preview-week { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 18px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 18px; }
.preview-week > header h3 { margin: 5px 0 0; font-size: var(--md-sys-typescale-title-medium-size); line-height: 1.4; }
.preview-tasks { display: grid; gap: 10px; }
.preview-tasks > section { border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container-low); padding: 15px; }
.preview-task-title { display: flex; align-items: center; gap: 8px; color: var(--md-sys-color-primary); }
.preview-task-title strong { color: var(--md-sys-color-on-surface); }
.preview-task-title span { margin-left: auto; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.preview-tasks p { margin: 9px 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.preview-tasks dl { display: grid; gap: 6px; margin: 0; }
.preview-tasks dl div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 8px; font-size: var(--md-sys-typescale-body-small-size); line-height: 1.45; }
.preview-tasks dt { color: var(--md-sys-color-primary); font-weight: 600; }.preview-tasks dd { margin: 0; color: var(--md-sys-color-on-surface-variant); }
.preview-actions { display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 18px; }
.plan-list { display: grid; gap: 12px; }.plan-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) 220px 20px; align-items: center; gap: 16px; padding: 18px; color: var(--md-sys-color-on-surface); text-align: left; cursor: pointer; }.plan-row:hover { background: var(--md-sys-color-surface-container); }
.plan-icon { display: inline-flex; width: 44px; height: 44px; align-items: center; justify-content: center; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); }.plan-icon.large { width: 54px; height: 54px; }
.plan-copy span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); font-weight: 500; }.plan-copy h2 { margin: 4px 0; font-size: var(--md-sys-typescale-title-medium-size); }.plan-copy p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.progress-block { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 6px 10px; }.progress-block strong { color: var(--md-sys-color-primary); }.progress-block span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }.progress-block > :last-child { grid-column: 1 / -1; }
.empty-plans { display: flex; min-height: 360px; align-items: center; justify-content: center; flex-direction: column; gap: 12px; padding: 30px; text-align: center; }.empty-plans h2 { margin: 5px 0 0; }.empty-plans p { max-width: 520px; margin: 0 0 8px; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
@media (max-width: 860px) { .generator-layout { grid-template-columns: 1fr; } .target-preview { position: static; } .preview-header { flex-direction: column; }.preview-meta { justify-items: start; }.preview-context { grid-template-columns: 1fr; }.preview-week { grid-template-columns: 1fr; }.plan-row { grid-template-columns: 46px 1fr 20px; }.progress-block { grid-column: 2 / -1; } }
@media (max-width: 600px) { .two-columns { grid-template-columns: 1fr; } .preview-actions { align-items: stretch; flex-direction: column; }.preview-actions > * { width: 100%; }.plan-row { grid-template-columns: 42px 1fr; }.plan-row > svg { display: none; }.progress-block { grid-column: 1 / -1; } }
</style>
