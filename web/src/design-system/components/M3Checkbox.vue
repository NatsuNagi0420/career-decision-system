<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue?: boolean; disabled?: boolean; label?: string }>(), {
  modelValue: false,
  disabled: false,
  label: '复选框'
})
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <md-checkbox
    :checked="modelValue"
    :disabled="disabled"
    :aria-label="label"
    touch-target="wrapper"
    @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
  />
</template>
