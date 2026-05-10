# 旧页面重构指南

> 本文档说明如何将现有页面重构为使用新的导航和布局系统

## 重构原则

1. **移除旧的 Navbar 组件**：所有页面不再需要单独引入 Navbar，由 MainLayout 统一管理
2. **应用布局模板**：根据页面类型选择合适的布局模板
3. **保持业务逻辑不变**：只改变布局结构，不修改核心功能
4. **使用 Clay 设计系统**：统一视觉风格

## 布局模板选择

| 页面类型 | 使用模板 | 示例页面 |
|---------|---------|---------|
| 表单页 | FormPageLayout | ComprehensiveEntry.vue |
| 列表页 | ListPageLayout | JobExploration.vue |
| 详情页 | DetailPageLayout | CapabilityProfile.vue, PathPlanning.vue, Report.vue |
| 可视化页 | DashboardLayout | 数据看板（待开发） |

## 重构步骤

### 1. 移除旧的 Navbar

**重构前：**
```vue
<template>
  <div class="page">
    <Navbar />
    <div class="page-container">
      <!-- 页面内容 -->
    </div>
  </div>
</template>

<script setup>
import Navbar from '../components/Navbar.vue'
</script>
```

**重构后：**
```vue
<template>
  <div class="page-content">
    <!-- 页面内容（MainLayout 会自动添加导航） -->
  </div>
</template>

<script setup>
// 不再需要导入 Navbar
</script>
```

### 2. 应用布局模板

#### 示例 1：表单页重构（ComprehensiveEntry.vue）

**重构前：**
```vue
<template>
  <div class="comprehensive-entry-page">
    <Navbar />
    <div class="page-container">
      <div class="card section">
        <div class="section-title">综合信息录入</div>
        <!-- 表单内容 -->
      </div>
    </div>
  </div>
</template>
```

**重构后：**
```vue
<template>
  <FormPageLayout
    title="综合信息录入"
    subtitle="填写越完整，后续能力画像、岗位匹配与计划生成越准确"
    :show-progress="true"
    :current-step="currentStep"
    :total-steps="5"
    :loading="isSubmitting"
    @submit="handleSubmit"
    @cancel="handleCancel"
  >
    <!-- 表单内容 -->
    <el-form :model="form" label-position="top">
      <!-- 表单字段 -->
    </el-form>
  </FormPageLayout>
</template>

<script setup>
import FormPageLayout from '@/components/layouts/FormPageLayout.vue'
</script>
```

#### 示例 2：列表页重构（JobExploration.vue）

**重构前：**
```vue
<template>
  <div class="job-exploration-page">
    <Navbar />
    <div class="page-container">
      <div class="search-section">
        <!-- 搜索框 -->
      </div>
      <div class="job-list">
        <!-- 岗位列表 -->
      </div>
    </div>
  </div>
</template>
```

**重构后：**
```vue
<template>
  <ListPageLayout
    title="岗位探索"
    subtitle="基于你的能力画像，为你推荐匹配的岗位"
    :show-search="true"
    :show-filters="true"
    :loading="loading"
    :empty="jobs.length === 0"
    empty-text="暂无匹配岗位"
    @search="handleSearch"
    @refresh="loadJobs"
  >
    <template #filters>
      <!-- 筛选器 -->
    </template>

    <!-- 岗位列表 -->
    <div v-for="job in jobs" :key="job.id" class="job-card">
      <!-- 岗位卡片内容 -->
    </div>

    <template #pagination>
      <el-pagination
        v-model:current-page="currentPage"
        :total="total"
        @current-change="handlePageChange"
      />
    </template>
  </ListPageLayout>
</template>

<script setup>
import ListPageLayout from '@/components/layouts/ListPageLayout.vue'
</script>
```

#### 示例 3：详情页重构（CapabilityProfile.vue）

**重构前：**
```vue
<template>
  <div class="capability-profile-page">
    <Navbar />
    <div class="page-container">
      <div class="profile-header">
        <h1>能力画像</h1>
      </div>
      <div class="profile-content">
        <!-- 画像内容 -->
      </div>
    </div>
  </div>
</template>
```

**重构后：**
```vue
<template>
  <DetailPageLayout
    title="能力画像"
    subtitle="基于测评结果生成的个性化能力分析"
    :tags="['MBTI: INTJ', '技能评分: 85']"
    :show-breadcrumb="true"
    :show-sidebar="true"
    :loading="loading"
  >
    <template #breadcrumb>
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
        <el-breadcrumb-item :to="{ path: '/planning' }">规划管理</el-breadcrumb-item>
        <el-breadcrumb-item>能力画像</el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <template #header-actions>
      <el-button type="primary" @click="exportProfile">导出画像</el-button>
    </template>

    <!-- 主内容 -->
    <div class="profile-sections">
      <!-- 画像内容 -->
    </div>

    <template #sidebar>
      <!-- 侧边栏：快速导航、相关推荐等 -->
    </template>
  </DetailPageLayout>
</template>

<script setup>
import DetailPageLayout from '@/components/layouts/DetailPageLayout.vue'
</script>
```

## 样式调整

### 移除页面级容器样式

**重构前：**
```css
.page-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 104px 24px 60px; /* 为旧 Navbar 预留空间 */
}
```

**重构后：**
```css
/* 不再需要页面级容器，MainLayout 已处理 */
.page-content {
  /* 直接写内容样式 */
}
```

### 使用 Clay 设计系统变量

```css
/* 推荐使用 Clay 变量 */
.card {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  box-shadow: var(--clay-shadow);
}

.title {
  color: var(--clay-text);
  font-weight: 600;
}

.subtitle {
  color: var(--clay-text-subtle);
}
```

## 注意事项

1. **首页和登录页特殊处理**
   - 首页（Home.vue）：已重构，使用自定义布局
   - 登录页（Login.vue）：独立页面，不使用 MainLayout

2. **保持响应式**
   - 所有布局模板已内置响应式适配
   - 页面内容需要自行处理响应式

3. **路由配置不变**
   - 路由路径保持不变
   - 只改变页面内部结构

4. **渐进式重构**
   - 可以逐个页面重构，不影响其他页面
   - 建议优先重构使用频率高的页面

## 重构优先级

### 高优先级（P0）
- [x] Home.vue - 已完成
- [ ] ComprehensiveEntry.vue - 表单页，使用 FormPageLayout
- [ ] JobExploration.vue - 列表页，使用 ListPageLayout
- [ ] CapabilityProfile.vue - 详情页，使用 DetailPageLayout

### 中优先级（P1）
- [ ] PathPlanning.vue - 详情页，使用 DetailPageLayout
- [ ] Report.vue - 详情页，使用 DetailPageLayout
- [ ] ReportsList.vue - 列表页，使用 ListPageLayout

### 低优先级（P2）
- [x] Login.vue - 独立页面，无需重构

## 测试清单

重构完成后，需要测试：

- [ ] 页面正常渲染
- [ ] 导航栏显示正确
- [ ] 侧边栏根据当前路由显示对应菜单
- [ ] 移动端响应式正常
- [ ] 业务功能正常（表单提交、数据加载等）
- [ ] 样式符合 Clay 设计系统

## 示例代码仓库

完整的重构示例可以参考：
- `frontend/fr/src/pages/Home.vue` - 首页重构示例
- `frontend/fr/src/components/layouts/` - 布局模板组件

---

**维护者：** 开发团队  
**最后更新：** 2026-05-10
