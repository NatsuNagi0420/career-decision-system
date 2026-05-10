<!--
  页面：路径规划页（/path-planning）。
  职责：基于信息录入与深度测评等数据调用大模型生成职业路径图谱，
        以可视化形式展示节点与跳转路径，帮助用户理解成长路线。
-->
<script setup lang="ts">
import { computed, onMounted, ref, onUnmounted } from 'vue'
import Navbar from '../components/Navbar.vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Flag, Sparkles, Info, Award, ExternalLink, MousePointer2 } from 'lucide-vue-next'
import * as echarts from 'echarts'
import { generatePathPlanApi, generatePathPlanStreamApi } from '@/api/persistence'
import {
  loadDeepAssessmentDraft,
  loadEntryDraft,
  loadTargetJob,
  savePathGraph,
  savePathPlan
} from '@/utils/storage'
import { activityMonitor } from '@/utils/activityMonitor'
import { consumeSseStream, type SseEventHandlers } from '@/utils/sseParser'

// 进度持久化相关
const PROGRESS_KEY = 'path_generation_progress'
const PROGRESS_EXPIRY = 5 * 60 * 1000 // 5分钟

interface GenerationProgress {
  step: number
  total: number
  summary: string
  timestamp: number
  payload: any
}

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
    // 检查是否过期
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

const router = useRouter()
const targetJob = ref<any>(null)
const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const graphData = ref<any>(null)
const selectedNode = ref<any>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const loadingState = ref({
  isLoading: false,
  step: 0,
  total: 5,
  summary: ''
})

const fetchPathData = async () => {
  loading.value = true
  try {
    const draft = loadEntryDraft()
    const deep = loadDeepAssessmentDraft()

    if (!draft) {
      ElMessage.warning('还没有完成信息录入，请先在”综合信息录入”页面提交核心信息')
      router.push('/entry/comprehensive')
      return
    }

    // 检查是否有未完成的生成任务
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
        // 用户选择继续，恢复进度状态
        loadingState.value = {
          isLoading: true,
          step: savedProgress.step,
          total: savedProgress.total,
          summary: savedProgress.summary || '恢复生成中...'
        }
        activityMonitor.updatePageState({ pathPlanGenerating: true })
        await startGeneration(savedProgress.payload)
        return
      } catch (e) {
        // 用户选择重新开始或关闭对话框
        clearProgress()
      }
    }

    const job = loadTargetJob()
    const mergedTarget = {
      ...(draft?.target ?? {}),
      ...(job?.jobName ? { role: job.jobName } : {}),
      ...(job?.city ? { cities: [job.city] } : {}),
      ...(job?.salary ? { salary: job.salary } : {})
    }

    const payload = {
      ...draft,
      target: mergedTarget,
      questionnaireAnswers: {
        ...(draft.questionnaireAnswers ?? {}),
        ...(deep ?? {})
      }
    }

    loadingState.value = { isLoading: true, step: 0, total: 5, summary: '准备生成职业路径规划...' }
    activityMonitor.updatePageState({ pathPlanGenerating: true })

    await startGeneration(payload)
  } catch (e) {
    ElMessage.error('获取路径规划失败')
    activityMonitor.updatePageState({ pathPlanGenerating: false })
  } finally {
    loading.value = false
  }
}

// 开始生成路径规划
const startGeneration = async (payload: any) => {
  try {
    const response = await generatePathPlanStreamApi(payload)

    if (!response.ok || !response.body) {
      throw new Error('Stream not supported')
    }

    // 使用统一的SSE解析工具
    const handlers: SseEventHandlers = {
      onStep: (data) => {
        const newState = {
          isLoading: true,
          step: data.step || 0,
          total: data.total || 5,
          summary: data.summary || ''
        }
        loadingState.value = newState

        // 保存进度到localStorage
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
        // data可能直接包含图谱数据，或在result字段中
        const graphResult = (data as any).nodes ? data : (data as any).result
        graphData.value = graphResult
        if (graphResult?.nodes && graphResult.nodes.length > 0) {
          selectedNode.value = graphResult.nodes[0]
        }
        if (graphResult) {
          savePathGraph(graphResult)
        }
        initGraph()
        loadingState.value.isLoading = false
        activityMonitor.recordAction('路径规划生成完成')
        activityMonitor.updatePageState({ pathPlanGenerated: true, pathPlanGenerating: false })
        clearProgress() // 生成完成，清除进度
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
          activityMonitor.updatePageState({ pathPlanGenerating: false })
          clearProgress() // 出错，清除进度
        }
      }
    }

    await consumeSseStream(response, handlers, 120000)
  } catch (error) {
    console.warn('Streaming failed, fallback to non-streaming:', error)
    loadingState.value = { isLoading: true, step: 0, total: 1, summary: '使用备用方案生成中...' }
    clearProgress() // 降级，清除进度
    try {
      const res = await generatePathPlanApi(payload)
      graphData.value = res
      if (res?.nodes && res.nodes.length > 0) {
        selectedNode.value = res.nodes[0]
      }
      if (res) {
        savePathGraph(res)
      }
      initGraph()
      activityMonitor.recordAction('路径规划生成完成')
      activityMonitor.updatePageState({ pathPlanGenerated: true, pathPlanGenerating: false })
    } catch (fallbackError) {
      ElMessage.error('获取路径规划失败')
      activityMonitor.updatePageState({ pathPlanGenerating: false })
    } finally {
      loadingState.value.isLoading = false
    }
  }
}

