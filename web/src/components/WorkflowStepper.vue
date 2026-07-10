<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { workflowSteps } from '@/config/navigation'

defineOptions({ name: 'WorkflowStepper' })

const route = useRoute()

const activeIndex = computed(() => {
  const index = workflowSteps.findIndex(step => step.routes.includes(route.path))
  return index < 0 ? 0 : index
})
</script>

<template>
  <nav class="workflow-stepper" aria-label="职业决策流程">
    <router-link
      v-for="(step, index) in workflowSteps"
      :key="step.id"
      :to="step.path"
      class="workflow-step"
      :class="{
        active: index === activeIndex,
        done: index < activeIndex
      }"
    >
      <span class="step-index">{{ step.index }}</span>
      <span class="step-label">{{ step.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.workflow-stepper {
  max-width: 1400px;
  margin: 0 auto 16px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.workflow-step {
  min-height: 44px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-standard);
  background: var(--clay-surface);
  color: var(--clay-text-subtle);
  text-decoration: none;
  font-size: 14px;
  font-weight: 700;
  box-shadow: var(--clay-shadow);
}

.workflow-step:hover {
  background: var(--clay-surface-variant);
  color: var(--clay-text);
}

.workflow-step.active {
  border-color: #000;
  background: #000;
  color: #fff;
}

.workflow-step.done {
  color: var(--clay-text);
}

.step-index {
  width: 24px;
  height: 24px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--clay-surface-variant);
  font-size: 12px;
}

.workflow-step.active .step-index {
  background: #fff;
  color: #000;
}

.step-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .workflow-stepper {
    grid-template-columns: repeat(5, max-content);
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .workflow-step {
    min-width: 104px;
  }
}
</style>
