<script setup lang="ts">
withDefaults(defineProps<{ value?: number; indeterminate?: boolean; label?: string }>(), {
  value: 0,
  indeterminate: false,
  label: '进度'
})
</script>

<template>
  <md-circular-progress :value="Math.max(0, Math.min(1, value))" :indeterminate="indeterminate" :aria-label="label" />
</template>
