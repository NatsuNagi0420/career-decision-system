<!--
  组件：岗位匹配度柱状图
  职责：使用 ECharts 渲染岗位匹配度分析图
  性能优化：按需导入 ECharts 模块
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  CanvasRenderer
])

interface Job {
  id: number
  jobName: string
  companyName: string
  location: string
  salaryRange: string
}

interface Props {
  jobs: Job[]
  scores: number[]
}

const props = withDefaults(defineProps<Props>(), {
  jobs: () => [],
  scores: () => []
})

const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)

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
      data: props.jobs.map(j => j.jobName),
      axisLabel: { color: '#6b7280' }
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: '#6b7280' }
    },
    series: [
      {
        data: props.scores,
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

  chartInstance.setOption(option)
}

const handleResize = () => {
  chartInstance?.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})

// 监听数据变化，重新渲染图表
watch(
  () => [props.jobs, props.scores],
  () => {
    if (chartInstance) {
      initChart()
    }
  },
  { deep: true }
)
</script>

<template>
  <div class="chart-card">
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<style scoped>
.chart-card {
  background: var(--clay-surface);
  padding: 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.chart-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--clay-shadow-hard);
}

.chart-container {
  height: 320px;
  width: 100%;
}
</style>