const initGraph = () => {
  if (!chartRef.value || !graphData.value) return
  if (chart) chart.dispose()
  chart = echarts.init(chartRef.value as HTMLElement)

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          return `岗位: ${params.data.name}`
        }
        return `类型: ${params.data.type === 'promotion' ? '晋升' : '换岗'}<br/>耗时: ${params.data.label}`
      }
    },
    legend: [
      {
        data: ['当前', '目标', '备选'],
        orient: 'vertical',
        left: 20,
        top: 20,
        itemWidth: 10,
        textStyle: { color: '#64748b' }
      }
    ],
    series: [
      {
        type: 'graph',
        layout: 'force',
        symbolSize: 60,
        roam: true,
        edgeSymbol: ['circle', 'arrow'],
        edgeSymbolSize: [4, 10],
        force: {
          repulsion: 1000,
          edgeLength: 150
        },
        draggable: true,
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.1)'
        },
        label: {
          show: true,
          position: 'bottom',
          formatter: '{b}',
          fontSize: 12,
          color: '#1e293b',
          fontWeight: 600
        },
        data: graphData.value.nodes.map((n: any) => ({
          name: n.name,
          category: n.type === 'current' ? 0 : n.type === 'target' ? 1 : 2,
          itemStyle: {
            color:
              n.type === 'current'
                ? '#02492a'
                : n.type === 'target'
                  ? '#fbbd41'
                  : '#43089f'
          }
        })),
        links: graphData.value.links.map((l: any) => ({
          source: graphData.value.nodes.find((n: any) => n.id === l.source)?.name,
          target: graphData.value.nodes.find((n: any) => n.id === l.target)?.name,
          type: l.type,
          label: {
            show: true,
            formatter: l.label,
            fontSize: 10,
            color: '#94a3b8'
          },
          lineStyle: {
            type: l.type === 'promotion' ? 'solid' : 'dashed',
            width: 2,
            curveness: 0.1,
            color: '#e2e8f0'
          }
        })),
        categories: [{ name: '当前' }, { name: '目标' }, { name: '备选' }]
      }
    ]
  }

  chart.setOption(option)

  chart.on('click', (params: any) => {
    if (params.dataType === 'node') {
      const node = graphData.value.nodes.find((n: any) => n.name === params.name)
      if (node) selectedNode.value = node
    }
  })
}

const selectedLink = computed(() => {
  if (!selectedNode.value || !graphData.value) return null
  return (graphData.value.links || []).find((l: any) => l.target === selectedNode.value.id)
})

const changeTarget = () => {
  router.push('/job-exploration')
}

