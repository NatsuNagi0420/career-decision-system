<template>
  <div class="question-container mb-12">
    <div class="q-meta mb-4">
      <span class="q-type-badge">{{ question.qType }}</span>
      <div class="q-divider"></div>
    </div>

    <h2 class="q-content">
      {{ question.content }}
    </h2>

    <div class="options-list">
      <div
        v-for="opt in question.options"
        :key="opt.id"
        class="option-card"
        :class="{ 'is-active': selectedOption === opt.optCode }"
        @click="$emit('select', opt.optCode)"
      >
        <div class="opt-radio"></div>
        <span class="opt-text">{{ opt.optContent }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'EntryMbtiQuestion'
})

interface MbtiOption {
  id: number
  qId?: number
  optCode: string
  optContent: string
}

interface MbtiQuestion {
  id: number
  qType: string
  content: string
  options: MbtiOption[]
}

interface Props {
  question: MbtiQuestion
  selectedOption?: string
}

interface Emits {
  (e: 'select', optCode: string): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
.question-container {
  margin-bottom: 48px;
}

.q-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.q-type-badge {
  font-size: 12px;
  color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  padding: 2px 10px;
  border-radius: 4px;
  font-weight: 500;
}

.q-divider {
  flex: 1;
  height: 1px;
  background: var(--clay-border-subtle);
}

.q-content {
  min-height: 80px;
  font-size: 18px;
  color: var(--clay-text);
  line-height: 1.6;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.option-card {
  display: flex;
  align-items: center;
  padding: 18px 24px;
  border-radius: 12px;
  border: 1px solid var(--clay-border-subtle);
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-card:hover {
  border-color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  transform: translateY(-1px);
}

.option-card.is-active {
  border-color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  box-shadow: var(--clay-shadow);
}

.opt-radio {
  width: 20px;
  height: 20px;
  border: 2px solid var(--clay-border);
  border-radius: 50%;
  margin-right: 16px;
  position: relative;
  transition: all 0.2s;
}

.option-card.is-active .opt-radio {
  border-color: var(--clay-ube-800);
}

.option-card.is-active .opt-radio::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background: var(--clay-ube-800);
  border-radius: 50%;
}

.opt-text {
  font-size: 16px;
  color: var(--clay-text);
}

.option-card.is-active .opt-text {
  color: var(--clay-ube-800);
  font-weight: 500;
}
</style>
