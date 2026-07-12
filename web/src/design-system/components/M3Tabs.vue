<script setup lang="ts">
withDefaults(defineProps<{ ariaLabel?: string }>(), { ariaLabel: '页面视图' })
</script>

<template>
  <div class="m3-tabs" role="tablist" :aria-label="ariaLabel"><slot /></div>
</template>

<style scoped>
.m3-tabs {
  display: flex;
  min-height: 48px;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
</style>
