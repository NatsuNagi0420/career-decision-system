<template>
  <div class="card section mb-6">
    <div class="section-head">
      <div class="section-title">职业价值观（3题）</div>
      <div class="text-sub text-sm">滑动条用于刻画你对目标的偏好权重</div>
    </div>
    <div v-for="(q, index) in questions" :key="index" class="value-q mb-4">
      <div class="q-text">{{ index + 1 }}. {{ q.text }}</div>
      <el-slider :model-value="modelValue[index]" :step="1" :max="10" show-stops @update:model-value="updateValue(index, $event)" />
      <div class="slider-labels">
        <span>极其不看重</span>
        <span>极其看重</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'EntryCareerValues'
})

interface Props {
  modelValue: number[]
}

interface Emits {
  (e: 'update:modelValue', value: number[]): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const questions = [
  { text: '您在工作中对"薪酬待遇"的看重程度' },
  { text: '您在工作中对"工作与生活平衡"的看重程度' },
  { text: '您在工作中对"社会地位与名望"的看重程度' }
]

const updateValue = (index: number, value: number) => {
  const newValues = [...props.modelValue]
  newValues[index] = value
  emit('update:modelValue', newValues)
}
</script>

<style scoped>
.section {
  padding: 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  box-shadow: var(--clay-shadow);
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-text);
  line-height: 1.2;
}

.value-q {
  margin-bottom: 16px;
}

.q-text {
  font-size: 14px;
  color: var(--clay-text);
  margin-bottom: 12px;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--clay-text-subtle);
  margin-top: -8px;
}
</style>
