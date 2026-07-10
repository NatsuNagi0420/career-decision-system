<!--
  组件：MBTI 测评进度条
  职责：展示测评进度和题目导航
-->
<script setup lang="ts">
defineProps<{
  currentIndex: number
  total: number
  progress: number
}>()
</script>

<template>
  <div class="quiz-progress">
    <div class="progress-text">
      第 {{ currentIndex + 1 }} / {{ total }} 题
    </div>
    <el-progress :percentage="progress" :stroke-width="8" />
  </div>
</template>

<style scoped>
.quiz-progress {
  margin-bottom: 32px;
}

.progress-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--clay-text);
  margin-bottom: 12px;
  text-align: center;
}
</style>
