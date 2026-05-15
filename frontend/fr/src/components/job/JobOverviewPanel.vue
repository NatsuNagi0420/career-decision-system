<!--
  组件：岗位总览面板
  职责：展示行业趋势和高频技能
  性能优化：按需导入 ECharts 模块
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer
])

interface Props {
  overviewSkills: string[]
}

defineProps<Props>()

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
</script>

<template>
  <div class="overview">
    <div class="mini-title">行业趋势（示意）</div>
    <div ref="chartRef" class="chart"></div>
    <div class="mini-title mt-4">高频技能（示意）</div>
    <div class="tags">
      <el-tag
        v-for="s in overviewSkills"
        :key="s"
        effect="plain"
      >
        {{ s }}
      </el-tag>
    </div>
    <div class="mt-4 text-mute text-xs">
      选择岗位后将展示详情；选择 2 个以上可进入对比模式
    </div>
  </div>
</template>

<style scoped>
.overview {
  padding: 4px 0;
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

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.text-mute {
  color: var(--clay-text-subtle);
}

.text-xs {
  font-size: 12px;
}
</style>
