<script setup lang="ts">
import M3TextField from './M3TextField.vue'
withDefaults(defineProps<{ modelValue?: string; label?: string; disabled?: boolean; min?: string; max?: string }>(), { modelValue: '', label: '', disabled: false, min: undefined, max: undefined })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const update = (value: string | number) => emit('update:modelValue', String(value))
</script>

<template><M3TextField :model-value="modelValue" type="datetime-local" :label="label" :disabled="disabled" :min="min" :max="max" @update:model-value="update" /></template>
