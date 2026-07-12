<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, Check, Circle,
  Clock3, ExternalLink, FileCheck2, ListChecks, MoreHorizontal, Pause, Pencil,
  Plus, RotateCcw, SkipForward, Sparkles, Trash2
} from 'lucide-vue-next'
import { m3Confirm, m3Message } from '@/design-system/services/feedback'
import { M3Dialog, M3ProgressOverlay } from '@/design-system/components'
import AgentInsightPanel from '@/components/AgentInsightPanel.vue'
import { coachActionPlanApi, type ActionCoachResponse, type TaskSuggestion } from '@/api/coaching'
import {
  addActionTaskApi,
  addTaskResultApi,
  deleteActionTaskApi,
  getActionPlanApi,
  reorderActionTasksApi,
  updateActionTaskApi,
  updateActionTaskStatusApi,
  type ActionPlan,
  type ActionTask,
  type TaskStatus,
  type TaskType
} from '@/api/actionPlans'

defineOptions({ name: 'ActionPlanWorkspacePage' })

const route = useRoute()
const router = useRouter()
const plan = ref<ActionPlan | null>(null)
const loading = ref(true)
const activeTab = ref<'week' | 'all' | 'results'>('week')
const selectedWeek = ref(1)
const busyTaskId = ref<number | null>(null)
const showTaskDialog = ref(false)
const showResultDialog = ref(false)
const showStatusDialog = ref(false)
const editingTask = ref<ActionTask | null>(null)
const activeTask = ref<ActionTask | null>(null)
const statusAction = ref<'deferred' | 'skipped'>('deferred')
const coachLoading = ref(false)
const actionCoach = ref<ActionCoachResponse | null>(null)

const taskForm = reactive({
  weekNo: 1, title: '', taskType: 'custom' as TaskType, content: '', dueAt: '',
  estimatedMinutes: 60, acceptanceCriteria: '', sortOrder: 0
})
const resultForm = reactive({ description: '', linkUrl: '' })
const statusForm = reactive({ reason: '', deferredTo: '' })

const planId = computed(() => Number(route.params.id))
const currentWeek = computed(() => {
  if (!plan.value) return 1
  const start = new Date(`${plan.value.startDate}T00:00:00`)
  const days = Math.floor((Date.now() - start.getTime()) / 86400000)
  return Math.max(1, Math.min(plan.value.durationWeeks, Math.floor(Math.max(0, days) / 7) + 1))
})
const selectedWeekData = computed(() => plan.value?.weeks.find((week) => week.weekNo === selectedWeek.value))
const allResults = computed(() => plan.value?.weeks.flatMap((week) =>
  week.tasks.flatMap((task) => task.results.map((result) => ({ ...result, task, weekNo: week.weekNo })))
) || [])

const statusLabels: Record<TaskStatus, string> = {
  todo: '待开始', in_progress: '进行中', completed: '已完成', deferred: '已延期', skipped: '已跳过'
}
const typeLabels: Record<TaskType, string> = {
  career_research: '了解职业', skill_learning: '学习技能', project: '完成项目', resume: '完善简历',
  networking: '建立联系', interview: '准备面试', application: '投递实践', custom: '自定义'
}

