import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMbtiQuestionsApi, submitMbtiApi } from '@/api/mbti'
import { getStoredUser } from '@/utils/session'
import { activityMonitor } from '@/utils/activityMonitor'

export interface MbtiOption {
  id: number
  qId?: number
  optCode: string
  optContent: string
}

export interface MbtiQuestion {
  id: number
  qType: string
  content: string
  options: MbtiOption[]
}

export function useMbtiAssessment(mbtiResult: { value: string | null }, onComplete: (result: string) => void) {
  const router = useRouter()
  const mbtiVisible = ref(false)
  const mbtiStarted = ref(false)
  const mbtiManualInput = ref('')
  const loadingQuestions = ref(false)
  const questions = ref<MbtiQuestion[]>([])
  const currentQIndex = ref(0)
  const answers = reactive<Record<number, string>>({})

  const isMbtiManualValid = computed(() => {
    const v = mbtiManualInput.value.trim().toUpperCase()
    return /^[EI][SN][TF][JP]$/.test(v)
  })

  const currentQuestion = computed(() => questions.value[currentQIndex.value])

  const isAllAnswered = computed(() => {
    if (questions.value.length === 0) return false
    return questions.value.every(q => answers[q.id] !== undefined && answers[q.id] !== '')
  })

  const mbtiProgress = computed(() => {
    if (mbtiResult.value) return 100
    if (questions.value.length === 0) return 0
    return Math.round((Object.keys(answers).length / questions.value.length) * 100)
  })

  const fetchQuestions = async () => {
    loadingQuestions.value = true
    try {
      const res = await getMbtiQuestionsApi()
      questions.value = res
    } catch {
      ElMessage.error('获取题库失败，请检查网络连接')
    } finally {
      loadingQuestions.value = false
    }
  }

  const openMbti = () => {
    mbtiVisible.value = true
    mbtiStarted.value = false
    mbtiManualInput.value = mbtiResult.value ?? ''
    if (questions.value.length === 0) {
      fetchQuestions()
    }
  }

  const startMbti = () => {
    mbtiStarted.value = true
    activityMonitor.recordAction('深度测评开始', { deepAssessmentStarted: true })
  }

  const applyManualMbti = () => {
    const normalized = mbtiManualInput.value.trim().toUpperCase()
    if (!/^[EI][SN][TF][JP]$/.test(normalized)) {
      ElMessage.warning('请输入正确的 MBTI 类型，例如 INFP')
      return
    }
    onComplete(normalized)
    mbtiVisible.value = false
    ElMessage.success(`已填写 MBTI 类型：${normalized}`)
  }

  const selectOption = (optCode: string) => {
    const q = currentQuestion.value
    if (!q) return
    answers[q.id] = optCode

    if (currentQIndex.value < questions.value.length - 1) {
      const index = currentQIndex.value
      setTimeout(() => {
        if (currentQIndex.value === index) {
          currentQIndex.value++
        }
      }, 120)
    }
  }

  const prevQuestion = () => {
    if (currentQIndex.value > 0) {
      currentQIndex.value--
    }
  }

  const nextQuestion = () => {
    if (currentQIndex.value < questions.value.length - 1) {
      currentQIndex.value++
    }
  }

  const finishMbti = async () => {
    try {
      await ElMessageBox.confirm(
        '确定完成所有 MBTI 测评题吗？完成后将提交答案进行深度分析。',
        '完成测评',
        {
          confirmButtonText: '确定完成',
          cancelButtonText: '再查一下',
          type: 'success'
        }
      )

      const userInfo = getStoredUser()
      if (!userInfo?.id) {
        ElMessage.warning('请先登录后再进行测评')
        router.push('/login')
        return
      }

      mbtiVisible.value = false
      loadingQuestions.value = true

      const mbtiType = await submitMbtiApi({ ...answers }, userInfo.id)

      onComplete(mbtiType)
      activityMonitor.recordAction('深度测评完成', { deepAssessmentCompleted: true })
      ElMessage.success(`MBTI 测评完成！您的类型是: ${mbtiType}`)
    } catch (error: unknown) {
      if (error !== 'cancel') {
        ElMessage.error('测评提交失败，请稍后重试')
      }
    } finally {
      loadingQuestions.value = false
    }
  }

  return {
    mbtiVisible,
    mbtiStarted,
    mbtiManualInput,
    loadingQuestions,
    questions,
    currentQIndex,
    answers,
    isMbtiManualValid,
    currentQuestion,
    isAllAnswered,
    mbtiProgress,
    openMbti,
    startMbti,
    applyManualMbti,
    selectOption,
    prevQuestion,
    nextQuestion,
    finishMbti
  }
}
