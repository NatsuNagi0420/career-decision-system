<script setup lang="ts">
import M3Button from './M3Button.vue'

const props = withDefaults(defineProps<{ page: number; totalPages: number; disabled?: boolean; label?: string }>(), {
  disabled: false,
  label: '分页'
})
const emit = defineEmits<{ 'update:page': [value: number] }>()
const go = (page: number) => emit('update:page', Math.max(1, Math.min(props.totalPages, page)))
</script>

<template>
  <nav class="m3-pagination" :aria-label="label">
    <M3Button variant="outlined" :disabled="disabled || page <= 1" @click="go(page - 1)">上一页</M3Button>
    <span aria-live="polite">{{ page }} / {{ Math.max(1, totalPages) }}</span>
    <M3Button variant="outlined" :disabled="disabled || page >= totalPages" @click="go(page + 1)">下一页</M3Button>
  </nav>
</template>

<style scoped>
.m3-pagination { display: flex; min-height: 64px; align-items: center; justify-content: center; gap: var(--career-spacing-3); }
.m3-pagination span { color: var(--md-sys-color-on-surface-variant); font: 500 var(--md-sys-typescale-label-large-size) / var(--md-sys-typescale-label-large-line-height) var(--md-ref-typeface-plain); }
</style>