const load = async () => {
  loading.value = true
  try {
    plan.value = await getActionPlanApi(planId.value)
    selectedWeek.value = currentWeek.value
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)

const formatTime = (value: string | null) => {
  if (!value) return '未设置'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

const applyStatus = async (task: ActionTask, status: TaskStatus, extra?: { reason?: string; deferredTo?: string }) => {
  if (!plan.value) return
  busyTaskId.value = task.id
  try {
    plan.value = await updateActionTaskStatusApi(plan.value.id, task.id, {
      status,
      reason: extra?.reason,
      deferredTo: extra?.deferredTo,
      expectedVersion: task.version,
      requestId: `web-task-${task.id}-${status}-${crypto.randomUUID()}`
    })
    return true
  } catch (error) {
    if (error instanceof Error && error.message.includes('其他设备')) {
      await load()
      m3Message.info('已加载最新任务，请确认状态后重试')
    }
    return false
  } finally {
    busyTaskId.value = null
  }
}

const startTask = (task: ActionTask) => applyStatus(task, 'in_progress')
const restoreTask = (task: ActionTask) => applyStatus(task, 'todo')

const completeTask = async (task: ActionTask) => {
  if (!await applyStatus(task, 'completed')) return
  activeTask.value = task
  Object.assign(resultForm, { description: '', linkUrl: '' })
  showResultDialog.value = true
}

const openStatus = (task: ActionTask, action: 'deferred' | 'skipped') => {
  activeTask.value = task
  statusAction.value = action
  Object.assign(statusForm, {
    reason: '',
    deferredTo: action === 'deferred' ? new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16) : ''
  })
  showStatusDialog.value = true
}

const submitStatus = async () => {
  if (!activeTask.value || !statusForm.reason.trim()) {
    m3Message.warning('请填写原因')
    return
  }
  const saved = await applyStatus(activeTask.value, statusAction.value, {
    reason: statusForm.reason.trim(),
    deferredTo: statusAction.value === 'deferred' ? statusForm.deferredTo : undefined
  })
  if (!saved) return
  showStatusDialog.value = false
}

const submitResult = async () => {
  if (!plan.value || !activeTask.value || !resultForm.description.trim()) {
    m3Message.warning('请填写成果说明')
    return
  }
  plan.value = await addTaskResultApi(plan.value.id, activeTask.value.id, {
    description: resultForm.description.trim(),
    linkUrl: resultForm.linkUrl || undefined
  })
  showResultDialog.value = false
  m3Message.success('成果已记录')
}

const openTaskEditor = (task?: ActionTask, weekNo?: number) => {
  editingTask.value = task || null
  Object.assign(taskForm, task ? {
    weekNo: task.weekNo,
    title: task.title,
    taskType: task.taskType,
    content: task.content,
    dueAt: task.dueAt?.slice(0, 16) || '',
    estimatedMinutes: task.estimatedMinutes || 60,
    acceptanceCriteria: task.acceptanceCriteria,
    sortOrder: task.sortOrder
  } : {
    weekNo: weekNo || selectedWeek.value,
    title: '', taskType: 'custom', content: '', dueAt: '', estimatedMinutes: 60,
    acceptanceCriteria: '', sortOrder: selectedWeekData.value?.tasks.length || 0
  })
  showTaskDialog.value = true
}

const saveTask = async () => {
  if (!plan.value || !taskForm.title.trim() || !taskForm.acceptanceCriteria.trim()) {
    m3Message.warning('任务标题和验收标准不能为空')
    return
  }
  const payload = {
    weekNo: taskForm.weekNo,
    title: taskForm.title.trim(),
    taskType: taskForm.taskType,
    content: taskForm.content || taskForm.title.trim(),
    dueAt: taskForm.dueAt || null,
    estimatedMinutes: taskForm.estimatedMinutes,
    acceptanceCriteria: taskForm.acceptanceCriteria.trim(),
    sortOrder: taskForm.sortOrder,
    ...(editingTask.value ? { expectedVersion: editingTask.value.version } : {})
  }
  try {
    plan.value = editingTask.value
      ? await updateActionTaskApi(plan.value.id, editingTask.value.id, {
          ...payload,
          expectedVersion: editingTask.value.version
        })
      : await addActionTaskApi(plan.value.id, payload)
  } catch (error) {
    if (error instanceof Error && error.message.includes('其他设备')) {
      showTaskDialog.value = false
      await load()
      m3Message.info('已加载最新任务，请重新编辑')
    }
    return
  }
  showTaskDialog.value = false
  m3Message.success(editingTask.value ? '任务已更新' : '任务已添加')
}

const removeTask = async (task: ActionTask) => {
  if (!plan.value) return
  await m3Confirm(`删除任务“${task.title}”？变更记录仍会保留。`, '删除任务', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
  })
  try {
    plan.value = await deleteActionTaskApi(plan.value.id, task.id, task.version)
  } catch (error) {
    if (error instanceof Error && error.message.includes('其他设备')) {
      await load()
      m3Message.info('任务已在其他设备变化，请确认最新内容后重试')
    }
  }
}

