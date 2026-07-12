<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Save,
  Sparkles
} from 'lucide-vue-next'
import { m3Confirm, m3Message } from '@/design-system/services/feedback'
import AgentInsightPanel from '@/components/AgentInsightPanel.vue'
import {
  coachWeeklyReviewApi,
  type TaskAdjustmentSuggestion,
  type WeeklyReviewCoachResponse
} from '@/api/coaching'
import {
  getActionPlanApi,
  listActionPlansApi,
  type ActionPlan,
  type ActionTask,
  type TaskStatus
} from '@/api/actionPlans'
import {
  applyWeeklyReviewAdjustmentsApi,
  getWeeklyReviewApi,
  listWeeklyReviewsApi,
  saveWeeklyReviewApi,
  submitWeeklyReviewApi,
  type WeeklyReview
} from '@/api/weeklyReviews'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/utils/formDraft'
import { getStoredUser } from '@/utils/session'

defineOptions({ name: 'WeeklyReviewPage' })

type AdjustmentDraft = {
  task: ActionTask
  selected: boolean
  status: TaskStatus
  reason: string
  deferredTo: string
}

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const submitting = ref(false)
const applying = ref(false)
const coachLoading = ref(false)
const loadError = ref('')
const plan = ref<ActionPlan | null>(null)
const review = ref<WeeklyReview | null>(null)
const adjustments = ref<AdjustmentDraft[]>([])
const reviewCoach = ref<WeeklyReviewCoachResponse | null>(null)
const draftReady = ref(false)
const draftUserId = getStoredUser()?.id
const reviewRequestId = ref(`web-review-draft-${crypto.randomUUID()}`)

const form = reactive({
  completedSummary: '',
  evidenceSummary: '',
  difficulties: '',
  nextWeekMinutes: 300,
  confidenceTrend: 'stable' as 'increased' | 'stable' | 'decreased',
  confidenceReason: '',
  adjustmentProposal: ''
})

const reviewId = computed(() => route.params.id ? Number(route.params.id) : null)
const queryWeek = computed(() => Math.max(1, Math.min(12, Number(route.query.weekNo) || 1)))
const weekNo = computed(() => review.value?.weekNo || queryWeek.value)
const week = computed(() => plan.value?.weeks.find((item) => item.weekNo === weekNo.value))
const completedTasks = computed(() => week.value?.tasks.filter((task) => task.status === 'completed') || [])
const evidenceCount = computed(() => completedTasks.value.reduce((count, task) => count + task.results.length, 0))
const editable = computed(() => !review.value || review.value.status === 'draft')
const selectedAdjustments = computed(() => adjustments.value.filter((item) => item.selected))
const draftScope = computed(() => `weekly-review-${plan.value?.id || route.query.planId || 'current'}-${weekNo.value}`)

const fillForm = (value: WeeklyReview) => {
  if (value.requestId) reviewRequestId.value = value.requestId
  Object.assign(form, {
    completedSummary: value.completedSummary || '',
    evidenceSummary: value.evidenceSummary || '',
    difficulties: value.difficulties || '',
    nextWeekMinutes: value.nextWeekMinutes ?? 300,
    confidenceTrend: value.confidenceTrend || 'stable',
    confidenceReason: value.confidenceReason || '',
    adjustmentProposal: value.adjustmentProposal || ''
  })
}

const buildAdjustments = () => {
  if (!plan.value) return
  adjustments.value = plan.value.weeks
    .filter((item) => item.weekNo >= weekNo.value)
    .flatMap((item) => item.tasks)
    .filter((task) => task.status !== 'completed')
    .map((task) => ({
      task,
      selected: false,
      status: task.status,
      reason: '',
      deferredTo: task.deferredTo?.slice(0, 16) || ''
    }))
}

const resolvePlanId = async () => {
  const fromQuery = Number(route.query.planId)
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery
  const plans = await listActionPlansApi()
  return plans.find((item) => item.status === 'active')?.id || plans[0]?.id || null
}

