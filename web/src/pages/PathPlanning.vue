<!--
  页面：路径规划页（/path-planning）。
  职责：基于信息录入与深度测评等数据调用大模型生成职业路径图谱，
        以可视化形式展示节点与跳转路径，帮助用户理解成长路线。
-->
<script setup lang="ts">
import { onMounted } from 'vue'
import { Flag } from 'lucide-vue-next'
import { usePathPlanning } from '@/composables/usePathPlanning'
import PathLoadingOverlay from '@/components/path/PathLoadingOverlay.vue'
import PathGraphCanvas from '@/components/path/PathGraphCanvas.vue'
import PathNodeDetail from '@/components/path/PathNodeDetail.vue'
import PathRecommendations from '@/components/path/PathRecommendations.vue'

const {
  targetJob,
  graphData,
  selectedNode,
  selectedLink,
  loading,
  loadingState,
  fetchPathData,
  saveToReport,
  generateReport,
  changeTarget,
  selectNode,
  initialize
} = usePathPlanning()

onMounted(async () => {
  await initialize()
})
</script>

<template>
  <div class="plan-page clay-page">
    <PathLoadingOverlay
      :is-loading="loadingState.isLoading"
      :step="loadingState.step"
      :total="loadingState.total"
      :summary="loadingState.summary"
    />

    <div class="page-container">
      <div class="header mb-6">
        <div class="title-row">
          <Flag :size="22" class="title-icon" />
          <h1 class="title">路径规划</h1>
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
        <PathGraphCanvas
          :graph-data="graphData"
          :loading="loading"
          @node-click="selectNode"
          @regenerate="fetchPathData"
        />

        <aside class="sidebar">
          <PathNodeDetail
            :selected-node="selectedNode"
            :selected-link="selectedLink ?? null"
          />

          <PathRecommendations
            :recommendations="graphData?.recommendations ?? []"
            @save-to-report="saveToReport"
            @generate-report="generateReport"
          />
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
  padding: 24px 20px 60px;
}

.header {
  text-align: left;
}

.mb-6 {
  margin-bottom: 24px;
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

.text-sub {
  color: var(--clay-text-subtle);
  font-size: 16px;
}

.main-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 20px;
  align-items: start;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.empty {
  padding: 60px;
  text-align: center;
}

.clay-card {
  background: var(--clay-surface);
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}

.empty-title {
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 12px;
}

.clay-btn-primary {
  background: var(--clay-ube-800);
  border-color: var(--clay-ube-800);
}

@media (max-width: 1024px) {
  .main-layout {
    grid-template-columns: 1fr;
  }
}
</style>
