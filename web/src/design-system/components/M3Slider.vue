<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  label?: string
  labeled?: boolean
}>(), {
  modelValue: 0,
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  label: '滑杆',
  labeled: false
})
const emit = defineEmits<{ 'update:modelValue': [value: number]; change: [value: number] }>()
const valueFromEvent = (event: Event) => Number((event.target as HTMLInputElement).value)
</script>

<template>
  <md-slider
    :value="modelValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-label="label"
    :labeled="labeled"
    @input="emit('update:modelValue', valueFromEvent($event))"
    @change="emit('change', valueFromEvent($event))"
  />
</template>
