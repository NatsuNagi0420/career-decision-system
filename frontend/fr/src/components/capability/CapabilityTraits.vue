<!--
  组件：核心职场特质卡片
  职责：展示用户的核心特质标签和描述
-->
<script setup lang="ts">
import { Target } from 'lucide-vue-next'

interface Props {
  tags: string[]
  description?: string | string[]
}

const props = withDefaults(defineProps<Props>(), {
  description: '正在为你生成画像解读…'
})

// 将数组转换为字符串
const descriptionText = typeof props.description === 'string'
  ? props.description
  : Array.isArray(props.description)
    ? props.description.join('；')
    : '正在为你生成画像解读…'
</script>

<template>
  <div class="info-card">
    <div class="card-header">
      <Target class="icon-accent" :size="20" />
      <h3 class="card-title">核心职场特质</h3>
    </div>
    <div class="tag-group">
      <el-tag
        v-for="tag in tags"
        :key="tag"
        type="primary"
        effect="plain"
      >
        {{ tag }}
      </el-tag>
    </div>
    <p class="trait-desc">
      {{ descriptionText }}
    </p>
  </div>
</template>

<style scoped>
.info-card {
  background: var(--clay-surface);
  padding: 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.info-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--clay-shadow-hard);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.icon-accent {
  color: var(--clay-ube-800);
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-text);
  margin: 0;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.trait-desc {
  margin-top: 16px;
  font-size: 14px;
  color: var(--clay-text);
  line-height: 1.6;
}
</style>
