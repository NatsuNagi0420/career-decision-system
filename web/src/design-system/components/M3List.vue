<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: '列表' })
</script>

<template><div class="m3-list" role="list" :aria-label="label"><slot /></div></template>

<style scoped>
.m3-list { display: grid; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); }
</style>
