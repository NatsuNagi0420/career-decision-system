<script setup lang="ts">
withDefaults(defineProps<{ visible: boolean; label?: string }>(), {
  label: '正在加载'
})
</script>

<template>
  <div v-if="visible" class="m3-progress-overlay" role="status" :aria-label="label">
    <md-circular-progress indeterminate />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.m3-progress-overlay {
  position: absolute;
  z-index: 8;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  border-radius: inherit;
  background: color-mix(in srgb, var(--md-sys-color-surface) 88%, transparent);
  color: var(--md-sys-color-on-surface-variant);
  font: 500 var(--md-sys-typescale-label-large-size) / var(--md-sys-typescale-label-large-line-height) var(--md-ref-typeface-plain);
}
.m3-progress-overlay md-circular-progress { --md-circular-progress-size: 42px; }
</style>
