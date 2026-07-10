<!--
  组件：功能模块入口卡片 FeatureCard
  职责：展示单个功能模块的入口，包含图标、标题、描述、状态标签
  使用 Clay 设计系统的 playful hover 动画
-->
<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  name: 'FeatureCard'
})

const props = defineProps<{
  icon: string // 图标 emoji
  title: string // 功能标题
  description: string // 功能描述
  status?: 'available' | 'coming-soon' | 'new' // 状态标签
  badge?: string // 自定义徽章文本
  color?: 'matcha' | 'slushie' | 'lemon' | 'ube' | 'pomegranate' | 'blueberry' // 主题色
  disabled?: boolean // 是否禁用
}>()

const emit = defineEmits<{
  click: []
}>()

// 状态标签文本
const statusText = computed(() => {
  if (props.badge) return props.badge
  if (props.status === 'new') return 'NEW'
  if (props.status === 'coming-soon') return '即将上线'
  return ''
})

// 状态标签样式类
const statusClass = computed(() => {
  if (props.status === 'new') return 'badge-new'
  if (props.status === 'coming-soon') return 'badge-coming'
  return ''
})

// 卡片主题色类
const colorClass = computed(() => {
  return props.color ? `color-${props.color}` : ''
})

const handleClick = () => {
  if (!props.disabled) {
    emit('click')
  }
}
</script>

<template>
  <div
    class="feature-card"
    :class="[colorClass, { disabled, 'has-status': !!statusText }]"
    @click="handleClick"
  >
    <!-- 状态徽章 -->
    <div v-if="statusText" class="card-badge" :class="statusClass">
      {{ statusText }}
    </div>

    <!-- 图标 -->
    <div class="card-icon">
      {{ icon }}
    </div>

    <!-- 内容 -->
    <div class="card-content">
      <h3 class="card-title">{{ title }}</h3>
      <p class="card-description">{{ description }}</p>
    </div>

    <!-- 箭头指示器 -->
    <div class="card-arrow">→</div>
  </div>
</template>

<style scoped>
.feature-card {
  position: relative;
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 24px;
  box-shadow: var(--clay-shadow);
  cursor: pointer;
  transition: transform 0.25s ease, box-shadow 0.25s ease, background-color 0.25s ease;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.feature-card:hover:not(.disabled) {
  transform: translateY(-4px) rotate(-1deg);
  box-shadow: var(--clay-shadow-hard);
  background: var(--clay-surface-variant);
}

.feature-card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 状态徽章 */
.card-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 10px;
  border-radius: var(--clay-radius-pill);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  z-index: 1;
}

.badge-new {
  background: var(--clay-matcha-300);
  color: var(--clay-matcha-800);
  border: 1px solid var(--clay-matcha-600);
}

.badge-coming {
  background: var(--clay-surface-variant);
  color: var(--clay-text-subtle);
  border: 1px solid var(--clay-border);
}

/* 图标 */
.card-icon {
  font-size: 48px;
  line-height: 1;
  transition: transform 0.25s ease;
}

.feature-card:hover:not(.disabled) .card-icon {
  transform: scale(1.1) rotate(-5deg);
}

/* 内容 */
.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.card-description {
  font-size: 14px;
  color: var(--clay-text-subtle);
  margin: 0;
  line-height: 1.6;
}

/* 箭头指示器 */
.card-arrow {
  align-self: flex-end;
  font-size: 24px;
  color: var(--clay-text-subtle);
  transition: transform 0.25s ease, color 0.25s ease;
}

.feature-card:hover:not(.disabled) .card-arrow {
  transform: translateX(4px);
  color: var(--clay-text);
}

/* 主题色变体 */
.feature-card.color-matcha:hover:not(.disabled) {
  border-color: var(--clay-matcha-600);
  background: linear-gradient(135deg, var(--clay-surface) 0%, rgba(132, 231, 165, 0.1) 100%);
}

.feature-card.color-slushie:hover:not(.disabled) {
  border-color: var(--clay-slushie-500);
  background: linear-gradient(135deg, var(--clay-surface) 0%, rgba(59, 211, 253, 0.1) 100%);
}

.feature-card.color-lemon:hover:not(.disabled) {
  border-color: var(--clay-lemon-500);
  background: linear-gradient(135deg, var(--clay-surface) 0%, rgba(251, 189, 65, 0.1) 100%);
}

.feature-card.color-ube:hover:not(.disabled) {
  border-color: var(--clay-ube-800);
  background: linear-gradient(135deg, var(--clay-surface) 0%, rgba(193, 176, 255, 0.1) 100%);
}

.feature-card.color-pomegranate:hover:not(.disabled) {
  border-color: var(--clay-pomegranate-400);
  background: linear-gradient(135deg, var(--clay-surface) 0%, rgba(252, 121, 129, 0.1) 100%);
}

.feature-card.color-blueberry:hover:not(.disabled) {
  border-color: var(--clay-blueberry-800);
  background: linear-gradient(135deg, var(--clay-surface) 0%, rgba(1, 65, 141, 0.1) 100%);
}

/* 响应式适配 */
@media (max-width: 768px) {
  .feature-card {
    padding: 20px;
  }

  .card-icon {
    font-size: 40px;
  }

  .card-title {
    font-size: 18px;
  }

  .card-description {
    font-size: 13px;
  }
}
</style>
