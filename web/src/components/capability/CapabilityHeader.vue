<!--
  组件：能力画像页面头部
  职责：展示页面标题和副标题
-->
<script setup lang="ts">
import { Trophy } from 'lucide-vue-next'
</script>

<template>
  <div class="header-section">
    <div class="title-wrapper">
      <Trophy class="icon-trophy" :size="32" />
      <h1 class="main-title">个人能力画像</h1>
    </div>
    <p class="subtitle">基于您的 MBTI 测评与经历，深度解析您的职场基因</p>
  </div>
</template>

<style scoped>
.header-section {
  text-align: center;
  margin-bottom: 40px;
}

.title-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
}

.icon-trophy {
  color: var(--clay-ube-800);
}

.main-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--clay-text);
  margin: 0;
}

.subtitle {
  color: var(--clay-text-subtle);
  font-size: 16px;
}
</style>
