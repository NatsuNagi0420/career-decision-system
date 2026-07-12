<script setup lang="ts">
withDefaults(defineProps<{ modelValue: string; label?: string; disabled?: boolean }>(), {
  label: '选择颜色',
  disabled: false
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    class="m3-color-picker"
    type="color"
    :value="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.m3-color-picker { width: 48px; height: 48px; overflow: hidden; border: 1px solid var(--md-sys-color-outline); border-radius: var(--md-sys-shape-corner-full); padding: var(--career-spacing-1); background: var(--md-sys-color-surface); cursor: pointer; }
.m3-color-picker:disabled { cursor: not-allowed; opacity: var(--career-state-disabled-content-opacity); }
</style>