const moveTask = async (task: ActionTask, direction: -1 | 1) => {
  if (!plan.value) return
  const week = plan.value.weeks.find((item) => item.weekNo === task.weekNo)
  if (!week) return
  const tasks = [...week.tasks]
  const index = tasks.findIndex((item) => item.id === task.id)
  const target = index + direction
  if (target < 0 || target >= tasks.length) return
  ;[tasks[index], tasks[target]] = [tasks[target]!, tasks[index]!]
  try {
    plan.value = await reorderActionTasksApi(plan.value.id, tasks)
  } catch (error) {
    if (error instanceof Error && error.message.includes('其他设备')) {
      await load()
      m3Message.info('任务顺序已在其他设备变化，请重新排序')
    }
  }
}

const requestActionCoach = async () => {
  if (!plan.value) return
  coachLoading.value = true
  try {
    actionCoach.value = await coachActionPlanApi(plan.value.id)
  } finally {
    coachLoading.value = false
  }
}

const addSuggestedTask = async (suggestion: TaskSuggestion) => {
  if (!plan.value) return
  await m3Confirm(
    `把“${suggestion.title}”加入第 ${suggestion.weekNo} 周？加入后仍可编辑或删除。`,
    '确认 AI 任务建议',
    { confirmButtonText: '确认加入', cancelButtonText: '取消', type: 'warning' }
  )
  const targetWeek = plan.value.weeks.find((week) => week.weekNo === suggestion.weekNo)
  plan.value = await addActionTaskApi(plan.value.id, {
    weekNo: suggestion.weekNo,
    title: suggestion.title,
    taskType: suggestion.taskType,
    content: suggestion.content,
    dueAt: null,
    estimatedMinutes: suggestion.estimatedMinutes,
    acceptanceCriteria: suggestion.acceptanceCriteria,
    sortOrder: targetWeek?.tasks.length || 0
  })
  m3Message.success('任务已加入行动计划')
}

const openWeeklyReview = () => router.push(`/weekly-reviews/new?planId=${plan.value?.id}&weekNo=${selectedWeek.value}`)
</script>

