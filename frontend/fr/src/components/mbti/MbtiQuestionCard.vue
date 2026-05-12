<!--
  组件：MBTI 题目卡片
  职责：展示单个题目和选项，处理答案选择
-->
<script setup lang="ts">
export interface MbtiOption {
  id: number
  qId?: number
  optCode: string
  optContent: string
}

export interface MbtiQuestion {
  id: number
  qType: string
  content: string
  options: MbtiOption[]
}

defineProps<{
  question: MbtiQuestion
  questionNumber: number
  selectedAnswer?: string
}>()

const emit = defineEmits<{
  select: [optionCode: string]
}>()
</script>

<template>
  <div class="question-card">
    <div class="question-number">Q{{ questionNumber }}</div>
    <div class="question-text">{{ question.content }}</div>

    <div class="options-list">
      <div
        v-for="option in question.options"
        :key="option.id"
        class="option-item"
        :class="{ selected: selectedAnswer === option.optCode }"
        @click="emit('select', option.optCode)"
      >
        <div class="option-radio">
          <span v-if="selectedAnswer === option.optCode">✓</span>
        </div>
        <div class="option-text">{{ option.optContent }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.question-card {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 32px;
  box-shadow: var(--clay-shadow);
  margin-bottom: 24px;
}

.question-number {
  display: inline-block;
  padding: 6px 12px;
  border-radius: var(--clay-radius-pill);
  background: var(--clay-surface-variant);
  color: var(--clay-text);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}

.question-text {
  font-size: 18px;
  font-weight: 500;
  color: var(--clay-text);
  line-height: 1.6;
  margin-bottom: 24px;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 2px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface);
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-item:hover {
  border-color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  transform: translateX(4px);
}

.option-item.selected {
  border-color: var(--clay-ube-800);
  background: linear-gradient(135deg, var(--clay-surface) 0%, rgba(193, 176, 255, 0.1) 100%);
}

.option-radio {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--clay-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.option-item.selected .option-radio {
  border-color: var(--clay-ube-800);
  background: var(--clay-ube-800);
  color: #ffffff;
}

.option-text {
  flex: 1;
  font-size: 15px;
  color: var(--clay-text);
  line-height: 1.5;
}

@media (max-width: 768px) {
  .question-card {
    padding: 24px 20px;
  }
}
</style>
