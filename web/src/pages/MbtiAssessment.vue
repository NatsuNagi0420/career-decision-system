<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, BrainCircuit, Check, CircleAlert } from 'lucide-vue-next'
import { getMbtiQuestionsApi, submitMbtiApi } from '@/api/mbti'
import { M3Button, M3ProgressOverlay } from '@/design-system/components'
import { m3Confirm, m3Message } from '@/design-system/services/feedback'
import { getStoredUser } from '@/utils/session'

defineOptions({ name: 'MbtiAssessmentPage' })

interface MbtiOption {
  id: number
  qId?: number
  optCode: string
  optContent: string
}

interface MbtiQuestion {
  id: number
  qType: string
  content: string
  options: MbtiOption[]
}

const router = useRouter()
const started = ref(false)
const loading = ref(false)
const manualInput = ref('')
const result = ref('')
const questions = ref<MbtiQuestion[]>([])
const answers = ref<Record<number, string>>({})
const currentIndex = ref(0)

const currentQuestion = computed(() => questions.value[currentIndex.value])
const answeredCount = computed(() => Object.keys(answers.value).length)
const progress = computed(() => questions.value.length
  ? Math.round((answeredCount.value / questions.value.length) * 100)
  : 0)
const canSubmit = computed(() => questions.value.length > 0 && answeredCount.value === questions.value.length)

const backToProfile = () => router.push('/profile?section=assessment')

