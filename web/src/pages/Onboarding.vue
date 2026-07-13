<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Check, Clock3, GraduationCap, Target } from 'lucide-vue-next'
import { m3Message } from '@/design-system/services/feedback'
import { M3ProgressOverlay } from '@/design-system/components'
import { getProfileApi, saveProfileApi } from '@/api/profile'
import { createDecisionProjectApi } from '@/api/decisionProjects'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/utils/formDraft'
import { getStoredUser } from '@/utils/session'

defineOptions({ name: 'OnboardingPage' })

const router = useRouter()
const step = ref(1)
const loading = ref(true)
const saving = ref(false)
const createProject = ref(true)
const profileVersion = ref(1)
const draftReady = ref(false)
const draftUserId = getStoredUser()?.id
const draftScope = 'onboarding'

const form = reactive({
  displayName: '',
  school: '',
  major: '',
  grade: '',
  graduationDate: '',
  city: '',
  currentConfusion: '',
  existingDirectionsText: '',
  weeklyHours: 5,
  projectTitle: '',
  decisionDeadline: ''
})

const steps = [
  { index: 1, label: '基础情况', icon: GraduationCap },
  { index: 2, label: '当前困惑', icon: Target },
  { index: 3, label: '投入与开始', icon: Clock3 }
]

const existingDirections = computed(() =>
  form.existingDirectionsText
    .split(/[，,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
)

const canContinue = computed(() => {
  if (step.value === 1) return !!form.major.trim() && !!form.grade
  if (step.value === 2) return !!form.currentConfusion.trim()
  return form.weeklyHours >= 0
})

onMounted(async () => {
  try {
    const profile = await getProfileApi()
    form.displayName = profile.displayName || ''
    form.school = profile.school || ''
    form.major = profile.major || ''
    form.grade = profile.grade || ''
    form.graduationDate = profile.graduationDate || ''
    form.city = profile.city || ''
    form.currentConfusion = profile.currentConfusion || ''
    form.existingDirectionsText = profile.existingDirections.join('、')
    form.weeklyHours = Math.round((profile.weeklyAvailableMinutes || 300) / 60)
    profileVersion.value = profile.profileVersion
    if (profile.onboardingCompleted) {
      clearFormDraft(draftScope, draftUserId)
      router.replace('/')
      return
    }
    const draft = loadFormDraft<{ form: typeof form; step: number; createProject: boolean }>(draftScope, draftUserId)
    if (draft) {
      Object.assign(form, draft.data.form)
      step.value = Math.max(1, Math.min(3, draft.data.step || 1))
      createProject.value = draft.data.createProject
    }
    draftReady.value = true
  } finally {
    loading.value = false
  }
})

watch([form, step, createProject], () => {
  if (!draftReady.value) return
  saveFormDraft(draftScope, draftUserId, {
    form: { ...form },
    step: step.value,
    createProject: createProject.value
  })
}, { deep: true })

const next = () => {
  if (!canContinue.value) {
    m3Message.warning('请先完成当前步骤的必填项')
    return
  }
  step.value = Math.min(3, step.value + 1)
}

const submit = async () => {
  if (!canContinue.value || saving.value) return
  saving.value = true
  try {
    await saveProfileApi({
      displayName: form.displayName || null,
      identityType: 'student',
      school: form.school || null,
      major: form.major,
      grade: form.grade,
      graduationDate: form.graduationDate || null,
      city: form.city || null,
      currentConfusion: form.currentConfusion,
      existingDirections: existingDirections.value,
      weeklyAvailableMinutes: form.weeklyHours * 60,
      completeOnboarding: true,
      expectedVersion: profileVersion.value
    })

    if (createProject.value) {
      const title = form.projectTitle.trim() || form.currentConfusion.trim().slice(0, 80)
      const project = await createDecisionProjectApi({
        title,
        question: form.currentConfusion.trim(),
        decisionDeadline: form.decisionDeadline || null,
        background: [form.major && `专业：${form.major}`, form.grade && `年级：${form.grade}`]
          .filter(Boolean)
          .join('；'),
        priorities: [],
        mustHaves: [],
        dealBreakers: []
      })
      m3Message.success('基础档案与第一个决策项目已建立')
      clearFormDraft(draftScope, draftUserId)
      router.replace(`/decision-projects/${project.id}`)
      return
    }

    m3Message.success('基础档案已保存')
    clearFormDraft(draftScope, draftUserId)
    router.replace('/')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="onboarding-page product-page">
    <div class="onboarding-shell">
      <header class="onboarding-header">
        <span class="brand">职途</span>
        <span class="muted">约 5 分钟</span>
      </header>

      <nav class="step-nav" aria-label="引导进度">
        <div v-for="item in steps" :key="item.index" class="step-item" :class="{ active: step === item.index, done: step > item.index }">
          <span class="step-mark">
            <Check v-if="step > item.index" :size="16" />
            <component :is="item.icon" v-else :size="17" />
          </span>
          <span>{{ item.label }}</span>
        </div>
      </nav>

      <M3Card tag="main" class="onboarding-panel loading-host">
        <M3ProgressOverlay :visible="loading" label="正在加载引导信息" />
        <section v-if="step === 1" class="step-content">
          <div class="step-heading">
            <span>1 / 3</span>
            <h1>先了解你的当前阶段</h1>
            <p>只收集完成第一次职业决策需要的基础信息，其他内容以后再补。</p>
          </div>

          <div class="form-grid two-columns">
            <label class="field-label">称呼（选填）
              <M3TextField v-model="form.displayName"  placeholder="希望我们怎么称呼你" />
            </label>
            <label class="field-label">学校（选填）
              <M3TextField v-model="form.school"  placeholder="所在学校" />
            </label>
            <label class="field-label">专业 <span class="required">必填</span>
              <M3TextField v-model="form.major"  placeholder="例如：软件工程" />
            </label>
            <label class="field-label">当前年级 <span class="required">必填</span>
              <M3Select v-model="form.grade" >
                <option value="" disabled>请选择</option>
                <option>大一</option><option>大二</option><option>大三</option><option>大四</option>
                <option>研一</option><option>研二</option><option>研三</option><option>已毕业</option>
              </M3Select>
            </label>
            <label class="field-label">预计毕业时间（选填）
              <M3DatePicker v-model="form.graduationDate" />
            </label>
            <label class="field-label">所在城市（选填）
              <M3TextField v-model="form.city"  placeholder="例如：杭州" />
            </label>
          </div>
        </section>

        <section v-else-if="step === 2" class="step-content">
          <div class="step-heading">
            <span>2 / 3</span>
            <h1>你现在最需要做什么决定？</h1>
            <p>把大问题缩小到未来几个月可以验证的选择。</p>
          </div>

          <label class="field-label">当前困惑 <span class="required">必填</span>
            <M3TextArea v-model="form.currentConfusion" class="confusion-input" placeholder="例如：未来三个月，我应该优先准备 Java 后端还是数据分析？"></M3TextArea>
          </label>
          <label class="field-label">已经想到的方向（选填，最多 5 个）
            <M3TextField v-model="form.existingDirectionsText"  placeholder="用逗号分隔，例如：Java 后端、数据分析" />
          </label>

          <div class="example-block">
            <strong>更容易执行的表达</strong>
            <span>“我以后做什么”</span>
            <ArrowRight :size="16" />
            <span>“未来三个月优先验证哪两个方向”</span>
          </div>
        </section>

        <section v-else class="step-content">
          <div class="step-heading">
            <span>3 / 3</span>
            <h1>确定可投入时间，然后开始</h1>
            <p>计划会按你的真实时间安排，不用一开始就承诺很多。</p>
          </div>

          <label class="field-label hours-field">每周大约可投入
            <div class="hours-control">
              <M3IconButton label="减少一小时" variant="outlined" @click="form.weeklyHours = Math.max(0, form.weeklyHours - 1)">−</M3IconButton>
              <strong>{{ form.weeklyHours }} 小时</strong>
              <M3IconButton label="增加一小时" variant="outlined" @click="form.weeklyHours = Math.min(40, form.weeklyHours + 1)">＋</M3IconButton>
            </div>
          </label>

          <label class="project-option">
            <M3Checkbox v-model="createProject" label="同时创建第一个决策项目" />
            <span><strong>同时创建第一个决策项目</strong><small>推荐。创建后直接进入五阶段决策工作区。</small></span>
          </label>

          <div v-if="createProject" class="form-grid two-columns compact-fields">
            <label class="field-label">项目标题（选填）
              <M3TextField v-model="form.projectTitle"  placeholder="默认使用当前困惑" />
            </label>
            <label class="field-label">希望何时做出决定（选填）
              <M3DatePicker v-model="form.decisionDeadline" />
            </label>
          </div>
        </section>

        <footer class="panel-actions">
          <M3Button v-if="step > 1" variant="outlined" type="button" @click="step--">
            <ArrowLeft :size="17" />上一步
          </M3Button>
          <span v-else></span>
          <M3Button v-if="step < 3" type="button" :disabled="!canContinue" @click="next">
            下一步<ArrowRight :size="17" />
          </M3Button>
          <M3Button v-else type="button" :disabled="saving" @click="submit">
            <Check :size="17" />{{ saving ? '正在保存' : '完成并开始' }}
          </M3Button>
        </footer>
      </M3Card>
    </div>
  </div>
</template>

<style scoped>
.onboarding-page { background: color-mix(in srgb, var(--md-sys-color-surface) var(--career-background-canvas-tint-opacity), transparent); }
.onboarding-shell { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 64px; }
.onboarding-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.brand { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-title-large-size); font-weight: 500; }
.step-nav { display: grid; grid-template-columns: repeat(3, 1fr); margin-bottom: 16px; }
.step-item { display: flex; align-items: center; gap: 8px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.step-item::after { content: ''; height: 1px; flex: 1; background: var(--md-sys-color-outline-variant); }
.step-item:last-child::after { display: none; }
.step-item.active, .step-item.done { color: var(--md-sys-color-primary); }
.step-mark { display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container-lowest); }
.step-item.active .step-mark, .step-item.done .step-mark { border-color: var(--md-sys-color-primary); background: var(--md-sys-color-surface-container); }
.onboarding-panel { min-height: 500px; padding: 34px; }
.step-content { display: grid; gap: 24px; }
.step-heading span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-medium-size); font-weight: 500; }
.step-heading h1 { margin: 8px 0; font-size: var(--md-sys-typescale-headline-medium-size); letter-spacing: 0; }
.step-heading p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
.form-grid { display: grid; gap: 18px; }
.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.required { margin-left: 4px; color: var(--md-sys-color-error); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }
.confusion-input { min-height: 140px; }
.example-block { display: grid; grid-template-columns: auto 1fr auto 1fr; align-items: center; gap: 12px; border-left: 3px solid var(--md-sys-color-tertiary); background: color-mix(in srgb, var(--md-sys-color-tertiary) 8%, var(--md-sys-color-surface-container-lowest)); padding: 16px; font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.example-block strong { grid-column: 1 / -1; }
.hours-field { max-width: 360px; }
.hours-control { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; gap: 12px; }
.hours-control strong { text-align: center; font-size: var(--md-sys-typescale-title-large-size); }
.project-option { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); padding: 16px; cursor: pointer; }
.project-option span { display: grid; gap: 5px; }
.project-option small { color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
.compact-fields { padding-top: 4px; }
.panel-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 36px; padding-top: 22px; border-top: 1px solid var(--md-sys-color-outline-variant); }
@media (max-width: 620px) {
  .onboarding-shell { padding-top: 18px; }
  .step-item span:last-child { display: none; }
  .onboarding-panel { min-height: 0; padding: 24px 18px; }
  .two-columns { grid-template-columns: 1fr; }
  .example-block { grid-template-columns: 1fr; }
  .example-block svg { transform: rotate(90deg); }
}
</style>