const handleResize = () => {
  if (chart) {
    chart.resize()
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
  const stages = recs.map((r: any, idx: number) => ({
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
    targetJobId: String(targetJob.value.id ?? ''),
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

onMounted(async () => {
  // 没有信息录入草稿时，不允许直接进入路径规划
  const draft = loadEntryDraft()
  if (!draft) {
    ElMessage.warning('还没有完成信息录入，请先在“综合信息录入”页面提交核心信息')
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
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
</script>

<template>
  <div class="plan-page clay-page">
    <Navbar />

    <!-- 加载进度提示 -->
    <div v-if="loadingState.isLoading" class="loading-overlay">
      <div class="loading-content">
        <el-progress
          :percentage="Math.round((loadingState.step / loadingState.total) * 100)"
          :stroke-width="8"
          status="success"
        />
        <p class="loading-text">
          步骤 {{ loadingState.step }}/{{ loadingState.total }}: {{ loadingState.summary }}
        </p>
        <p class="loading-hint">正在为您规划职业发展路径，请稍候...</p>
      </div>
    </div>

    <div class="page-container">
      <div class="header mb-6">
        <div class="title-row">
          <Flag :size="22" class="title-icon" />
          <h1 class="title">路径规划</h1>
          <span class="step-tag">第4步</span>
        </div>
        <p class="text-sub">AI 驱动的职业晋升图谱，助你对齐目标岗位</p>
      </div>

      <div v-if="!targetJob" class="empty clay-card">
        <div class="empty-title">还没有目标岗位</div>
        <div class="text-sub mb-6">请先去岗位探索确认你的主目标岗位</div>
        <el-button type="primary" class="clay-btn-primary" @click="changeTarget">
          去岗位探索
        </el-button>
      </div>

      <div v-else class="main-layout">
        <section class="graph-section clay-card" v-loading="loading">
          <div class="section-header">
            <div class="section-title">
              <Sparkles :size="18" class="title-icon" />
              <span>职业晋升图谱</span>
            </div>
            <div class="section-actions">
              <div class="text-mute text-xs">
                <MousePointer2 :size="12" class="mr" />
                拖拽节点查看连接，点击节点查看详情
              </div>
              <el-button size="small" type="primary" link @click="fetchPathData">
                重新生成
              </el-button>
            </div>
          </div>
          <div ref="chartRef" class="graph-canvas"></div>
        </section>

        <aside class="sidebar">
          <section class="node-detail clay-card" v-if="selectedNode">
            <div class="panel-title">
              <Info :size="18" />
              <span>岗位详情</span>
            </div>
            <div class="node-info">
              <div class="node-name">{{ selectedNode.name }}</div>
              <el-tag
                :type="
                  selectedNode.type === 'current'
                    ? 'success'
                    : selectedNode.type === 'target'
                      ? 'warning'
                      : 'info'
                "
                size="small"
              >
                {{
                  selectedNode.type === 'current'
                    ? '当前'
                    : selectedNode.type === 'target'
                      ? '目标'
                      : '备选'
                }}
              </el-tag>
            </div>

            <div v-if="selectedLink" class="transition-info">
              <div class="mini-title">晋升/转换路径</div>
              <div class="info-item">
                <span class="label">预计耗时:</span>
                <span class="val">{{ selectedLink.label }}</span>
              </div>
              <div class="mini-title">建议补全技能</div>
              <div class="skill-tags">
                <el-tag
                  v-for="s in selectedLink.skills"
                  :key="s"
                  effect="plain"
                  size="small"
                >
                  {{ s }}
                </el-tag>
              </div>
            </div>
          </section>

          <section class="path-recommend clay-card">
            <div class="panel-title">
              <Award :size="18" />
              <span>路径推荐列表</span>
            </div>
            <div class="path-list">
              <div
                v-for="(p, pIdx) in (graphData?.recommendations || [])"
                :key="'path-' + pIdx"
                class="path-item"
              >
                <div class="path-name">{{ p.name }}</div>
                <div
                  class="path-steps"
                  v-if="p && p.steps && Array.isArray(p.steps)"
                >
                  <span
                    v-for="(step, sIdx) in p.steps"
                    :key="'step-' + pIdx + '-' + sIdx"
                    class="step-container"
                  >
                    <span class="step">{{ step }}</span>
                    <span
                      v-if="Number(sIdx) < p.steps.length - 1"
                      class="step-arrow"
                      >→</span
                    >
                  </span>
                </div>
              </div>
            </div>
            <div class="actions mt-4">
              <el-button class="w-full" type="primary" @click="saveToReport">
                添加到报告
              </el-button>
              <el-button class="w-full mt-2" plain @click="generateReport">
                生成完整报告
                <ExternalLink :size="14" class="ml" />
              </el-button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-page {
  min-height: 100vh;
  background: transparent;
}

.page-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 104px 20px 60px;
}

.header {
  text-align: left;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
  color: var(--clay-text);
}

.title-icon {
  color: var(--clay-ube-800);
}

.step-tag {
  font-size: 12px;
  color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  border: 1px solid var(--clay-border-subtle);
  padding: 2px 10px;
  border-radius: 999px;
}

.main-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 20px;
  align-items: start;
}

.graph-section {
  padding: 24px;
  height: 600px;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 16px;
}

.graph-canvas {
  flex: 1;
  min-height: 0;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.clay-card {
  background: var(--clay-surface);
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  margin-bottom: 16px;
  color: var(--clay-text);
  font-size: 15px;
}

.node-detail,
.path-recommend {
  padding: 20px;
}

.node-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.node-name {
  font-size: 18px;
  font-weight: 800;
  color: var(--clay-text);
}

.mini-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--clay-text-subtle);
  margin: 16px 0 8px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.info-item .label {
  color: #94a3b8;
}

.info-item .val {
  color: var(--clay-text);
  font-weight: 600;
}

.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-item {
  padding: 12px;
  background: var(--clay-surface-variant);
  border-radius: 12px;
  border: 1px solid var(--clay-border-subtle);
}

.path-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--clay-ube-800);
  margin-bottom: 8px;
}

.path-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--clay-text);
}

.step-arrow {
  color: #cbd5e1;
}

.mr {
  margin-right: 6px;
}

.ml {
  margin-left: 6px;
}

.empty {
  padding: 60px;
  text-align: center;
}

.empty-title {
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 12px;
}

.error-alert {
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--clay-surface-error);
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 13px;
}

@media (max-width: 1024px) {
  .main-layout {
    grid-template-columns: 1fr;
  }
}

/* 加载进度样式 */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  width: 400px;
  padding: 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.loading-text {
  margin-top: 20px;
  font-size: 16px;
  color: #1f2937;
  font-weight: 500;
}

.loading-hint {
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
}
</style>
