<!--
  组件：路径推荐列表
  职责：展示推荐的职业发展路径和操作按钮
-->
<script setup lang="ts">
import { Award, ExternalLink } from 'lucide-vue-next'

interface Props {
  recommendations: Array<Record<string, unknown>>
}

interface Emits {
  (e: 'saveToReport'): void
  (e: 'generateReport'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <section class="path-recommend clay-card">
    <div class="panel-title">
      <Award :size="18" />
      <span>路径推荐列表</span>
    </div>
    <div class="path-list">
      <div
        v-for="(p, pIdx) in recommendations"
        :key="'path-' + pIdx"
        class="path-item"
      >
        <div class="path-name">{{ p.name }}</div>
        <div
          class="path-steps"
          v-if="p && p.steps && Array.isArray(p.steps)"
        >
          <span
            v-for="(step, sIdx) in p.steps"
            :key="'step-' + pIdx + '-' + sIdx"
            class="step-container"
          >
            <span class="step">{{ step }}</span>
            <span
              v-if="Number(sIdx) < p.steps.length - 1"
              class="step-arrow"
              >→</span
            >
          </span>
        </div>
      </div>
    </div>
    <div class="actions mt-4">
      <el-button class="w-full" type="primary" @click="emit('saveToReport')">
        添加到报告
      </el-button>
      <el-button class="w-full mt-2" plain @click="emit('generateReport')">
        生成完整报告
        <ExternalLink :size="14" class="ml" />
      </el-button>
    </div>
  </section>
</template>

<style scoped>
.path-recommend {
  padding: 20px;
}

.clay-card {
  background: var(--clay-surface);
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  margin-bottom: 16px;
  color: var(--clay-text);
  font-size: 15px;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-item {
  padding: 12px;
  background: var(--clay-surface-variant);
  border-radius: 12px;
  border: 1px solid var(--clay-border-subtle);
}

.path-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--clay-ube-800);
  margin-bottom: 8px;
}

.path-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--clay-text);
}

.step-arrow {
  color: #cbd5e1;
}

.mt-4 {
  margin-top: 16px;
}

.mt-2 {
  margin-top: 8px;
}

.w-full {
  width: 100%;
}

.ml {
  margin-left: 6px;
}
</style>
