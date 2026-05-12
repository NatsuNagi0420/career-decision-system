<!--
  页面：MBTI 性格测评（/assessment/mbti）
  职责：提供完整的 MBTI 测评问卷，支持手动输入已知类型或完成测评
  使用 FormPageLayout 布局模板
-->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import Cookies from 'js-cookie'
import FormPageLayout from '@/components/layouts/FormPageLayout.vue'
import MbtiNotice from '@/components/mbti/MbtiNotice.vue'
import MbtiProgress from '@/components/mbti/MbtiProgress.vue'
import MbtiQuestionCard from '@/components/mbti/MbtiQuestionCard.vue'
import MbtiNavigation from '@/components/mbti/MbtiNavigation.vue'
import request from '@/utils/request'

defineOptions({
  name: 'MbtiAssessmentPage'
})

const router = useRouter()

// 测评状态
const mbtiStarted = ref(false)
const mbtiManualInput = ref('')
const mbtiResult = ref<string | null>(null)
const isSubmitting = ref(false)

// 题目数据
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

const questions = ref<MbtiQuestion[]>([])
const answers = ref<Record<number, string>>({})
const currentQuestionIndex = ref(0)

// 当前题目
const currentQuestion = computed(() => questions.value[currentQuestionIndex.value])

// 进度
const progress = computed(() => {
  if (questions.value.length === 0) return 0
  return Math.round((Object.keys(answers.value).length / questions.value.length) * 100)
})

// 是否可以提交
const canSubmit = computed(() => {
  return Object.keys(answers.value).length === questions.value.length
})

// 当前题目是否已回答
const currentAnswered = computed(() => {
  if (!currentQuestion.value) return false
  return answers.value[currentQuestion.value.id] !== undefined
})

// 是否是第一题/最后一题
const isFirstQuestion = computed(() => currentQuestionIndex.value === 0)
const isLastQuestion = computed(() => currentQuestionIndex.value === questions.value.length - 1)

// 加载题目
const loadQuestions = async () => {
  try {
    const data = await request<MbtiQuestion[]>({
      url: '/mbti/questions',
      method: 'GET'
    })
    questions.value = data
  } catch {
    ElMessage.error('加载题目失败，请刷新重试')
  }
}

// 开始测评
const startAssessment = async () => {
  await loadQuestions()
  mbtiStarted.value = true
}

// 手动输入 MBTI 类型
const submitManualInput = () => {
  const normalized = mbtiManualInput.value.trim().toUpperCase()
  const validPattern = /^[IE][NS][TF][JP]$/

  if (!validPattern.test(normalized)) {
    ElMessage.warning('请输入正确的 MBTI 类型，例如 INFP')
    return
  }

  mbtiResult.value = normalized
  ElMessage.success(`已记录 MBTI 类型：${normalized}`)

  setTimeout(() => {
    router.push('/capability-profile')
  }, 1500)
}

// 选择答案
const selectAnswer = (optionCode: string) => {
  if (!currentQuestion.value) return
  answers.value[currentQuestion.value.id] = optionCode
}

// 上一题
const prevQuestion = () => {
  if (currentQuestionIndex.value > 0) {
    currentQuestionIndex.value--
  }
}

// 下一题
const nextQuestion = () => {
  if (currentQuestionIndex.value < questions.value.length - 1) {
    currentQuestionIndex.value++
  }
}

// 提交测评
const submitAssessment = async () => {
  if (!canSubmit.value) {
    ElMessage.warning('请完成所有题目后再提交')
    return
  }

  try {
    await ElMessageBox.confirm(
      '确定完成所有 MBTI 测评题吗？完成后将提交答案进行深度分析。',
      '确认提交',
      {
        confirmButtonText: '确定提交',
        cancelButtonText: '再检查一下',
        type: 'info'
      }
    )
  } catch {
    return
  }

  // 获取用户信息
  const userData = Cookies.get('userInfo')
  const userInfo = JSON.parse(userData || '{}')
  if (!userInfo.id) {
    ElMessage.warning('请先登录后再进行测评')
    router.push('/login')
    return
  }

  isSubmitting.value = true
  try {
    const mbtiType = await request<string>({
      url: '/mbti/submit',
      method: 'POST',
      data: {
        userId: userInfo.id,
        answers: answers.value
      }
    })

    mbtiResult.value = mbtiType
    ElMessage.success(`MBTI 测评完成！您的类型是: ${mbtiType}`)

    setTimeout(() => {
      router.push('/capability-profile')
    }, 2000)
  } catch {
    ElMessage.error('提交失败，请稍后重试')
  } finally {
    isSubmitting.value = false
  }
}

// 取消测评
const cancelAssessment = () => {
  router.push('/')
}
</script>

<template>
  <FormPageLayout
    title="MBTI 性格测评"
    subtitle="了解你的性格类型，发现职业优势"
    :show-progress="mbtiStarted"
    :current-step="currentQuestionIndex + 1"
    :total-steps="questions.length"
    :loading="isSubmitting"
    @submit="submitAssessment"
    @cancel="cancelAssessment"
    @prev="prevQuestion"
    @next="nextQuestion"
  >
    <!-- 测评须知页面 -->
    <MbtiNotice
      v-if="!mbtiStarted"
      v-model:manual-input="mbtiManualInput"
      @start="startAssessment"
      @submit-manual="submitManualInput"
    />

    <!-- 测评问卷 -->
    <div v-else class="mbti-quiz">
      <MbtiProgress
        :current-index="currentQuestionIndex"
        :total="questions.length"
        :progress="progress"
      />

      <MbtiQuestionCard
        v-if="currentQuestion"
        :question="currentQuestion"
        :question-number="currentQuestionIndex + 1"
        :selected-answer="answers[currentQuestion.id]"
        @select="selectAnswer"
      />

      <MbtiNavigation
        :is-first-question="isFirstQuestion"
        :is-last-question="isLastQuestion"
        :can-submit="canSubmit"
        :current-answered="currentAnswered"
        @prev="prevQuestion"
        @next="nextQuestion"
        @submit="submitAssessment"
      />
    </div>
  </FormPageLayout>
</template>

<style scoped>
.mbti-quiz {
  max-width: 800px;
  margin: 0 auto;
}
</style>