<template>
  <div class="product-page">
    <div class="action-shell">
      <header class="action-header">
        <M3IconButton class="back-button" label="返回计划列表" @click="router.push('/action-plans')"><ArrowLeft :size="19" /></M3IconButton>
        <div><span>行动计划</span><h1>{{ plan?.targetRole || '加载中' }}</h1><p v-if="plan">{{ plan.startDate }} 至 {{ plan.endDate }} · {{ plan.durationWeeks }} 周</p></div>
        <div v-if="plan" class="overall-progress"><strong>{{ plan.progressPercent }}%</strong><span>{{ plan.completedTaskCount }} / {{ plan.taskCount }} 个任务</span><M3LinearProgress :value="plan.progressPercent / 100" label="行动计划完成进度" /></div>
      </header>

      <M3Tabs class="workspace-tabs" aria-label="行动计划视图">
        <M3Tab :active="activeTab === 'week'" @click="activeTab = 'week'"><template #icon><ListChecks :size="17" /></template>本周</M3Tab>
        <M3Tab :active="activeTab === 'all'" @click="activeTab = 'all'"><template #icon><CalendarClock :size="17" /></template>全局</M3Tab>
        <M3Tab :active="activeTab === 'results'" @click="activeTab = 'results'"><template #icon><FileCheck2 :size="17" /></template>成果</M3Tab>
      </M3Tabs>

      <div v-if="plan" class="coach-toolbar"><M3Button variant="outlined" type="button" :disabled="coachLoading" @click="requestActionCoach"><Sparkles :size="16" />{{ coachLoading ? '正在生成建议' : '请 AI 行动教练建议' }}</M3Button></div>
      <AgentInsightPanel v-if="actionCoach" class="action-coach-panel" :result="actionCoach" title="行动教练建议">
        <div class="suggested-task-list">
          <article v-for="suggestion in actionCoach.taskSuggestions" :key="`${suggestion.weekNo}-${suggestion.title}`">
            <div><span>第 {{ suggestion.weekNo }} 周 · {{ typeLabels[suggestion.taskType] }}</span><strong>{{ suggestion.title }}</strong><p>{{ suggestion.content }}</p><small>验收：{{ suggestion.acceptanceCriteria }} · {{ suggestion.estimatedMinutes }} 分钟</small></div>
            <M3Button variant="outlined" type="button" @click="addSuggestedTask(suggestion)"><Plus :size="15" />确认加入</M3Button>
          </article>
        </div>
      </AgentInsightPanel>

      <main class="action-content loading-host">
        <M3ProgressOverlay :visible="loading" label="正在加载行动计划" />
        <template v-if="plan && activeTab === 'week'">
          <aside class="week-sidebar">
            <M3Card v-for="week in plan.weeks" :key="week.id" tag="button" variant="filled" interactive :class="{ active: selectedWeek === week.weekNo }" @click="selectedWeek = week.weekNo">
              <span>第 {{ week.weekNo }} 周<i v-if="week.weekNo === currentWeek">当前</i></span>
              <strong>{{ week.tasks.filter((task) => task.status === 'completed').length }}/{{ week.tasks.length }}</strong>
            </M3Card>
          </aside>

          <section class="week-main">
            <header class="week-header"><div><span>第 {{ selectedWeek }} 周目标</span><h2>{{ selectedWeekData?.goal }}</h2></div><div><M3Button variant="outlined" type="button" @click="openTaskEditor(undefined, selectedWeek)"><Plus :size="16" />添加任务</M3Button><M3Button type="button" @click="openWeeklyReview">本周复盘<ArrowRight :size="16" /></M3Button></div></header>
            <div class="task-list">
              <M3Card tag="article" v-for="task in selectedWeekData?.tasks" :key="task.id" class="task-card" :class="`status-${task.status}`">
                <div class="status-icon"><Check v-if="task.status === 'completed'" :size="18" /><Pause v-else-if="task.status === 'in_progress'" :size="18" /><SkipForward v-else-if="task.status === 'skipped'" :size="18" /><CalendarClock v-else-if="task.status === 'deferred'" :size="18" /><Circle v-else :size="18" /></div>
                <div class="task-copy"><div class="task-meta"><span>{{ typeLabels[task.taskType] }}</span><span>{{ statusLabels[task.status] }}</span><span><Clock3 :size="13" />{{ task.estimatedMinutes || '?' }} 分钟</span></div><h3>{{ task.title }}</h3><p>{{ task.content }}</p><div class="acceptance"><strong>验收</strong><span>{{ task.acceptanceCriteria }}</span></div><div v-if="task.dueAt || task.deferredTo" class="time-row"><span>截止：{{ formatTime(task.dueAt) }}</span><span v-if="task.deferredTo">延期至：{{ formatTime(task.deferredTo) }}</span></div></div>
                <div class="task-actions">
                  <M3Button variant="outlined" v-if="task.status === 'todo' || task.status === 'deferred'" class="compact" type="button" :disabled="busyTaskId === task.id" @click="startTask(task)">开始</M3Button>
                  <M3Button v-if="task.status === 'in_progress'" class="compact" type="button" :disabled="busyTaskId === task.id" @click="completeTask(task)"><Check :size="14" />完成</M3Button>
                  <M3IconButton v-if="task.status !== 'completed' && task.status !== 'skipped'" class="small-icon" label="延期" @click="openStatus(task, 'deferred')"><CalendarClock :size="16" /></M3IconButton>
                  <M3IconButton v-if="task.status !== 'completed' && task.status !== 'skipped'" class="small-icon" label="跳过" @click="openStatus(task, 'skipped')"><SkipForward :size="16" /></M3IconButton>
                  <M3IconButton v-if="task.status === 'completed' || task.status === 'skipped'" class="small-icon" label="恢复待办" @click="restoreTask(task)"><RotateCcw :size="16" /></M3IconButton>
                  <M3IconButton class="small-icon" label="编辑任务" @click="openTaskEditor(task)"><Pencil :size="16" /></M3IconButton>
                </div>
              </M3Card>
              <M3Card tag="p" v-if="!selectedWeekData?.tasks.length" class="empty-tasks">本周还没有任务。</M3Card>
            </div>
          </section>
        </template>

        <section v-else-if="plan && activeTab === 'all'" class="all-weeks">
          <article v-for="week in plan.weeks" :key="week.id" class="week-band">
            <header><div><span>第 {{ week.weekNo }} 周</span><h2>{{ week.goal }}</h2></div><M3IconButton label="本周添加任务" @click="openTaskEditor(undefined, week.weekNo)"><Plus :size="18" /></M3IconButton></header>
            <div class="global-task-list">
              <div v-for="(task, index) in week.tasks" :key="task.id" class="global-task-row">
                <span class="status-dot" :class="task.status"></span><div><strong>{{ task.title }}</strong><span>{{ typeLabels[task.taskType] }} · {{ statusLabels[task.status] }} · {{ task.estimatedMinutes || '?' }} 分钟</span></div>
                <div class="global-actions"><M3IconButton label="上移" :disabled="index === 0" @click="moveTask(task, -1)"><ArrowUp :size="15" /></M3IconButton><M3IconButton label="下移" :disabled="index === week.tasks.length - 1" @click="moveTask(task, 1)"><ArrowDown :size="15" /></M3IconButton><M3IconButton label="编辑任务" @click="openTaskEditor(task)"><Pencil :size="15" /></M3IconButton><M3IconButton class="destructive-icon" label="删除任务" @click="removeTask(task)"><Trash2 :size="15" /></M3IconButton></div>
              </div>
            </div>
          </article>
        </section>

        <section v-else-if="plan" class="results-view">
          <header><div><h2>任务成果</h2><p>项目、链接和说明会成为后续职业决策可复用的个人证据。</p></div><span>{{ allResults.length }} 条</span></header>
          <div v-if="allResults.length" class="result-list">
            <M3Card tag="article" v-for="result in allResults" :key="result.id" class="result-row"><div class="result-week">W{{ result.weekNo }}</div><div><span>{{ result.task.title }}</span><p>{{ result.description }}</p><a v-if="result.linkUrl" :href="result.linkUrl" target="_blank" rel="noopener noreferrer">查看成果<ExternalLink :size="14" /></a></div><span>{{ result.verificationStatus === 'unverified' ? '待验证' : result.verificationStatus }}</span></M3Card>
          </div>
          <M3Card tag="div" v-else class="empty-results"><FileCheck2 :size="28" /><strong>还没有任务成果</strong><span>完成关键任务时，可以填写成果说明和链接。</span></M3Card>
        </section>
      </main>
    </div>

    <M3Dialog v-model="showTaskDialog" :title="editingTask ? '编辑任务' : '添加任务'">
      <div class="dialog-grid two-columns"><label class="field-label">周次<M3Select v-model.number="taskForm.weekNo" ><option v-for="week in plan?.weeks" :key="week.weekNo" :value="week.weekNo">第 {{ week.weekNo }} 周</option></M3Select></label><label class="field-label">任务类型<M3Select v-model="taskForm.taskType" ><option v-for="(label, type) in typeLabels" :key="type" :value="type">{{ label }}</option></M3Select></label><label class="field-label full-column">任务标题<M3TextField v-model="taskForm.title"  /></label><label class="field-label full-column">具体动作<M3TextArea v-model="taskForm.content" class="small-textarea"></M3TextArea></label><label class="field-label">截止时间<M3DateTimePicker v-model="taskForm.dueAt" /></label><label class="field-label">预计耗时（分钟）<M3TextField v-model.number="taskForm.estimatedMinutes"  type="number" min="5" /></label><label class="field-label full-column">验收标准<M3TextArea v-model="taskForm.acceptanceCriteria" class="small-textarea"></M3TextArea></label></div>
      <template #actions><M3Button variant="outlined" type="button" @click="showTaskDialog = false">取消</M3Button><M3Button type="button" @click="saveTask"><Save :size="16" />保存任务</M3Button></template>
    </M3Dialog>

    <M3Dialog v-model="showResultDialog" title="记录任务成果">
      <div class="dialog-grid"><p class="dialog-note">任务已完成。没有成果也可以关闭，之后再补充。</p><label class="field-label">成果说明<M3TextArea v-model="resultForm.description"  placeholder="做了什么，得到什么结果，学到了什么"></M3TextArea></label><label class="field-label">成果链接（选填）<M3TextField v-model="resultForm.linkUrl"  type="url" placeholder="https://" /></label></div>
      <template #actions><M3Button variant="outlined" type="button" @click="showResultDialog = false">稍后填写</M3Button><M3Button type="button" @click="submitResult">保存成果</M3Button></template>
    </M3Dialog>

    <M3Dialog v-model="showStatusDialog" :title="statusAction === 'deferred' ? '延期任务' : '跳过任务'">
      <div class="dialog-grid"><label class="field-label">原因<M3TextArea v-model="statusForm.reason" class="small-textarea"></M3TextArea></label><label v-if="statusAction === 'deferred'" class="field-label">延期到<M3DateTimePicker v-model="statusForm.deferredTo" /></label></div>
      <template #actions><M3Button variant="outlined" type="button" @click="showStatusDialog = false">取消</M3Button><M3Button type="button" @click="submitStatus">确认</M3Button></template>
    </M3Dialog>
  </div>