const load = async () => {
  draftReady.value = false
  loading.value = true
  loadError.value = ''
  try {
    if (reviewId.value) {
      review.value = await getWeeklyReviewApi(reviewId.value)
      fillForm(review.value)
      plan.value = await getActionPlanApi(review.value.planId)
    } else {
      const planId = await resolvePlanId()
      if (!planId) {
        loadError.value = '还没有可复盘的行动计划。'
        return
      }
      plan.value = await getActionPlanApi(planId)
      const currentWeek = Math.max(1, Math.min(
        plan.value.durationWeeks,
        Number(route.query.weekNo) || Math.floor(Math.max(0, Date.now() - new Date(`${plan.value.startDate}T00:00:00`).getTime()) / 604800000) + 1
      ))
      const existing = (await listWeeklyReviewsApi(planId)).find((item) => item.weekNo === currentWeek)
      if (existing) {
        review.value = existing
        fillForm(existing)
      } else if (!route.query.weekNo) {
        await router.replace({ query: { ...route.query, planId: String(planId), weekNo: String(currentWeek) } })
      }
    }
    buildAdjustments()
    const draft = loadFormDraft<typeof form>(draftScope.value, draftUserId)
    const serverUpdatedAt = review.value?.updatedAt
    if (draft && (!serverUpdatedAt || Date.parse(draft.updatedAt) > Date.parse(serverUpdatedAt))) {
      Object.assign(form, draft.data)
    }
  } catch {
    loadError.value = '复盘内容加载失败，请稍后重试。'
  } finally {
    draftReady.value = true
    loading.value = false
  }
}

watch(form, () => {
  if (!draftReady.value || !editable.value) return
  saveFormDraft(draftScope.value, draftUserId, { ...form })
}, { deep: true })

const payload = () => ({
  requestId: reviewRequestId.value,
  planId: plan.value!.id,
  weekNo: weekNo.value,
  completedSummary: form.completedSummary.trim(),
  evidenceSummary: form.evidenceSummary.trim(),
  difficulties: form.difficulties.trim(),
  nextWeekMinutes: form.nextWeekMinutes,
  confidenceTrend: form.confidenceTrend,
  confidenceReason: form.confidenceReason.trim(),
  adjustmentProposal: form.adjustmentProposal.trim()
})

const saveDraft = async (quiet = false) => {
  if (!plan.value || !editable.value) return review.value
  saving.value = true
  try {
    review.value = await saveWeeklyReviewApi(payload())
    if (review.value.requestId) reviewRequestId.value = review.value.requestId
    clearFormDraft(draftScope.value, draftUserId)
    if (!quiet) m3Message.success('复盘草稿已保存')
    return review.value
  } finally {
    saving.value = false
  }
}

const submitReview = async () => {
  if (!form.completedSummary.trim() && !form.evidenceSummary.trim() && !form.difficulties.trim()) {
    m3Message.warning('本周完成、成果证据和遇到的阻碍至少填写一项')
    return
  }
  await m3Confirm('提交后复盘正文不能再编辑，确认提交吗？', '提交本周复盘', {
    confirmButtonText: '确认提交',
    cancelButtonText: '继续编辑',
    type: 'warning'
  })
  submitting.value = true
  try {
    const draft = await saveDraft(true)
    if (!draft) return
    review.value = await submitWeeklyReviewApi(draft.id)
    clearFormDraft(draftScope.value, draftUserId)
    m3Message.success('本周复盘已提交')
  } finally {
    submitting.value = false
  }
}

