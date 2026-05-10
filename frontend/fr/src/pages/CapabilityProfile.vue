<!--
  页面：能力画像页（/capability-profile）。
  职责：基于信息录入与深度问卷数据调用大模型生成能力画像，
        并通过图表展示能力雷达、竞争力评分和推荐岗位等结果。
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import * as echarts from 'echarts'
import { Trophy, Target, TrendingUp, Briefcase } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import {
  generateCapabilityProfileDraftApi,
  generateCapabilityProfileStreamApi,
  type CapabilityProfileResponse
} from '@/api/capability'
import {
  loadCapabilityProfileDraft,
  loadDeepAssessmentDraft,
  loadEntryDraft,
  loadTargetJob,
  saveCapabilityProfileDraft
} from '@/utils/storage'
import { ElMessage, ElMessageBox } from 'element-plus'
import { activityMonitor } from '@/utils/activityMonitor'
import { consumeSseStream, type SseEventHandlers } from '@/utils/sseParser'

// 进度持久化相关
const PROGRESS_KEY = 'profile_generation_progress'
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

// 雷达图容器
const radarChartRef = ref<HTMLElement | null>(null)
// 柱状图容器
const barChartRef = ref<HTMLElement | null>(null)

const profile = ref<CapabilityProfileResponse | null>(null)
const loading = ref(false)
const loadingState = ref({
  isLoading: false,
  step: 0,
  total: 6,
  summary: ''
})

const recommendedJobs = computed(() => {
  return (profile.value?.recommendedJobs ?? []).slice(0, 3)
})

const matchScores = computed(() => {
  const fromApi = profile.value?.matchScores
  if (Array.isArray(fromApi) && fromApi.length >= recommendedJobs.value.length) {
    return fromApi.slice(0, recommendedJobs.value.length)
  }
  const base = 92
  return recommendedJobs.value.map((_, idx) => Math.max(60, base - idx * 7))
})

const primaryRecommended = computed(() => {
  const p: any = profile.value
  if (!p) return null
  const titles = Array.isArray(p.recommendedJobTitles) ? p.recommendedJobTitles : []
  const jobs = Array.isArray(p.recommendedJobs) ? p.recommendedJobs : []
  const title = titles.length > 0 ? titles[0] : jobs[0]?.jobName
  const job = jobs[0]
  if (!title || !job) return null
  return { title, job }
})

const router = useRouter()

const charts: echarts.ECharts[] = []

onMounted(async () => {
  loading.value = true
  try {
    const draft = loadEntryDraft()
    const deep = loadDeepAssessmentDraft()

    if (!draft) {
      ElMessage.warning('还没有完成信息录入，请先在”综合信息录入”页面提交核心信息')
      router.push('/entry/comprehensive')
      return
    }

    const cached = loadCapabilityProfileDraft()
    const cachedHasJobs = Array.isArray((cached as any)?.recommendedJobs) && ((cached as any).recommendedJobs?.length ?? 0) > 0

    if (cached && cachedHasJobs) {
      profile.value = cached
      clearProgress() // 清除旧进度
    } else {
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
          activityMonitor.updatePageState({ profileGenerating: true })
          // 注意：实际上无法真正恢复流式生成，只能重新开始，但显示之前的进度给用户提示
          await startGeneration(savedProgress.payload)
          return
        } catch (e) {
          // 用户选择重新开始或关闭对话框
          clearProgress()
        }
      }

      const targetJob = loadTargetJob()

      const mergedTarget = {
        ...(draft?.target ?? {}),
        ...(targetJob?.jobName ? { role: targetJob.jobName } : {}),
        ...(targetJob?.city ? { cities: [targetJob.city] } : {}),
        ...(targetJob?.salary ? { salary: targetJob.salary } : {})
      }

      const payload = {
        ...draft,
        target: mergedTarget,
        questionnaireAnswers: {
          ...(draft ?? {})?.questionnaireAnswers,
          ...(deep ?? {})
        }
      }

      loadingState.value = { isLoading: true, step: 0, total: 6, summary: '准备生成能力画像...' }
      activityMonitor.updatePageState({ profileGenerating: true })

      await startGeneration(payload)
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '能力画像生成失败')
    activityMonitor.updatePageState({ profileGenerating: false })
  } finally {
    loading.value = false
  }

  if (profile.value) {
    await nextTick()
    initRadarChart()
    initBarChart()
    window.addEventListener('resize', handleResize)
  }
})

