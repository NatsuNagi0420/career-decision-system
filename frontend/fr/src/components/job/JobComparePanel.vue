<!--
  组件：岗位对比面板
  职责：展示多个岗位的对比信息和趋势图
  性能优化：按需导入 ECharts 模块
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { X } from 'lucide-vue-next'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { JobListItem } from '@/composables/useJobExploration'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer
])

interface Props {
  selectedJobs: JobListItem[]
  targetId: string | null
}

interface Emits {
  (e: 'removeJob', job: JobListItem): void
  (e: 'gotoPlanning'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const initChart = () => {
  if (!chartRef.value) return
  if (chart) chart.dispose()
  chart = echarts.init(chartRef.value)
  chart.setOption({
    grid: { left: 24, right: 16, top: 24, bottom: 24 },
    xAxis: {
      type: 'category',
      data: ['1月', '2月', '3月', '4月', '5月', '6月'],
      axisLabel: { color: '#64748b' },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    series: [
      {
        type: 'line',
        data: [42, 50, 47, 58, 62, 70],
        smooth: true,
        lineStyle: { color: '#c1b0ff', width: 2 },
        itemStyle: { color: '#43089f' },
        areaStyle: { color: 'rgba(193, 176, 255, 0.2)' }
      }
    ]
  })
}

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  chart?.dispose()
})

watch(
  () => props.selectedJobs.length,
  () => {
    setTimeout(() => {
      chart?.resize()
    }, 0)
  }
)
</script>

<template>
  <div class="compare">
    <div class="compare-list mb-4">
      <div v-for="j in selectedJobs" :key="j.id" class="compare-item">
        <div class="compare-name">{{ j.jobName }}</div>
        <button
          class="icon-btn"
          type="button"
          @click="emit('removeJob', j)"
        >
          <X :size="16" />
        </button>
      </div>
    </div>
    <div class="mini-title">行业趋势（示意）</div>
    <div ref="chartRef" class="chart"></div>
    <el-button
      class="w-full mt-4 clay-btn-primary"
      type="primary"
      @click="emit('gotoPlanning')"
      :disabled="!targetId"
    >
      进入路径规划
    </el-button>
  </div>
</template>

<style scoped>
.compare {
  padding: 4px 0;
}

.compare-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mb-4 {
  margin-bottom: 16px;
}

.compare-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--clay-surface-variant);
  border-radius: 8px;
  border: 1px solid var(--clay-border);
}

.compare-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--clay-text);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--clay-text-subtle);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: var(--clay-surface);
  color: var(--clay-text);
}

.mini-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--clay-text);
  margin-bottom: 12px;
}

.chart {
  height: 200px;
  width: 100%;
}

.mt-4 {
  margin-top: 16px;
}

.w-full {
  width: 100%;
}

.clay-btn-primary {
  background: var(--clay-ube-800);
  border-color: var(--clay-ube-800);
}
</style>