const applyAdjustments = async () => {
  if (!review.value || review.value.status !== 'submitted' || !selectedAdjustments.value.length) return
  const invalid = selectedAdjustments.value.find((item) => item.status === 'deferred' && !item.deferredTo)
  if (invalid) {
    m3Message.warning(`请为“${invalid.task.title}”选择延期时间`)
    return
  }
  await m3Confirm(
    `将一次性修改 ${selectedAdjustments.value.length} 个任务。修改会写入变更历史，是否继续？`,
    '确认调整行动计划',
    { confirmButtonText: '确认应用', cancelButtonText: '取消', type: 'warning' }
  )
  applying.value = true
  try {
    review.value = await applyWeeklyReviewAdjustmentsApi(review.value.id, {
      confirmed: true,
      requestId: `web-review-${review.value.id}-${crypto.randomUUID()}`,
      adjustments: selectedAdjustments.value.map((item) => ({
        taskId: item.task.id,
        status: item.status,
        reason: item.reason.trim() || '根据每周复盘调整',
        deferredTo: item.status === 'deferred' ? item.deferredTo : undefined,
        expectedVersion: item.task.version
      }))
    })
    plan.value = await getActionPlanApi(review.value.planId)
    buildAdjustments()
    m3Message.success('计划调整已应用')
  } finally {
    applying.value = false
  }
}

const requestReviewCoach = async () => {
  let currentReview = review.value
  if (!currentReview) currentReview = await saveDraft(true) || null
  if (!currentReview) return
  coachLoading.value = true
  try {
    reviewCoach.value = await coachWeeklyReviewApi(currentReview.id)
  } finally {
    coachLoading.value = false
  }
}

const deferredDate = (suggestion: TaskAdjustmentSuggestion) => {
  if (!suggestion.deferredDays) return ''
  return new Date(Date.now() + suggestion.deferredDays * 86400000).toISOString().slice(0, 16)
}

const adoptCoachAdjustments = async () => {
  if (!reviewCoach.value?.adjustmentSuggestions.length) return
  await m3Confirm(
    '把 AI 建议填入任务调整草稿？这一步不会修改任务，提交复盘后仍需再次确认应用。',
    '确认采用 AI 调整建议',
    { confirmButtonText: '填入草稿', cancelButtonText: '取消', type: 'warning' }
  )
  for (const suggestion of reviewCoach.value.adjustmentSuggestions) {
    const draft = adjustments.value.find((item) => item.task.id === suggestion.taskId)
    if (!draft) continue
    draft.selected = true
    draft.status = suggestion.status
    draft.reason = suggestion.reason
    draft.deferredTo = suggestion.status === 'deferred' ? deferredDate(suggestion) : ''
  }
  if (editable.value) {
    form.adjustmentProposal = reviewCoach.value.adjustmentSuggestions
      .map((item) => `${item.taskTitle}：${item.reason}`)
      .join('\n')
  }
  m3Message.success('建议已填入草稿，任务尚未修改')
}

onMounted(load)
</script>

