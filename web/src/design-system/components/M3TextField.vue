<script setup lang="ts">
import { ref } from 'vue'
import { useInheritedAccessibleName } from '../services/accessibleName'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue?: string | number | null
  label?: string
  type?: string
  error?: boolean
  errorText?: string
  modelModifiers?: { number?: boolean; trim?: boolean }
}>(), {
  modelValue: '',
  label: '',
  type: 'text',
  error: false,
  errorText: '',
  modelModifiers: () => ({})
})

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
const fieldRef = ref<HTMLElement | null>(null)

useInheritedAccessibleName(fieldRef, () => props.label)

const updateValue = (event: Event) => {
  let value: string | number = String((event.target as HTMLInputElement).value ?? '')
  if (props.modelModifiers.trim) value = String(value).trim()
  if (props.modelModifiers.number && value !== '') value = Number(value)
  emit('update:modelValue', value)
}
</script>

<template>
  <md-outlined-text-field
    ref="fieldRef"
    v-bind="$attrs"
    class="m3-text-field"
    :value="modelValue ?? ''"
    :label="label"
    :type="type"
    :error="error"
    :error-text="errorText"
    @input="updateValue"
  />
</template>

<style scoped>
.m3-text-field {
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