const startAssessment = async () => {
  loading.value = true
  try {
    questions.value = await getMbtiQuestionsApi()
    started.value = true
  } catch {
    m3Message.error('加载题目失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

const submitManual = () => {
  const normalized = manualInput.value.trim().toUpperCase()
  if (!/^[IE][NS][TF][JP]$/.test(normalized)) {
    m3Message.warning('请输入正确的 MBTI 类型，例如 INFP')
    return
  }
  result.value = normalized
  m3Message.success(`已记录 MBTI 类型：${normalized}`)
}

const selectAnswer = (code: string) => {
  const question = currentQuestion.value
  if (!question) return
  answers.value[question.id] = code
}

const next = () => {
  if (!currentQuestion.value || answers.value[currentQuestion.value.id] === undefined) {
    m3Message.warning('请选择当前题目的答案')
    return
  }
  if (currentIndex.value < questions.value.length - 1) currentIndex.value += 1
}

const previous = () => {
  if (currentIndex.value > 0) currentIndex.value -= 1
}

const submitAssessment = async () => {
  if (!canSubmit.value) {
    m3Message.warning('请完成所有题目后再提交')
    return
  }
  try {
    await m3Confirm('提交后将保存本次测评结果，确认提交吗？', '完成 MBTI 测评', {
      confirmButtonText: '提交结果',
      cancelButtonText: '继续检查',
      type: 'info'
    })
  } catch {
    return
  }
  const user = getStoredUser()
  if (!user?.id) {
    m3Message.warning('请先登录后再进行测评')
    await router.push('/login')
    return
  }
  loading.value = true
  try {
    result.value = await submitMbtiApi(answers.value, user.id)
    m3Message.success(`MBTI 测评已完成：${result.value}`)
  } catch {
    m3Message.error('提交失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="product-page">
    <div class="product-shell assessment-shell">
      <header class="assessment-header">
        <M3IconButton label="返回个人档案" @click="backToProfile"><ArrowLeft :size="20" /></M3IconButton>
        <div><span>个人证据工具</span><h1>MBTI 性格测评</h1><p>结果用于辅助整理偏好，不直接决定职业目标。</p></div>
      </header>

      <main class="assessment-surface loading-host">
        <M3ProgressOverlay :visible="loading" label="正在处理测评" />

        <section v-if="result" class="result-state">
          <span class="result-icon"><Check :size="30" /></span>
          <div><span>本次结果</span><strong>{{ result }}</strong><p>可以回到个人档案查看历史结果，并在决策项目中作为一条参考证据。</p></div>
          <M3Button @click="backToProfile">返回个人档案</M3Button>
        </section>

        <section v-else-if="!started" class="intro-state">
          <div class="intro-heading"><span><BrainCircuit :size="28" /></span><div><h2>开始前</h2><p>请选择最符合你通常状态的答案，不需要猜测“更好”的人格类型。</p></div></div>
          <div class="notice-row"><CircleAlert :size="20" /><p>MBTI 反映偏好倾向，不代表能力高低，也不能替代真实经历和岗位验证。</p></div>
          <div class="manual-entry">
            <label class="field-label">已经知道自己的类型<M3TextField v-model="manualInput"  maxlength="4" placeholder="例如 INFP" @keyup.enter="submitManual" /></label>
            <M3Button variant="outlined" @click="submitManual">记录类型</M3Button>
          </div>
          <div class="section-divider"><span>或者</span></div>
          <M3Button class="start-button" @click="startAssessment"><template #icon><BrainCircuit :size="19" /></template>开始完整测评</M3Button>
        </section>

        <section v-else-if="currentQuestion" class="quiz-state">
          <header class="quiz-progress">
            <div><span>第 {{ currentIndex + 1 }} 题，共 {{ questions.length }} 题</span><strong>{{ progress }}%</strong></div>
            <M3LinearProgress class="linear-track" :value="progress / 100" label="MBTI 测评进度" />
          </header>

          <div class="question-copy"><span>选择更接近你的描述</span><h2>{{ currentQuestion.content }}</h2></div>
          <div class="answer-list" role="radiogroup" :aria-label="currentQuestion.content">
            <M3Card
              v-for="option in currentQuestion.options"
              :key="option.id"
              tag="button"
              variant="outlined"
              interactive
              role="radio"
              :aria-checked="answers[currentQuestion.id] === option.optCode"
              :class="{ selected: answers[currentQuestion.id] === option.optCode }"
              @click="selectAnswer(option.optCode)"
            >
              <span class="radio-indicator"><i></i></span>
              <span>{{ option.optContent }}</span>
            </M3Card>
          </div>

          <footer class="quiz-actions">
            <M3Button variant="text" :disabled="currentIndex === 0" @click="previous"><template #icon><ArrowLeft :size="18" /></template>上一题</M3Button>
            <M3Button v-if="currentIndex < questions.length - 1" @click="next">下一题<template #icon><ArrowRight :size="18" /></template></M3Button>
            <M3Button v-else :disabled="!canSubmit" @click="submitAssessment"><template #icon><Check :size="18" /></template>提交测评</M3Button>
          </footer>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.assessment-shell { max-width: 880px; }
.assessment-header { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 16px; align-items: start; margin-bottom: 24px; }
.assessment-header > div > span, .question-copy > span, .result-state > div > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-large-size); font-weight: 500; }
.assessment-header h1 { margin: 3px 0 4px; font-size: var(--md-sys-typescale-headline-medium-size); font-weight: 400; line-height: var(--md-sys-typescale-headline-medium-line-height); }
.assessment-header p { margin: 0; color: var(--md-sys-color-on-surface-variant); }
.assessment-surface { min-height: 520px; border-radius: var(--md-sys-shape-corner-medium); padding: 40px; background: var(--md-sys-color-surface-container-low); }
.intro-state, .quiz-state { display: grid; gap: 28px; max-width: 680px; margin: 0 auto; }
.intro-heading { display: flex; gap: 16px; align-items: center; }
.intro-heading > span, .result-icon { display: grid; width: 56px; height: 56px; flex: 0 0 56px; place-items: center; border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.intro-heading h2, .question-copy h2 { margin: 0; font-size: var(--md-sys-typescale-headline-small-size); font-weight: 400; line-height: var(--md-sys-typescale-headline-small-line-height); }
.intro-heading p, .notice-row p, .question-copy p, .result-state p { margin: 4px 0 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
.notice-row { display: flex; gap: 12px; border-radius: var(--md-sys-shape-corner-medium); padding: 16px; background: var(--career-sys-color-info-container); color: var(--career-sys-color-on-info-container); }
.notice-row p { margin: 0; color: inherit; }
.manual-entry { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: end; }
.section-divider { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; color: var(--md-sys-color-on-surface-variant); }
.section-divider::before, .section-divider::after { content: ''; height: 1px; background: var(--md-sys-color-outline-variant); }
.start-button { justify-self: center; }
.quiz-progress { display: grid; gap: 8px; }
.quiz-progress > div:first-child { display: flex; justify-content: space-between; color: var(--md-sys-color-on-surface-variant); }
.linear-track { width: 100%; }
.question-copy { display: grid; gap: 8px; }
.answer-list { display: grid; gap: 12px; }
.answer-list > * { display: grid; grid-template-columns: 24px minmax(0, 1fr); min-height: 64px; align-items: center; gap: 14px; padding: 12px 16px; text-align: left; }
.answer-list > .selected { border-color: var(--md-sys-color-primary); background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.radio-indicator { display: grid; width: 20px; height: 20px; place-items: center; border: 2px solid currentColor; border-radius: var(--md-sys-shape-corner-full); }
.selected .radio-indicator i { width: 10px; height: 10px; border-radius: var(--md-sys-shape-corner-full); background: currentColor; }
.quiz-actions { display: flex; justify-content: space-between; gap: 12px; padding-top: 20px; border-top: 1px solid var(--md-sys-color-outline-variant); }
.result-state { display: grid; max-width: 560px; min-height: 420px; place-content: center; justify-items: center; gap: 20px; margin: 0 auto; text-align: center; }
.result-state strong { display: block; margin-top: 6px; color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-display-small-size); font-weight: 400; line-height: var(--md-sys-typescale-display-small-line-height); }
@media (max-width: 599px) { .assessment-surface { min-height: 480px; padding: 24px 16px; } .manual-entry { grid-template-columns: 1fr; } .quiz-actions { align-items: stretch; flex-direction: column-reverse; } }
</style>
