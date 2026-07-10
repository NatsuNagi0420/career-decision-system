<template>
  <aside class="list card">
    <div class="list-header">
      <div class="list-title">历史版本</div>
      <div class="list-sub">共 {{ archives.length }} 条</div>
    </div>
    <div v-if="archives.length === 0" class="list-empty text-sub">暂无数据</div>
    <div
      v-for="item in archives"
      :key="item.id"
      class="list-item"
      :class="{ active: item.id === selectedId }"
      @click="$emit('select', item)"
    >
      <div class="item-main">
        <div class="item-title">{{ item.title }}</div>
        <div class="item-meta">
          <span v-if="item.targetJobName" class="meta-tag">目标：{{ item.targetJobName }}</span>
        </div>
      </div>
      <div class="item-right">
        <div class="item-time">
          <Clock class="icon-clock" :size="14" />
          <span>{{ item.displayTime }}</span>
        </div>
        <ArrowRight :size="16" class="icon-arrow" />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Clock, ArrowRight } from 'lucide-vue-next'
import type { ArchiveListItem } from '@/composables/useReportsList'

defineProps<{
  archives: ArchiveListItem[]
  selectedId: string | null
}>()

defineEmits<{
  select: [item: ArchiveListItem]
}>()
</script>

<style scoped>
.list {
  padding: 16px;
  border-radius: var(--clay-radius-card);
}

.list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.list-title {
  font-weight: 900;
}

.list-sub {
  font-size: 12px;
  color: var(--clay-text-subtle);
}

.list-empty {
  padding: 12px 0;
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease, box-shadow 0.15s ease;
}

.list-item:hover {
  background: #f5efe2;
  transform: translateY(-1px);
}

.list-item.active {
  background: #fef6e7;
  box-shadow: 0 0 0 1px var(--clay-border-subtle);
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 4px;
}

.item-meta {
  font-size: 12px;
  color: #64748b;
}

.meta-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f5efe2;
}

.item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin-left: 10px;
}

.item-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #a8a29e;
}

.icon-clock {
  color: #a8a29e;
}

.icon-arrow {
  color: #d6c8b3;
}
</style>
