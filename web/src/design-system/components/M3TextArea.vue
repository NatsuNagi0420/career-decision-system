<script setup lang="ts">
import { ref } from 'vue'
import { useInheritedAccessibleName } from '../services/accessibleName'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue?: string | null
  label?: string
  rows?: number
  error?: boolean
  errorText?: string
  modelModifiers?: { trim?: boolean }
}>(), {
  modelValue: '',
  label: '',
  rows: 4,
  error: false,
  errorText: '',
  modelModifiers: () => ({})
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const fieldRef = ref<HTMLElement | null>(null)

useInheritedAccessibleName(fieldRef, () => props.label)

const updateValue = (event: Event) => {
  const raw = String((event.target as HTMLTextAreaElement).value ?? '')
  emit('update:modelValue', props.modelModifiers.trim ? raw.trim() : raw)
}
</script>

<template>
  <md-outlined-text-field
    ref="fieldRef"
    v-bind="$attrs"
    class="m3-text-area"
    type="textarea"
    :rows="rows"
    :value="modelValue ?? ''"
    :label="label"
    :error="error"
    :error-text="errorText"
    @input="updateValue"
  />
</template>

<style scoped>
.m3-text-area {
  width: 100%;
  min-width: 0;
  letter-spacing: 0;
  --md-outlined-text-field-container-shape: var(--md-sys-shape-corner-extra-small);
  --md-outlined-text-field-input-text-color: var(--md-sys-color-on-surface);
  --md-outlined-text-field-label-text-color: var(--md-sys-color-on-surface-variant);
  --md-outlined-text-field-outline-color: var(--md-sys-color-outline);
  --md-outlined-text-field-focus-outline-color: var(--md-sys-color-primary);
  --md-outlined-text-field-error-outline-color: var(--md-sys-color-error);
}
</style>
