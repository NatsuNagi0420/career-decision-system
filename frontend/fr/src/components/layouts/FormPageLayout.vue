<!--
  组件：表单页布局模板 FormPageLayout
  职责：提供统一的表单页布局（标题、表单区、操作按钮）
  适用场景：测评问卷、信息录入、简历编辑、目标设置等
-->
<script setup lang="ts">
defineOptions({
  name: 'FormPageLayout'
})

defineProps<{
  title: string // 页面标题
  subtitle?: string // 副标题
  showProgress?: boolean // 是否显示进度条
  currentStep?: number // 当前步骤
  totalSteps?: number // 总步骤数
  loading?: boolean // 提交加载状态
}>()

const emit = defineEmits<{
  submit: []
  cancel: []
  prev: []
  next: []
}>()
</script>

<template>
  <div class="form-page-layout">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="title-section">
        <h1 class="page-title">{{ title }}</h1>
        <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
      </div>

      <!-- 进度指示器 -->
      <div v-if="showProgress && currentStep && totalSteps" class="progress-section">
        <div class="progress-text">
          第 {{ currentStep }} / {{ totalSteps }} 步
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${(currentStep / totalSteps) * 100}%` }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 表单内容区 -->
    <div class="form-content">
      <slot />
    </div>

    <!-- 操作按钮区 -->
    <div class="form-actions">
      <div class="actions-left">
        <slot name="actions-left">
          <el-button v-if="showProgress && currentStep && currentStep > 1" @click="emit('prev')">
            上一步
          </el-button>
        </slot>
      </div>
      <div class="actions-right">
        <slot name="actions-right">
          <el-button @click="emit('cancel')">取消</el-button>
          <el-button
            v-if="showProgress && currentStep && currentStep < totalSteps!"
            type="primary"
            @click="emit('next')"
          >
            下一步
          </el-button>
          <el-button
            v-else
            type="primary"
            :loading="loading"
            @click="emit('submit')"
          >
            提交
          </el-button>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-page-layout {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 页面头部 */
.page-header {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 32px;
  box-shadow: var(--clay-shadow);
}

.title-section {
  margin-bottom: 24px;
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

/* 进度指示器 */
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--clay-text);
  text-align: center;
}

.progress-bar {
  height: 8px;
  background: var(--clay-surface-variant);
  border-radius: var(--clay-radius-pill);
  overflow: hidden;
  border: 1px solid var(--clay-border-subtle);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--clay-matcha-600) 0%, var(--clay-slushie-500) 100%);
  border-radius: var(--clay-radius-pill);
  transition: width 0.3s ease;
}

/* 表单内容区 */
.form-content {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  padding: 32px;
  box-shadow: var(--clay-shadow);
}

/* 操作按钮区 */
.form-actions {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  padding: 20px 32px;
  box-shadow: var(--clay-shadow);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.actions-left,
.actions-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .form-page-layout {
    max-width: 100%;
  }

  .page-header {
    padding: 20px;
    border-radius: var(--clay-radius-card);
  }

  .page-title {
    font-size: 22px;
  }

  .form-content {
    padding: 20px;
  }

  .form-actions {
    padding: 16px 20px;
    flex-direction: column;
  }

  .actions-left,
  .actions-right {
    width: 100%;
    justify-content: stretch;
  }

  .actions-left :deep(.el-button),
  .actions-right :deep(.el-button) {
    flex: 1;
  }
}
</style>
