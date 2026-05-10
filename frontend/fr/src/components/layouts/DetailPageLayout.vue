<!--
  组件：详情页布局模板 DetailPageLayout
  职责：提供统一的详情页布局（面包屑、标题、标签、主内容、侧边栏）
  适用场景：岗位详情、专业详情、企业详情、课程详情等
-->
<script setup lang="ts">
defineOptions({
  name: 'DetailPageLayout'
})

const props = defineProps<{
  title: string // 页面标题
  subtitle?: string // 副标题
  tags?: string[] // 标签列表
  showBreadcrumb?: boolean // 是否显示面包屑
  showSidebar?: boolean // 是否显示侧边栏
  loading?: boolean // 加载状态
}>()

const emit = defineEmits<{
  back: []
}>()
</script>

<template>
  <div class="detail-page-layout">
    <!-- 面包屑导航 -->
    <div v-if="showBreadcrumb" class="breadcrumb-section">
      <slot name="breadcrumb">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
          <el-breadcrumb-item>{{ title }}</el-breadcrumb-item>
        </el-breadcrumb>
      </slot>
    </div>

    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-main">
        <button v-if="$slots.back" class="back-btn" type="button" @click="emit('back')">
          ← 返回
        </button>
        <div class="title-section">
          <h1 class="page-title">{{ title }}</h1>
          <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
          <div v-if="tags && tags.length" class="tags-section">
            <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
      <div class="header-actions">
        <slot name="header-actions" />
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="content-wrapper" :class="{ 'with-sidebar': showSidebar }">
      <!-- 主内容 -->
      <div class="main-content">
        <div v-if="loading" class="loading-state">
          <el-skeleton :rows="8" animated />
        </div>
        <div v-else class="content-body">
          <slot />
        </div>
      </div>

      <!-- 侧边栏 -->
      <aside v-if="showSidebar" class="content-sidebar">
        <slot name="sidebar" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.detail-page-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 面包屑 */
.breadcrumb-section {
  padding: 12px 0;
}

/* 页面头部 */
.page-header {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 32px;
  box-shadow: var(--clay-shadow);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.header-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.back-btn {
  align-self: flex-start;
  padding: 8px 16px;
  border-radius: var(--clay-radius-pill);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  color: var(--clay-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.back-btn:hover {
  background: var(--clay-surface-variant);
  transform: translateX(-2px);
}

.title-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-title {
  font-size: 32px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.page-subtitle {
  font-size: 16px;
  color: var(--clay-text-subtle);
  margin: 0;
  line-height: 1.6;
}

.tags-section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: var(--clay-radius-pill);
  background: var(--clay-surface-lemon);
  border: 1px solid var(--clay-lemon-400);
  color: var(--clay-lemon-800);
  font-size: 13px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* 内容区 */
.content-wrapper {
  display: grid;
  gap: 24px;
}

.content-wrapper.with-sidebar {
  grid-template-columns: 1fr 320px;
}

.main-content {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  box-shadow: var(--clay-shadow);
  overflow: hidden;
}

.loading-state {
  padding: 32px;
}

.content-body {
  padding: 32px;
}

.content-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .content-wrapper.with-sidebar {
    grid-template-columns: 1fr;
  }

  .content-sidebar {
    order: -1;
  }
}

@media (max-width: 768px) {
  .page-header {
    padding: 20px;
    border-radius: var(--clay-radius-card);
    flex-direction: column;
  }

  .page-title {
    font-size: 24px;
  }

  .page-subtitle {
    font-size: 14px;
  }

  .content-body {
    padding: 20px;
  }
}
</style>