// 开始生成能力画像
const startGeneration = async (payload: any) => {
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
          timestamp: Date.now(),
          payload
        })
      },
      onProgress: (data) => {
        console.log('Step progress:', data)
      },
      onComplete: (data) => {
        profile.value = data as CapabilityProfileResponse
        if (profile.value) {
          saveCapabilityProfileDraft(profile.value)
        }
        loadingState.value.isLoading = false
        activityMonitor.recordAction('能力画像生成完成')
        activityMonitor.updatePageState({ profileGenerated: true, profileGenerating: false })
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
          activityMonitor.updatePageState({ profileGenerating: false })
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
      profile.value = await generateCapabilityProfileDraftApi(payload)
      if (profile.value) {
        saveCapabilityProfileDraft(profile.value)
        activityMonitor.recordAction('能力画像生成完成')
        activityMonitor.updatePageState({ profileGenerated: true, profileGenerating: false })
      }
    } catch (fallbackError) {
      ElMessage.error('生成失败，请稍后再试')
      activityMonitor.updatePageState({ profileGenerating: false })
    } finally {
      loadingState.value.isLoading = false
    }
  }
}


onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  charts.forEach(chart => chart.dispose()) // 销毁实例，防止内存泄漏
})

const handleResize = () => {
  charts.forEach(chart => chart.resize())
}

const initRadarChart = () => {
  if (!radarChartRef.value) return
  const myChart = echarts.init(radarChartRef.value)
  charts.push(myChart)

  const indicators = profile.value?.radar?.indicators ?? [
    { name: '专业技能', max: 100 },
    { name: '创新能力', max: 100 },
    { name: '沟通表达', max: 100 },
    { name: '学习能力', max: 100 },
    { name: '执行力', max: 100 },
    { name: '团队协作', max: 100 },
    { name: '抗压能力', max: 100 }
  ]
  const values = profile.value?.radar?.values ?? Array.from({ length: indicators.length }, () => 60)

  const option = {
    title: {
      text: '综合能力维度图',
      left: 'center',
      textStyle: { color: '#1f2937', fontSize: 16 }
    },
    radar: {
      indicator: indicators,
      shape: 'circle',
      splitNumber: 5,
      axisName: { color: '#6b7280' },
      splitLine: { lineStyle: { color: '#e5e7eb' } },
      splitArea: { areaStyle: { color: ['#f9fafb', '#f3f4f6'] } },
      axisLine: { lineStyle: { color: '#e5e7eb' } }
    },
    series: [
      {
        name: '能力评分',
        type: 'radar',
        data: [
          {
            value: values,
            name: '当前水平',
            areaStyle: { color: 'rgba(2, 73, 42, 0.18)' },
            lineStyle: { color: '#02492a', width: 2 },
            itemStyle: { color: '#02492a' }
          }
        ]
      }
    ]
  }
  myChart.setOption(option)
}

const initBarChart = () => {
  if (!barChartRef.value) return
  const myChart = echarts.init(barChartRef.value)
  charts.push(myChart)
  const option = {
    title: {
      text: '岗位匹配度分析',
      left: 'center',
      textStyle: { color: '#1f2937', fontSize: 16 }
    },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: recommendedJobs.value.map(j => j.jobName),
      axisLabel: { color: '#6b7280' }
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: '#6b7280' }
    },
    series: [
      {
        data: matchScores.value,
        type: 'bar',
        barWidth: '40%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#c1b0ff' },
            { offset: 1, color: '#43089f' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      }
    ]
  }
  myChart.setOption(option)
}
</script>

