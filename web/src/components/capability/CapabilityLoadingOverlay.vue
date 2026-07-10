<!--
  组件：能力画像加载进度遮罩
  职责：显示生成进度和提示信息
-->
<script setup lang="ts">
interface Props {
  loading: boolean
  step: number
  total: number
  summary: string
}

defineProps<Props>()
</script>

<template>
  <div v-if="loading" class="loading-overlay">
    <div class="loading-content">
      <el-progress
        :percentage="Math.round((step / total) * 100)"
        :stroke-width="8"
        status="success"
      />
      <p class="loading-text">
        步骤 {{ step }}/{{ total }}: {{ summary }}
      </p>
      <p class="loading-hint">正在为您生成个性化能力画像，请稍候...</p>
    </div>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  width: 400px;
  padding: 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.loading-text {
  margin-top: 20px;
  font-size: 16px;
  color: #1f2937;
  font-weight: 500;
}

.loading-hint {
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
}
</style>
