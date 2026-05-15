/**
 * useCapabilityGeneration - 能力画像生成 Composable
 *
 * 职责：
 * - 封装能力画像生成逻辑（SSE 流式 + 降级方案）
 * - 进度管理和持久化
 * - 错误处理
 * - 与 Store 集成
 */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  generateCapabilityProfileDraftApi,
  generateCapabilityProfileStreamApi,
  type CapabilityProfileRequest,
  type CapabilityProfileResponse
} from '@/api/capability'
import { useCapabilityStore } from '@/stores/capability'
import {
  loadEntryDraft,
  loadDeepAssessmentDraft,
  loadTargetJob,
  saveCapabilityProfileDraft
} from '@/utils/storage'
import { consumeSseStream, type SseEventHandlers } from '@/utils/sseParser'
import { activityMonitor } from '@/utils/activityMonitor'
import { useLocalStorage } from './useLocalStorage'

// 进度持久化相关
const PROGRESS_KEY = 'profile_generation_progress'
const PROGRESS_EXPIRY = 5 * 60 * 1000 // 5分钟

interface GenerationProgress {
  step: number
  total: number
  summary: string
  timestamp: number
  payload: CapabilityProfileRequest
}

export function useCapabilityGeneration() {
  const router = useRouter()
  const capabilityStore = useCapabilityStore()

  // 加载状态
  const loading = ref(false)
  const loadingState = ref({
    isLoading: false,
    step: 0,
    total: 6,
    summary: ''
  })

  // 进度持久化
  const savedProgress = useLocalStorage<GenerationProgress | null>(
    PROGRESS_KEY,
    null
  )

  // 计算属性
  const profile = computed(() => capabilityStore.profile)

  // 保存进度
  const saveProgress = (progress: Omit<GenerationProgress, 'timestamp'>) => {
    savedProgress.value = {
      ...progress,
      timestamp: Date.now()
    }
  }

  // 清除进度
  const clearProgress = () => {
    savedProgress.value = null
    // 确保从 localStorage 中移除
    localStorage.removeItem(PROGRESS_KEY)
  }

  // 检查进度是否过期
  const isProgressExpired = (progress: GenerationProgress | null): boolean => {
    if (!progress) return true
    return Date.now() - progress.timestamp > PROGRESS_EXPIRY
  }

  // 开始生成能力画像
  const startGeneration = async (payload: CapabilityProfileRequest) => {
    try {
      const response = await generateCapabilityProfileStreamApi(payload)

      if (!response.ok || !response.body) {
        throw new Error('Stream not supported')
      }

      // 使用统一的SSE解析工具
      const handlers: SseEventHandlers = {
        onStep: (data) => {
          const newState = {
            isLoading: true,
            step: data.step || 0,
            total: data.total || 6,
            summary: data.summary || ''
          }
          loadingState.value = newState

          // 保存进度到localStorage
          saveProgress({
            step: newState.step,
            total: newState.total,
            summary: newState.summary,
            payload
          })
        },
        onProgress: (data) => {
          console.log('Step progress:', data)
        },
        onComplete: (data) => {
          const profileData = data as CapabilityProfileResponse
          capabilityStore.setProfile(profileData)
          saveCapabilityProfileDraft(profileData)
          loadingState.value.isLoading = false
          activityMonitor.recordAction('能力画像生成完成')
          activityMonitor.updatePageState({
            profileGenerated: true,
            profileGenerating: false
          })
          clearProgress()
        },
        onError: (data) => {
          // 显示详细的错误信息
          const errorType = data.errorType || 'UNKNOWN'
          const step = data.step ? `步骤${data.step}/${data.total}` : ''
          const suggestion = data.suggestion || '请稍后重试'

          let errorTitle = '生成失败'
          if (errorType === 'NETWORK') {
            errorTitle = '网络连接失败'
          } else if (errorType === 'TIMEOUT') {
            errorTitle = '请求超时'
          } else if (errorType === 'AI_ERROR') {
            errorTitle = 'AI服务异常'
          } else if (errorType === 'EMPTY_RESPONSE' || errorType === 'INVALID_JSON') {
            errorTitle = '数据格式异常'
          }

          const errorMessage = step
            ? `${errorTitle}（${step}）：${suggestion}`
            : `${errorTitle}：${suggestion}`

          ElMessage.error({
            message: errorMessage,
            duration: 5000,
            showClose: true
          })

          // 如果是非致命错误（单步失败），不关闭loading，让流程继续
          if (!data.step) {
            loadingState.value.isLoading = false
            activityMonitor.updatePageState({ profileGenerating: false })
            clearProgress()
          }
        }
      }

      await consumeSseStream(response, handlers, 120000)
    } catch (error) {
      console.warn('Streaming failed, fallback to non-streaming:', error)
      loadingState.value = {
        isLoading: true,
        step: 0,
        total: 1,
        summary: '使用备用方案生成中...'
      }
      clearProgress()

      try {
        const profileData = await generateCapabilityProfileDraftApi(payload)
        capabilityStore.setProfile(profileData)
        saveCapabilityProfileDraft(profileData)
        activityMonitor.recordAction('能力画像生成完成')
        activityMonitor.updatePageState({
          profileGenerated: true,
          profileGenerating: false
        })
      } catch (fallbackError) {
        ElMessage.error('生成失败，请稍后再试')
        activityMonitor.updatePageState({ profileGenerating: false })
        throw fallbackError
      } finally {
        loadingState.value.isLoading = false
      }
    }
  }

  // 初始化生成流程
  const initializeGeneration = async () => {
    loading.value = true

    try {
      const draft = loadEntryDraft()
      const deep = loadDeepAssessmentDraft()

      if (!draft) {
        ElMessage.warning('还没有完成信息录入，请先在"综合信息录入"页面提交核心信息')
        router.push('/entry/comprehensive')
        return
      }

      // 检查是否有缓存的能力画像
      const cached = capabilityStore.profile
      const cachedHasJobs =
        Array.isArray(cached?.recommendedJobs) &&
        (cached.recommendedJobs?.length ?? 0) > 0

      if (cached && cachedHasJobs) {
        clearProgress()
        return
      }

      // 检查是否有未完成的生成任务
      const progress = savedProgress.value
      if (progress && !isProgressExpired(progress)) {
        try {
          await ElMessageBox.confirm(
            `检测到上次生成任务未完成（进度：${progress.step}/${progress.total}），是否继续？`,
            '恢复生成',
            {
              confirmButtonText: '继续生成',
              cancelButtonText: '重新开始',
              type: 'info'
            }
          )
          // 用户选择继续，恢复进度状态
          loadingState.value = {
            isLoading: true,
            step: progress.step,
            total: progress.total,
            summary: progress.summary || '恢复生成中...'
          }
          activityMonitor.updatePageState({ profileGenerating: true })
          await startGeneration(progress.payload)
          return
        } catch {
          // 用户选择重新开始或关闭对话框
          clearProgress()
        }
      }

      // 准备生成数据
      const targetJob = loadTargetJob()

      const mergedTarget = {
        ...draft?.target,
        ...(targetJob?.jobName ? { role: targetJob.jobName } : {}),
        ...(targetJob?.city ? { cities: [targetJob.city] } : {}),
        ...(targetJob?.salary ? { salary: targetJob.salary } : {})
      }

      const payload: CapabilityProfileRequest = {
        ...draft,
        target: mergedTarget,
        questionnaireAnswers: {
          ...(draft ?? {})?.questionnaireAnswers,
          ...deep
        }
      }

      loadingState.value = {
        isLoading: true,
        step: 0,
        total: 6,
        summary: '准备生成能力画像...'
      }
      activityMonitor.updatePageState({ profileGenerating: true })

      await startGeneration(payload)
    } catch (e: unknown) {
      ElMessage.error((e as Error)?.message || '能力画像生成失败')
      activityMonitor.updatePageState({ profileGenerating: false })
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    loading,
    loadingState,
    profile,

    // Actions
    initializeGeneration,
    startGeneration,
    clearProgress
  }
}
