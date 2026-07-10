<!--
  组件：可视化页布局模板 DashboardLayout
  职责：提供统一的数据可视化页布局（标题、统计卡片、图表区）
  适用场景：数据看板、能力成长曲线、学习效率分析、求职数据统计等
-->
<script setup lang="ts">
defineOptions({
  name: 'DashboardLayout'
})

defineProps<{
  title: string // 页面标题
  subtitle?: string // 副标题
  showDateRange?: boolean // 是否显示日期范围选择
  loading?: boolean // 加载状态
}>()

const emit = defineEmits<{
  'date-change': [dateRange: [Date, Date]]
  refresh: []
}>()
</script>

<template>
  <div class="dashboard-layout">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="title-section">
        <h1 class="page-title">{{ title }}</h1>
        <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
      </div>
      <div class="header-actions">
        <slot name="header-actions">
          <el-date-picker
            v-if="showDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="emit('date-change', $event)"
          />
          <el-button type="primary" @click="emit('refresh')">刷新</el-button>
        </slot>
      </div>
    </div>

    <!-- 统计卡片区 -->
    <div v-if="$slots.stats" class="stats-section">
      <slot name="stats" />
    </div>

    <!-- 图表内容区 -->
    <div class="charts-section">
      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="6" animated />
      </div>
      <div v-else class="charts-grid">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 页面头部 */
.page-header {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 24px;
  box-shadow: var(--clay-shadow);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.title-section {
  flex: 1;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0 0 8px 0;
  letter-spacing: -0.02em;
}

.page-subtitle {
  font-size: 14px;
  color: var(--clay-text-subtle);
  margin: 0;
  line-height: 1.6;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 统计卡片区 */
.stats-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

/* 图表区 */
.charts-section {
  min-height: 400px;
}

.loading-state {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  padding: 32px;
}

.charts-grid {
  display: grid;
  gap: 24px;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .page-header {
    padding: 16px;
    border-radius: var(--clay-radius-card);
    flex-direction: column;
  }

  .page-title {
    font-size: 22px;
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
  }

  .header-actions :deep(.el-date-editor) {
    width: 100%;
  }

  .stats-section {
    grid-template-columns: 1fr;
  }
}
</style>
