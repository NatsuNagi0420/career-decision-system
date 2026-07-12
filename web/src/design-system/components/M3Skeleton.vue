<script setup lang="ts">
withDefaults(defineProps<{ height?: string; width?: string; rounded?: boolean }>(), {
  height: '20px',
  width: '100%',
  rounded: false
})
</script>

<template><span class="m3-skeleton" :class="{ rounded }" :style="{ height, width }" aria-hidden="true" /></template>

<style scoped>
.m3-skeleton { display: block; overflow: hidden; border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-surface-container-highest); }
.m3-skeleton::after { display: block; width: 42%; height: 100%; transform: translateX(-120%); background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent), transparent); animation: m3-skeleton-pulse 1.4s var(--md-sys-motion-easing-standard) infinite; content: ''; }
.m3-skeleton.rounded { border-radius: var(--md-sys-shape-corner-full); }
@keyframes m3-skeleton-pulse { to { transform: translateX(340%); } }
</style>
