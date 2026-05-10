<!--
  组件：列表页布局模板 ListPageLayout
  职责：提供统一的列表页布局（标题、搜索/筛选区、列表内容、分页）
  适用场景：岗位库、专业库、企业库、课程资源、面试题库等
-->
<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  name: 'ListPageLayout'
})

const props = defineProps<{
  title: string // 页面标题
  subtitle?: string // 副标题
  showSearch?: boolean // 是否显示搜索框
  showFilters?: boolean // 是否显示筛选区
  loading?: boolean // 加载状态
  empty?: boolean // 是否为空
  emptyText?: string // 空状态文案
  emptyIcon?: string // 空状态图标
}>()

const emit = defineEmits<{
  search: [keyword: string]
  refresh: []
}>()

const searchKeyword = defineModel<string>('searchKeyword', { default: '' })

const handleSearch = () => {
  emit('search', searchKeyword.value)
}
</script>

<template>
  <div class="list-page-layout">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <div class="title-section">
          <h1 class="page-title">{{ title }}</h1>
          <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
        </div>
        <div class="header-actions">
          <slot name="header-actions" />
        </div>
      </div>
    </div>

    <!-- 搜索和筛选区 -->
    <div v-if="showSearch || showFilters" class="search-filter-section">
      <!-- 搜索框 -->
      <div v-if="showSearch" class="search-box">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索..."
          clearable
          size="large"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <span class="search-icon">🔍</span>
          </template>
          <template #append>
            <el-button type="primary" @click="handleSearch">搜索</el-button>
          </template>
        </el-input>
      </div>

      <!-- 筛选区 -->
      <div v-if="showFilters" class="filters-box">
        <slot name="filters" />
      </div>
    </div>

    <!-- 列表内容区 -->
    <div class="list-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="5" animated />
      </div>

      <!-- 空状态 -->
      <div v-else-if="empty" class="empty-state">
        <div class="empty-icon">{{ emptyIcon || '📭' }}</div>
        <div class="empty-text">{{ emptyText || '暂无数据' }}</div>
        <el-button type="primary" @click="emit('refresh')">刷新</el-button>
      </div>

      <!-- 列表内容 -->
      <div v-else class="list-items">
        <slot />
      </div>
    </div>

    <!-- 分页区 -->
    <div class="pagination-section">
      <slot name="pagination" />
    </div>
  </div>
</template>

<style scoped>
.list-page-layout {
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
}

.header-content {
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

/* 搜索和筛选区 */
.search-filter-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-box {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  padding: 16px;
  box-shadow: var(--clay-shadow);
}

.search-icon {
  font-size: 16px;
}

.filters-box {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  padding: 16px;
  box-shadow: var(--clay-shadow);
}

/* 列表内容区 */
.list-content {
  min-height: 400px;
}

.loading-state {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  padding: 24px;
}

.empty-state {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 64px 24px;
  text-align: center;
  box-shadow: var(--clay-shadow);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-text {
  font-size: 16px;
  color: var(--clay-text-subtle);
  margin-bottom: 24px;
}

.list-items {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 分页区 */
.pagination-section {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .page-header {
    padding: 16px;
    border-radius: var(--clay-radius-card);
  }

  .header-content {
    flex-direction: column;
  }

  .page-title {
    font-size: 22px;
  }

  .search-box,
  .filters-box {
    padding: 12px;
  }

  .empty-state {
    padding: 48px 16px;
  }

  .empty-icon {
    font-size: 48px;
  }
}
</style>
