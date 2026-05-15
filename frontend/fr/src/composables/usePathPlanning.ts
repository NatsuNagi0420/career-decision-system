import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { generatePathPlanApi, generatePathPlanStreamApi } from '@/api/persistence'
import {
  loadDeepAssessmentDraft,
  loadEntryDraft,
  loadTargetJob,
  savePathGraph,
  savePathPlan,
  type PathGraphDraft
} from '@/utils/storage'
import { activityMonitor } from '@/utils/activityMonitor'
import { consumeSseStream, type SseEventHandlers } from '@/utils/sseParser'

const PROGRESS_KEY = 'path_generation_progress'
const PROGRESS_EXPIRY = 5 * 60 * 1000

interface GenerationProgress {
  step: number
  total: number
  summary: string
  timestamp: number
  payload: Record<string, unknown>
}

interface LoadingState {
  isLoading: boolean
  step: number
  total: number
  summary: string
}

export function usePathPlanning() {
  const router = useRouter()

  const targetJob = ref<Record<string, unknown> | null>(null)
  const graphData = ref<PathGraphDraft | null>(null)
  const selectedNode = ref<Record<string, unknown> | null>(null)
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)
  const loadingState = ref<LoadingState>({
    isLoading: false,
    step: 0,
    total: 5,
    summary: ''
  })

  const selectedLink = computed(() => {
    if (!selectedNode.value || !graphData.value) return null
    const links = graphData.value.links || []
    return links.find((l) => l.target === (selectedNode.value as Record<string, unknown>)?.id)
  })

  const saveProgress = (progress: GenerationProgress) => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
    } catch (e) {
      console.warn('Failed to save progress:', e)
    }
  }

  const loadProgress = (): GenerationProgress | null => {
    try {
      const saved = localStorage.getItem(PROGRESS_KEY)
      if (!saved) return null
      const progress = JSON.parse(saved) as GenerationProgress
      if (Date.now() - progress.timestamp > PROGRESS_EXPIRY) {
        localStorage.removeItem(PROGRESS_KEY)
        return null
      }
      return progress
    } catch (e) {
      console.warn('Failed to load progress:', e)
      return null
    }
  }

  const clearProgress = () => {
    try {
      localStorage.removeItem(PROGRESS_KEY)
    } catch (e) {
      console.warn('Failed to clear progress:', e)
    }
  }

  const startGeneration = async (payload: Record<string, unknown>) => {
    try {
      const response = await generatePathPlanStreamApi(payload)

      if (!response.ok || !response.body) {
        throw new Error('Stream not supported')
      }

      const handlers: SseEventHandlers = {
        onStep: (data) => {
          const newState = {
            isLoading: true,
            step: data.step || 0,
            total: data.total || 5,
            summary: data.summary || ''
          }
          loadingState.value = newState

          saveProgress({
            step: newState.step,
            total: newState.total,
            summary: newState.summary,
            timestamp: Date.now(),
            payload
          })
        },
        onProgress: (data) => {
          console.log('Step progress:', data)
        },
        onComplete: (data) => {
          const dataObj = data as Record<string, unknown>
          const graphResult = dataObj.nodes ? (data as PathGraphDraft) : (dataObj.result as PathGraphDraft)
          graphData.value = graphResult
          if (graphResult?.nodes && Array.isArray(graphResult.nodes) && graphResult.nodes.length > 0) {
            selectedNode.value = graphResult.nodes[0] as unknown as Record<string, unknown>
          }
          if (graphResult) {
            savePathGraph(graphResult)
          }
          loadingState.value.isLoading = false
          activityMonitor.recordAction('路径规划生成完成')
          activityMonitor.updatePageState({ pathPlanGenerated: true, pathPlanGenerating: false })
          clearProgress()
        },
        onError: (data) => {
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

          if (!data.step) {
            loadingState.value.isLoading = false
            activityMonitor.updatePageState({ pathPlanGenerating: false })
            clearProgress()
          }
        }
      }

      await consumeSseStream(response, handlers, 120000)
    } catch (error) {
      console.warn('Streaming failed, fallback to non-streaming:', error)
      loadingState.value = { isLoading: true, step: 0, total: 1, summary: '使用备用方案生成中...' }
      clearProgress()
      try {
        const res = await generatePathPlanApi(payload)
        graphData.value = res as PathGraphDraft
        const resGraph = res as PathGraphDraft
        if (resGraph?.nodes && Array.isArray(resGraph.nodes) && resGraph.nodes.length > 0) {
          selectedNode.value = resGraph.nodes[0] as unknown as Record<string, unknown>
        }
        if (res) {
          savePathGraph(res as PathGraphDraft)
        }
        activityMonitor.recordAction('路径规划生成完成')
        activityMonitor.updatePageState({ pathPlanGenerated: true, pathPlanGenerating: false })
      } catch {
        ElMessage.error('获取路径规划失败')
        activityMonitor.updatePageState({ pathPlanGenerating: false })
      } finally {
        loadingState.value.isLoading = false
      }
    }
  }

  const fetchPathData = async () => {
    loading.value = true
    try {
      const draft = loadEntryDraft()
      const deep = loadDeepAssessmentDraft()

      if (!draft) {
        ElMessage.warning('还没有完成信息录入，请先在"综合信息录入"页面提交核心信息')
        router.push('/entry/comprehensive')
        return
      }

      const savedProgress = loadProgress()
      if (savedProgress) {
        try {
          await ElMessageBox.confirm(
            `检测到上次生成任务未完成（进度：${savedProgress.step}/${savedProgress.total}），是否继续？`,
            '恢复生成',
            {
              confirmButtonText: '继续生成',
              cancelButtonText: '重新开始',
              type: 'info'
            }
          )
          loadingState.value = {
            isLoading: true,
            step: savedProgress.step,
            total: savedProgress.total,
            summary: savedProgress.summary || '恢复生成中...'
          }
          activityMonitor.updatePageState({ pathPlanGenerating: true })
          await startGeneration(savedProgress.payload)
          return
        } catch {
          clearProgress()
        }
      }

      const job = loadTargetJob()
      const mergedTarget = {
        ...draft?.target,
        ...(job?.jobName ? { role: job.jobName } : {}),
        ...(job?.city ? { cities: [job.city] } : {}),
        ...(job?.salary ? { salary: job.salary } : {})
      }

      const payload = {
        ...draft,
        target: mergedTarget,
        questionnaireAnswers: {
          ...draft.questionnaireAnswers,
          ...deep
        }
      }

      loadingState.value = { isLoading: true, step: 0, total: 5, summary: '准备生成职业路径规划...' }
      activityMonitor.updatePageState({ pathPlanGenerating: true })

      await startGeneration(payload)
    } catch {
      ElMessage.error('获取路径规划失败')
      activityMonitor.updatePageState({ pathPlanGenerating: false })
    } finally {
      loading.value = false
    }
  }

  const saveToReport = () => {
    if (!graphData.value || !targetJob.value) {
      ElMessage.warning('请先生成路径规划')
      return
    }

    const recs = Array.isArray(graphData.value.recommendations)
      ? graphData.value.recommendations
      : []
    const stages = recs.map((r, idx: number) => ({
      id: `stage-${Date.now()}-${idx}`,
      name: r?.name || `阶段${idx + 1}`,
      tasks: Array.isArray(r?.steps)
        ? r.steps.map((s: string, sIdx: number) => ({
            id: `task-${idx}-${sIdx}`,
            title: s,
            done: false
          }))
        : []
    }))

    const plan = {
      id: `plan-${Date.now()}`,
      targetJobId: String((targetJob.value as Record<string, unknown>).id ?? ''),
      stages,
      updatedAt: new Date().toISOString()
    }

    savePathPlan(plan)
    savePathGraph(graphData.value)
    ElMessage.success('已添加到报告预览')
  }

  const generateReport = () => {
    router.push('/report')
  }

  const changeTarget = () => {
    router.push('/job-exploration')
  }

  const selectNode = (node: Record<string, unknown>) => {
    selectedNode.value = node
  }

  const initialize = async () => {
    const draft = loadEntryDraft()
    if (!draft) {
      ElMessage.warning('还没有完成信息录入，请先在"综合信息录入"页面提交核心信息')
      router.push('/entry/comprehensive')
      return
    }

    try {
      const job = loadTargetJob()
      if (!job) {
        errorMessage.value = '还没有目标岗位，请先在岗位探索中设置目标岗位'
        return
      }
      targetJob.value = job
      await fetchPathData()
    } catch (e) {
      const msg = (e as Error)?.message || '获取目标岗位失败，请稍后重试'
      errorMessage.value = msg
      ElMessage.error(msg)
    }
  }

  return {
    targetJob,
    graphData,
    selectedNode,
    selectedLink,
    loading,
    errorMessage,
    loadingState,
    fetchPathData,
    saveToReport,
    generateReport,
    changeTarget,
    selectNode,
    initialize,
    startGeneration
  }
}
