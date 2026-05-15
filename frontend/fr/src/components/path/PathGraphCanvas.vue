<!--
  组件：路径图谱画布
  职责：使用 ECharts 渲染职业晋升图谱
  性能优化：按需导入 ECharts 模块
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Sparkles, MousePointer2 } from 'lucide-vue-next'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import {
  TooltipComponent,
  LegendComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { PathGraphDraft } from '@/utils/storage'

echarts.use([
  GraphChart,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer
])

interface Props {
  graphData: PathGraphDraft | null
  loading: boolean
}

interface Emits {
  (e: 'nodeClick', node: Record<string, unknown>): void
  (e: 'regenerate'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const initGraph = () => {
  if (!chartRef.value || !props.graphData) return
  if (chart) chart.dispose()
  chart = echarts.init(chartRef.value as HTMLElement)

  const nodes = props.graphData.nodes || []
  const links = props.graphData.links || []

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (params: Record<string, unknown>) => {
        if (params.dataType === 'node') {
          const data = params.data as Record<string, unknown>
          return `岗位: ${data.name}`
        }
        const data = params.data as Record<string, unknown>
        return `类型: ${data.type === 'promotion' ? '晋升' : '换岗'}<br/>耗时: ${data.label}`
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
        data: nodes.map((n) => ({
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
        links: links.map((l) => ({
          source: nodes.find((n) => n.id === l.source)?.name,
          target: nodes.find((n) => n.id === l.target)?.name,
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

  chart.on('click', (params: Record<string, unknown>) => {
    if (params.dataType === 'node') {
      const node = nodes.find((n) => n.name === (params as Record<string, unknown>).name)
      if (node) emit('nodeClick', node as unknown as Record<string, unknown>)
    }
  })
}

const handleResize = () => {
  chart?.resize()
}

onMounted(() => {
  initGraph()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})

watch(
  () => props.graphData,
  () => {
    initGraph()
  },
  { deep: true }
)
</script>

<template>
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
        <el-button size="small" type="primary" link @click="emit('regenerate')">
          重新生成
        </el-button>
      </div>
    </div>
    <div ref="chartRef" class="graph-canvas"></div>
  </section>
</template>

<style scoped>
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

.section-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.text-mute {
  color: var(--clay-text-subtle);
  display: flex;
  align-items: center;
}

.text-xs {
  font-size: 12px;
}

.mr {
  margin-right: 6px;
}

.graph-canvas {
  flex: 1;
  min-height: 0;
}

.clay-card {
  background: var(--clay-surface);
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}
</style>
