<script setup lang="ts">
withDefaults(defineProps<{ ariaLabel?: string }>(), { ariaLabel: '应用栏' })
</script>

<template><header class="m3-top-app-bar" :aria-label="ariaLabel"><slot /></header></template>

<style scoped>
.m3-top-app-bar { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: var(--career-spacing-4); padding-inline: var(--career-spacing-4); background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); }
</style>
