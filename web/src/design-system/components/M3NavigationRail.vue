<script setup lang="ts">
withDefaults(defineProps<{ ariaLabel?: string }>(), { ariaLabel: '主要导航' })
</script>

<template><nav class="m3-navigation-rail" :aria-label="ariaLabel"><slot /></nav></template>

<style scoped>
.m3-navigation-rail { display: flex; width: 80px; flex-direction: column; align-items: center; gap: var(--career-spacing-1); padding: var(--career-spacing-3) var(--career-spacing-2); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); }
</style>