<template>
  <div class="profile-page clay-page">

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
        <p class="loading-hint">正在为您生成个性化能力画像，请稍候...</p>
      </div>
    </div>

    <div class="profile-container">
      <!-- 顶部标题 -->
      <div class="header-section">
        <div class="title-wrapper">
          <Trophy class="icon-trophy" :size="32" />
          <h1 class="main-title">个人能力画像</h1>
        </div>
        <p class="subtitle">基于您的 MBTI 测评与经历，深度解析您的职场基因</p>
      </div>

      <el-row :gutter="24">
        <!-- 左侧：图表分析 -->
        <el-col :span="14">
          <div class="chart-card mb-6">
            <div ref="radarChartRef" class="chart-container"></div>
          </div>
          <div class="chart-card">
            <div ref="barChartRef" class="chart-container"></div>
          </div>
        </el-col>

        <!-- 右侧：推荐与建议 -->
        <el-col :span="10">
          <!-- 核心特质 -->
          <div class="info-card mb-6">
            <div class="card-header">
              <Target class="icon-accent" :size="20" />
              <h3 class="card-title">核心职场特质</h3>
            </div>
            <div class="tag-group">
              <el-tag
                v-for="t in (profile?.tags ?? [])"
                :key="t"
                type="primary"
                effect="plain"
              >
                {{ t }}
              </el-tag>
            </div>
            <p class="trait-desc">
              {{ profile?.suggestions?.shortTerm ?? '正在为你生成画像解读…' }}
            </p>
          </div>

          <!-- 推荐岗位 -->
          <div class="info-card">
            <div class="card-header">
              <Briefcase class="icon-accent" :size="20" />
              <h3 class="card-title">高匹配岗位推荐</h3>
            </div>
            <div class="job-list" v-if="primaryRecommended">
              <div class="job-item">
                <div class="job-info-top">
                  <h4 class="job-name">{{ primaryRecommended.title }}</h4>
                  <span class="match-rate">{{ matchScores[0] }}% 匹配</span>
                </div>
                <div class="job-details">
                  <p>
                    {{ primaryRecommended.job.companyName }} ·
                    {{ primaryRecommended.job.location }}
                  </p>
                  <p class="salary-text">
                    {{ primaryRecommended.job.salaryRange }}
                  </p>
                </div>
              </div>
            </div>
            <div class="job-list" v-else>
              <div class="job-item">
                <div class="job-info-top">
                  <h4 class="job-name">正在为你生成推荐岗位…</h4>
                  <span class="match-rate">--</span>
                </div>
              </div>
            </div>
            <el-button
              class="more-btn clay-btn-primary"
              type="primary"
              @click="
                router.push({
                  path: '/job-exploration',
                  query: {
                    preferred: (profile?.recommendedJobs ?? [])
                      .map(j => j.id)
                      .join(',')
                  }
                })
              "
            >
              去岗位探索
            </el-button>
          </div>
        </el-col>
      </el-row>

      <!-- 发展建议 -->
      <div class="suggestion-banner">
        <div class="suggestion-header">
          <TrendingUp :size="24" />
          <h3 class="banner-title">职场进阶建议</h3>
        </div>
        <div class="suggestion-grid">
          <div class="suggestion-item">
            <h4 class="item-label">短期目标</h4>
            <p class="item-content">
              {{ profile?.suggestions?.shortTerm ?? '—' }}
            </p>
          </div>
          <div class="suggestion-item">
            <h4 class="item-label">长期规划</h4>
            <p class="item-content">
              {{ profile?.suggestions?.longTerm ?? '—' }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.profile-page {
  min-height: 100vh;
  background-color: transparent;
}

.profile-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 104px 24px 60px;
}

/* 顶部样式 */
.header-section {
  text-align: center;
  margin-bottom: 40px;
}

.title-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
}

.icon-trophy {
  color: var(--clay-ube-800);
}

.main-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--clay-text);
  margin: 0;
}

.subtitle {
  color: var(--clay-text-subtle);
  font-size: 16px;
}

/* 卡片通用样式 */
.chart-card,
.info-card {
  background: var(--clay-surface);
  padding: 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.chart-card:hover,
.info-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--clay-shadow-hard);
}

/* 图表容器 */
.chart-container {
  height: 320px;
  width: 100%;
}

.mb-6 {
  margin-bottom: 24px;
}

/* 右侧内容样式 */
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.icon-accent {
  color: var(--clay-ube-800);
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-text);
  margin: 0;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.trait-desc {
  margin-top: 16px;
  font-size: 14px;
  color: var(--clay-text);
  line-height: 1.6;
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.job-item {
  padding: 16px;
  border-radius: 12px;
  background-color: #f5efe5;
  border: 1px dashed var(--clay-border);
}

.job-info-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.job-name {
  font-weight: 700;
  color: var(--clay-text);
  margin: 0;
}

.match-rate {
  color: var(--clay-ube-800);
  font-weight: 700;
  font-size: 14px;
}

.job-details {
  font-size: 12px;
  color: var(--clay-text-subtle);
}

.job-details p {
  margin: 4px 0;
}

.salary-text {
  color: var(--clay-text);
  font-weight: 500;
}

.more-btn {
  width: 100%;
  margin-top: 24px;
}

/* 建议横幅 */
.suggestion-banner {
  margin-top: 32px;
  padding: 28px 24px;
  border-radius: var(--clay-radius-section);
  border: 1px solid var(--clay-border-subtle);
  background: linear-gradient(135deg, #f5efe5 0%, #ffffff 55%, #c1b0ff 100%);
  color: var(--clay-text);
}

.suggestion-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.banner-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.suggestion-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.item-label {
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--clay-text);
}

.item-content {
  font-size: 14px;
  color: var(--clay-text);
  line-height: 1.6;
}

@media (max-width: 768px) {
  .suggestion-grid {
    grid-template-columns: 1fr;
  }
}
</style>
