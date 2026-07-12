<script setup lang="ts">
withDefaults(defineProps<{ ariaLabel?: string }>(), { ariaLabel: '主要导航' })
</script>

<template><nav class="m3-navigation-bar" :aria-label="ariaLabel"><slot /></nav></template>

<style scoped>
.m3-navigation-bar { display: grid; min-height: 80px; align-items: center; background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); }
</style>