<template>
  <div class="product-page">
    <div class="product-shell review-shell">
      <header class="review-header">
        <M3IconButton label="返回行动计划" @click="router.push(plan ? `/action-plans/${plan.id}` : '/action-plans')"><ArrowLeft :size="19" /></M3IconButton>
        <div>
          <span>每周复盘</span>
          <h1>{{ plan ? `${plan.targetRole} · 第 ${weekNo} 周` : '加载中' }}</h1>
          <p v-if="plan">{{ plan.startDate }} 至 {{ plan.endDate }}</p>
        </div>
        <span v-if="review" :class="['review-status', review.status]">
          <CheckCircle2 v-if="review.status !== 'draft'" :size="15" />
          {{ review.status === 'draft' ? '草稿' : review.status === 'submitted' ? '已提交' : '调整已应用' }}
        </span>
      </header>

      <M3Card tag="div" v-if="loading" class="page-state">正在加载复盘...</M3Card>
      <M3Card tag="div" v-else-if="loadError" class="page-state"><p>{{ loadError }}</p><M3Button variant="outlined" type="button" @click="router.push('/action-plans')">返回行动计划</M3Button></M3Card>

      <template v-else-if="plan">
        <M3Card tag="section" class="week-facts">
          <div><CalendarCheck2 :size="20" /><span>本周任务</span><strong>{{ week?.tasks.length || 0 }}</strong></div>
          <div><Check :size="20" /><span>已完成</span><strong>{{ completedTasks.length }}</strong></div>
          <div><FileCheck2 :size="20" /><span>成果记录</span><strong>{{ evidenceCount }}</strong></div>
          <div><Clock3 :size="20" /><span>下周投入</span><strong>{{ Math.round(form.nextWeekMinutes / 60 * 10) / 10 }} 小时</strong></div>
        </M3Card>

        <div class="coach-toolbar"><M3Button variant="outlined" type="button" :disabled="coachLoading" @click="requestReviewCoach"><Sparkles :size="16" />{{ coachLoading ? '正在复盘' : '请 AI 复盘教练分析' }}</M3Button></div>
        <AgentInsightPanel v-if="reviewCoach" class="review-coach-panel" :result="reviewCoach" title="复盘教练建议">
          <div class="coach-review-summary"><strong>复盘摘要</strong><p>{{ reviewCoach.reviewSummary }}</p></div>
          <div v-if="reviewCoach.adjustmentSuggestions.length" class="coach-adjustments">
            <div v-for="item in reviewCoach.adjustmentSuggestions" :key="item.taskId"><strong>{{ item.taskTitle }}</strong><span>{{ item.status }} · {{ item.reason }}</span></div>
            <M3Button variant="outlined" type="button" :disabled="review?.status === 'adjustments_applied'" @click="adoptCoachAdjustments">填入调整草稿</M3Button>
          </div>
        </AgentInsightPanel>

        <div class="review-layout">
          <form class="review-form" @submit.prevent="saveDraft()">
            <section class="form-section">
              <div class="section-title"><ClipboardCheck :size="19" /><div><h2>本周发生了什么</h2><p>只记录事实、成果和实际阻碍。</p></div></div>
              <label class="field-label">完成情况<M3TextArea v-model="form.completedSummary"  :disabled="!editable" placeholder="完成了哪些任务，哪些没有完成"></M3TextArea></label>
              <label class="field-label">成果证据<M3TextArea v-model="form.evidenceSummary"  :disabled="!editable" placeholder="项目链接、反馈、数据或新的认识"></M3TextArea></label>
              <label class="field-label">遇到的阻碍<M3TextArea v-model="form.difficulties"  :disabled="!editable" placeholder="时间、能力、信息或现实约束"></M3TextArea></label>
            </section>

            <section class="form-section">
              <div class="section-title"><CheckCircle2 :size="19" /><div><h2>判断是否变化</h2><p>关注证据是否让你更确定，而不是只看任务数量。</p></div></div>
              <M3RadioGroup class="trend-field" label="对目标的信心" :disabled="!editable">
                <label :class="{ active: form.confidenceTrend === 'increased' }"><M3Radio v-model="form.confidenceTrend" name="confidence-trend" value="increased" label="信心上升" />上升</label>
                <label :class="{ active: form.confidenceTrend === 'stable' }"><M3Radio v-model="form.confidenceTrend" name="confidence-trend" value="stable" label="信心不变" />不变</label>
                <label :class="{ active: form.confidenceTrend === 'decreased' }"><M3Radio v-model="form.confidenceTrend" name="confidence-trend" value="decreased" label="信心下降" />下降</label>
              </M3RadioGroup>
              <label class="field-label">变化依据<M3TextArea v-model="form.confidenceReason"  :disabled="!editable"></M3TextArea></label>
              <label class="field-label">下周可投入时间（分钟）<M3TextField v-model.number="form.nextWeekMinutes"  type="number" min="0" max="10080" :disabled="!editable" /></label>
              <label class="field-label">计划调整建议<M3TextArea v-model="form.adjustmentProposal"  :disabled="!editable" placeholder="哪些任务需要保留、延期或跳过"></M3TextArea></label>
            </section>

            <div v-if="editable" class="form-actions">
              <M3Button variant="outlined" type="submit" :disabled="saving || submitting"><Save :size="17" />保存草稿</M3Button>
              <M3Button type="button" :disabled="saving || submitting" @click="submitReview"><CheckCircle2 :size="17" />提交复盘</M3Button>
            </div>
          </form>

          <M3Card tag="aside" class="week-tasks">
            <h2>第 {{ weekNo }} 周任务</h2>
            <ul v-if="week?.tasks.length">
              <li v-for="task in week.tasks" :key="task.id">
                <span :class="['task-mark', task.status]"></span>
                <div><strong>{{ task.title }}</strong><small>{{ task.acceptanceCriteria }}</small></div>
              </li>
            </ul>
            <p v-else>本周没有任务。</p>
          </M3Card>
        </div>

        <section v-if="review && review.status !== 'draft'" class="adjustment-section">
          <div class="adjustment-heading">
            <div><h2>调整后续任务</h2><p>勾选需要变更的任务，提交前会再次确认。</p></div>
            <span>{{ selectedAdjustments.length }} 项待应用</span>
          </div>
          <M3Card tag="div" v-if="review.status === 'adjustments_applied'" class="applied-note"><CheckCircle2 :size="20" />本次复盘的计划调整已经应用。</M3Card>
          <M3Card tag="div" v-else-if="adjustments.length" class="adjustment-list">
            <article v-for="item in adjustments" :key="item.task.id" :class="{ selected: item.selected }">
              <label class="task-select"><M3Checkbox v-model="item.selected" :label="`选择任务：${item.task.title}`" /><span><strong>第 {{ item.task.weekNo }} 周 · {{ item.task.title }}</strong><small>当前：{{ item.task.status }}</small></span></label>
              <template v-if="item.selected">
                <M3Select v-model="item.status" >
                  <option value="todo">待开始</option><option value="in_progress">进行中</option><option value="deferred">延期</option><option value="skipped">跳过</option>
                </M3Select>
                <M3TextField v-model="item.reason"  placeholder="调整原因" />
                <M3DateTimePicker v-if="item.status === 'deferred'" v-model="item.deferredTo" />
              </template>
            </article>
            <div class="adjustment-action"><M3Button type="button" :disabled="!selectedAdjustments.length || applying" @click="applyAdjustments">确认并应用调整</M3Button></div>
          </M3Card>
          <M3Card tag="div" v-else class="applied-note">没有可调整的后续任务。</M3Card>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.review-shell { max-width: 1080px; }
