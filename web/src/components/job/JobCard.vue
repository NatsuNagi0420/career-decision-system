<!--
  组件：岗位卡片
  职责：展示单个岗位信息，支持对比和设为目标
-->
<script setup lang="ts">
import { Briefcase, MapPin, Scale, CheckCircle2 } from 'lucide-vue-next'
import type { JobListItem } from '@/composables/useJobExploration'

interface Props {
  job: JobListItem
  isActive: boolean
  isSelected: boolean
  isPreferred: boolean
  requirements: string[]
}

interface Emits {
  (e: 'click'): void
  (e: 'compare'): void
  (e: 'setTarget'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <div
    class="shop-card"
    :class="{ active: isActive }"
    @click="emit('click')"
  >
    <div class="shop-header">
      <div class="shop-price">{{ job.salaryRange }}</div>
      <div v-if="isPreferred" class="shop-badge">智能匹配</div>
      <div v-else class="shop-badge secondary">优先</div>
    </div>
    <div class="shop-body">
      <div class="shop-title">{{ job.jobName }}</div>
      <div class="shop-company">
        <Briefcase :size="14" class="icon-gray" />
        <span>{{ job.companyName }}</span>
      </div>
      <div class="shop-location">
        <MapPin :size="14" class="icon-gray" />
        <span>{{ job.location }}</span>
      </div>
      <div class="shop-tags">
        <span
          v-for="s in requirements.slice(0, 3)"
          :key="s"
          class="tag-mini"
        >
          {{ s }}
        </span>
      </div>
      <div class="shop-divider"></div>
      <div class="shop-footer">
        <button
          class="action-btn compare-btn"
          :class="{ 'is-selected': isSelected }"
          @click.stop="emit('compare')"
        >
          <Scale :size="14" />
          <span>{{ isSelected ? '取消' : '对比' }}</span>
        </button>
        <button
          class="action-btn target-btn"
          @click.stop="emit('setTarget')"
        >
          <CheckCircle2 :size="14" />
          <span>设为目标</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shop-card {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.shop-card:hover {
  border-color: var(--clay-ube-800);
  box-shadow: var(--clay-shadow);
  transform: translateY(-2px);
}

.shop-card.active {
  border-color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  box-shadow: var(--clay-shadow-hard);
}

.shop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.shop-price {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-ube-800);
}

.shop-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--clay-ube-800);
  color: white;
  font-weight: 600;
}

.shop-badge.secondary {
  background: var(--clay-surface-variant);
  color: var(--clay-text-subtle);
  border: 1px solid var(--clay-border);
}

.shop-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shop-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--clay-text);
}

.shop-company,
.shop-location {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--clay-text-subtle);
}

.icon-gray {
  color: var(--clay-text-subtle);
}

.shop-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.tag-mini {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--clay-surface-variant);
  color: var(--clay-text-subtle);
  border: 1px solid var(--clay-border-subtle);
}

.shop-divider {
  height: 1px;
  background: var(--clay-border);
  margin: 8px 0;
}

.shop-footer {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  color: var(--clay-text);
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  border-color: var(--clay-ube-800);
  color: var(--clay-ube-800);
}

.compare-btn.is-selected {
  background: var(--clay-ube-800);
  color: white;
  border-color: var(--clay-ube-800);
}

.target-btn {
  background: var(--clay-ube-800);
  color: white;
  border-color: var(--clay-ube-800);
}

.target-btn:hover {
  opacity: 0.9;
}
</style>
