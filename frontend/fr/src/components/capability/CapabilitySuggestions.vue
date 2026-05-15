<!--
  组件：职场进阶建议横幅
  职责：展示短期目标和长期规划建议
-->
<script setup lang="ts">
import { TrendingUp } from 'lucide-vue-next'

interface Props {
  shortTerm?: string | string[]
  longTerm?: string | string[]
}

const props = withDefaults(defineProps<Props>(), {
  shortTerm: '—',
  longTerm: '—'
})

// 将数组转换为字符串
const shortTermText = typeof props.shortTerm === 'string'
  ? props.shortTerm
  : Array.isArray(props.shortTerm)
    ? props.shortTerm.join('；')
    : '—'

const longTermText = typeof props.longTerm === 'string'
  ? props.longTerm
  : Array.isArray(props.longTerm)
    ? props.longTerm.join('；')
    : '—'
</script>

<template>
  <div class="suggestion-banner">
    <div class="suggestion-header">
      <TrendingUp :size="24" />
      <h3 class="banner-title">职场进阶建议</h3>
    </div>
    <div class="suggestion-grid">
      <div class="suggestion-item">
        <h4 class="item-label">短期目标</h4>
        <p class="item-content">
          {{ shortTermText }}
        </p>
      </div>
      <div class="suggestion-item">
        <h4 class="item-label">长期规划</h4>
        <p class="item-content">
          {{ longTermText }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.suggestion-banner {
  margin-top: 32px;
  padding: 28px 24px;
  border-radius: var(--clay-radius-section);
  border: 1px solid var(--clay-border-subtle);
  background: linear-gradient(135deg, #f5efe5 0%, #ffffff 55%, #c1b0ff 100%);
  color: var(--clay-text);
}

.suggestion-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.banner-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.suggestion-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.item-label {
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--clay-text);
}

.item-content {
  font-size: 14px;
  color: var(--clay-text);
  line-height: 1.6;
}

@media (max-width: 768px) {
  .suggestion-grid {
    grid-template-columns: 1fr;
  }
}
</style>
