<!--
  组件：能力雷达图
  职责：使用 ECharts 渲染能力维度雷达图
  性能优化：按需导入 ECharts 模块
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  RadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer
])

interface Indicator {
  name: string
  max: number
}

interface Props {
  indicators?: Indicator[]
  values?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  indicators: () => [
    { name: '专业技能', max: 100 },
    { name: '创新能力', max: 100 },
    { name: '沟通表达', max: 100 },
    { name: '学习能力', max: 100 },
    { name: '执行力', max: 100 },
    { name: '团队协作', max: 100 },
    { name: '抗压能力', max: 100 }
  ],
  values: () => []
})

const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)

  const chartValues = props.values.length > 0
    ? props.values
    : Array.from({ length: props.indicators.length }, () => 60)

  const option = {
    title: {
      text: '综合能力维度图',
      left: 'center',
      textStyle: { color: '#1f2937', fontSize: 16 }
    },
    radar: {
      indicator: props.indicators,
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
            value: chartValues,
            name: '当前水平',
            areaStyle: { color: 'rgba(2, 73, 42, 0.18)' },
            lineStyle: { color: '#02492a', width: 2 },
            itemStyle: { color: '#02492a' }
          }
        ]
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
  () => [props.indicators, props.values],
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