.review-header { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding-bottom: 24px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.review-header > div > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }
.review-header h1 { margin: 4px 0; font-size: var(--md-sys-typescale-headline-small-size); }
.review-header p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.review-status { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }
.review-status.submitted, .review-status.adjustments_applied { color: var(--career-sys-color-success); }
.page-state { display: grid; place-items: center; gap: 16px; min-height: 220px; margin-top: 28px; padding: 30px; color: var(--md-sys-color-on-surface-variant); }
.page-state p { margin: 0; }
.week-facts { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 24px; }
.week-facts > div { display: grid; grid-template-columns: 24px 1fr; gap: 4px 10px; padding: 18px; border-right: 1px solid var(--md-sys-color-outline-variant); }
.week-facts > div:last-child { border-right: 0; }
.week-facts svg { grid-row: 1 / 3; color: var(--md-sys-color-primary); }
.week-facts span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.coach-toolbar { display: flex; justify-content: flex-end; margin-top: 18px; }
.review-coach-panel { margin-top: 14px; }
.coach-review-summary { display: grid; grid-template-columns: 90px 1fr; gap: 12px; margin-bottom: 14px; }
.coach-review-summary p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.coach-adjustments { display: grid; gap: 1px; background: var(--md-sys-color-outline-variant); }
.coach-adjustments > div { display: grid; gap: 3px; padding: 11px 0; background: var(--md-sys-color-surface-container-lowest); }
.coach-adjustments span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.coach-adjustments > :last-child { justify-self: end; margin-top: 12px; }
.review-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 28px; align-items: start; margin-top: 30px; }
.review-form { display: grid; gap: 34px; }
.form-section { display: grid; gap: 16px; padding-bottom: 30px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.section-title { display: flex; gap: 10px; color: var(--md-sys-color-primary); }
.section-title h2 { margin: 0; color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-title-medium-size); }
.section-title p { margin: 4px 0 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.trend-field { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 0; padding: 0; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); overflow: hidden; background: var(--md-sys-color-outline-variant); }
.trend-field label { min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--md-sys-color-surface-container-lowest); cursor: pointer; font-size: var(--md-sys-typescale-body-medium-size); }
.trend-field label.active { background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); font-weight: 500; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; }
.week-tasks { position: sticky; top: 88px; padding: 20px; }
.week-tasks h2 { margin: 0 0 14px; font-size: var(--md-sys-typescale-title-medium-size); }
.week-tasks ul { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; background: var(--md-sys-color-outline-variant); }
.week-tasks li { display: grid; grid-template-columns: 9px 1fr; gap: 9px; padding: 12px 0; background: var(--md-sys-color-surface-container-lowest); }
.week-tasks li div { display: grid; gap: 5px; }
.week-tasks small { color: var(--md-sys-color-on-surface-variant); line-height: 1.45; }
.task-mark { width: 8px; height: 8px; margin-top: 4px; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-outline-variant); }
.task-mark.completed { background: var(--career-sys-color-success); }
.task-mark.in_progress { background: var(--career-sys-color-info); }
.task-mark.deferred, .task-mark.skipped { background: var(--md-sys-color-tertiary); }
.adjustment-section { margin-top: 44px; padding-top: 30px; border-top: 1px solid var(--md-sys-color-outline-variant); }
.adjustment-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
.adjustment-heading h2 { margin: 0; font-size: var(--md-sys-typescale-title-large-size); }
.adjustment-heading p { margin: 5px 0 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.adjustment-heading > span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.adjustment-list article { display: grid; grid-template-columns: minmax(220px, 1fr) 160px minmax(180px, 1fr) 190px; gap: 10px; align-items: center; min-height: 62px; padding: 10px 14px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.adjustment-list article:last-of-type { border-bottom: 0; }
.adjustment-list article:not(.selected) { grid-template-columns: 1fr; }
.task-select { display: flex; align-items: center; gap: 10px; min-width: 0; cursor: pointer; }
.task-select span { min-width: 0; display: grid; gap: 3px; }
.task-select strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--md-sys-typescale-body-medium-size); }
.task-select small { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.adjustment-action { display: flex; justify-content: flex-end; padding: 14px; border-top: 1px solid var(--md-sys-color-outline-variant); }
.applied-note { display: flex; align-items: center; gap: 9px; padding: 20px; color: var(--career-sys-color-success); }
@media (max-width: 900px) { .week-facts { grid-template-columns: repeat(2, 1fr); } .week-facts > div:nth-child(2) { border-right: 0; } .week-facts > div:nth-child(-n + 2) { border-bottom: 1px solid var(--md-sys-color-outline-variant); } .review-layout { grid-template-columns: 1fr; } .week-tasks { position: static; } .adjustment-list article { grid-template-columns: 1fr 150px; } }
@media (max-width: 620px) { .review-header { grid-template-columns: 40px 1fr; } .review-status { grid-column: 2; justify-self: start; } .week-facts { grid-template-columns: 1fr; } .week-facts > div { border-right: 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); } .trend-field { grid-template-columns: 1fr; } .form-actions { flex-direction: column-reverse; } .adjustment-heading { align-items: flex-start; flex-direction: column; } .adjustment-list article { grid-template-columns: 1fr; } .coach-review-summary { grid-template-columns: 1fr; } }
</style>