</template>

<style scoped>
.action-shell { width: min(1240px, calc(100% - 48px)); margin: 0 auto; padding: 24px 0 72px; }
.action-header { display: grid; grid-template-columns: 48px minmax(0, 1fr) 240px; align-items: center; gap: 14px; }
.action-header > div > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }.action-header h1 { margin: 3px 0; font-size: var(--md-sys-typescale-title-large-size); }.action-header p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.overall-progress { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 6px 10px; }.overall-progress strong { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-title-large-size); }.overall-progress span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }.overall-progress > :last-child { grid-column: 1 / -1; }
.workspace-tabs { margin-top: 22px; }
.coach-toolbar { display: flex; justify-content: flex-end; margin-top: 16px; }
.action-coach-panel { margin-top: 14px; }
.suggested-task-list { display: grid; gap: 1px; background: var(--md-sys-color-outline-variant); }
.suggested-task-list article { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 13px 0; background: var(--md-sys-color-surface-container-lowest); }
.suggested-task-list article > div { display: grid; gap: 4px; min-width: 0; }
.suggested-task-list span, .suggested-task-list small { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.suggested-task-list p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.action-content { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 22px; margin-top: 20px; align-items: start; }.week-sidebar { display: grid; gap: 2px; overflow: hidden; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-surface-container-low); }.week-sidebar > * { width: 100%; min-height: 52px; display: flex; align-items: center; justify-content: space-between; border-radius: var(--md-sys-shape-corner-none); padding: 0 13px; text-align: left; }.week-sidebar > .active { border-left: 3px solid var(--md-sys-color-primary); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }.week-sidebar span { display: flex; align-items: center; gap: 5px; font-size: var(--md-sys-typescale-body-small-size); }.week-sidebar i { border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); padding: 2px 4px; font-size: var(--md-sys-typescale-label-small-size); font-style: normal; }.week-sidebar strong { font-size: var(--md-sys-typescale-body-small-size); }
.week-main { min-width: 0; }.week-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 16px; }.week-header span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); font-weight: 500; }.week-header h2 { margin: 4px 0 0; font-size: var(--md-sys-typescale-title-large-size); }.week-header > div:last-child { display: flex; gap: 8px; }
.task-list { display: grid; gap: 10px; }.task-card { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 12px; padding: 17px; border-left: 3px solid var(--md-sys-color-outline-variant); }.task-card.status-in_progress { border-left-color: var(--career-sys-color-info); }.task-card.status-completed { border-left-color: var(--career-sys-color-success); }.task-card.status-deferred { border-left-color: var(--md-sys-color-tertiary); }.task-card.status-skipped { opacity: .72; }
.status-icon { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); }.task-copy { min-width: 0; }.task-meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }.task-meta span { display: inline-flex; align-items: center; gap: 3px; }.task-copy h3 { margin: 6px 0; font-size: var(--md-sys-typescale-title-medium-size); }.task-copy > p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.55; }.acceptance { display: grid; grid-template-columns: 44px 1fr; gap: 6px; margin-top: 10px; border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-surface-container); padding: 8px; font-size: var(--md-sys-typescale-label-small-size); line-height: 1.5; }.acceptance strong { color: var(--md-sys-color-primary); }.time-row { display: flex; gap: 12px; margin-top: 8px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.task-actions { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 210px; }.compact { min-height: 32px; padding: 0 10px; font-size: var(--md-sys-typescale-body-small-size); }.small-icon { width: 32px; height: 32px; min-height: 32px; }
.empty-tasks { padding: 40px; color: var(--md-sys-color-on-surface-variant); text-align: center; }
.all-weeks, .results-view { grid-column: 1 / -1; }.all-weeks { display: grid; gap: 28px; }.week-band > header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 10px; }.week-band header span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }.week-band h2 { margin: 4px 0 0; font-size: var(--md-sys-typescale-title-medium-size); }
.global-task-list { border-top: 1px solid var(--md-sys-color-outline-variant); }.global-task-row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 58px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }.status-dot { width: 8px; height: 8px; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-outline-variant); }.status-dot.completed { background: var(--career-sys-color-success); }.status-dot.in_progress { background: var(--career-sys-color-info); }.status-dot.deferred { background: var(--md-sys-color-tertiary); }.global-task-row > div:nth-child(2) { display: grid; gap: 4px; }.global-task-row span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }.global-actions { display: flex; gap: 4px; }.destructive-icon { --md-icon-button-icon-color: var(--md-sys-color-error); }
.results-view > header { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 18px; }.results-view h2 { margin: 0; }.results-view header p { margin: 5px 0 0; color: var(--md-sys-color-on-surface-variant); }.results-view header > span { color: var(--md-sys-color-primary); font-weight: 500; }.result-list { display: grid; gap: 10px; }.result-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 14px; padding: 16px; }.result-week { display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); font-weight: 500; }.result-row > div:nth-child(2) { display: grid; gap: 5px; }.result-row p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }.result-row a { display: inline-flex; align-items: center; gap: 4px; color: var(--md-sys-color-primary); text-decoration: none; font-size: var(--md-sys-typescale-body-small-size); }.result-row > span { color: var(--md-sys-color-tertiary); font-size: var(--md-sys-typescale-label-small-size); }.empty-results { display: flex; min-height: 300px; align-items: center; justify-content: center; flex-direction: column; gap: 9px; color: var(--md-sys-color-on-surface-variant); }.empty-results span { font-size: var(--md-sys-typescale-body-small-size); }
.dialog-grid { display: grid; gap: 16px; }.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }.full-column { grid-column: 1 / -1; }.small-textarea { min-height: 80px; }.dialog-note { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
@media (max-width: 900px) { .action-header { grid-template-columns: 48px 1fr; }.overall-progress { grid-column: 2; }.action-content { grid-template-columns: 1fr; }.week-sidebar { display: flex; overflow-x: auto; }.week-sidebar > * { min-width: 120px; }.week-sidebar > .active { border-bottom: 3px solid var(--md-sys-color-primary); border-left: 0; } }
@media (max-width: 680px) { .action-shell { width: min(100% - 24px, 1240px); }.week-header { align-items: flex-start; flex-direction: column; }.task-card { grid-template-columns: 28px 1fr; }.task-actions { grid-column: 1 / -1; justify-content: flex-start; max-width: none; }.two-columns { grid-template-columns: 1fr; }.full-column { grid-column: auto; }.result-row { grid-template-columns: 40px 1fr; }.result-row > span { grid-column: 2; }.suggested-task-list article { align-items: stretch; flex-direction: column; } }
</style>
