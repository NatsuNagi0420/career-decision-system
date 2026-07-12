<script setup lang="ts">
withDefaults(defineProps<{ label: string }>(), {})
</script>

<template><div class="m3-data-table" role="region" :aria-label="label" tabindex="0"><table><slot /></table></div></template>

<style scoped>
.m3-data-table { max-width: 100%; overflow: auto; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); }
.m3-data-table table { width: 100%; border-collapse: collapse; color: var(--md-sys-color-on-surface); }
.m3-data-table :deep(th) { height: 56px; background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); font: 500 var(--md-sys-typescale-title-small-size) / var(--md-sys-typescale-title-small-line-height) var(--md-ref-typeface-plain); text-align: left; }
.m3-data-table :deep(th), .m3-data-table :deep(td) { border-bottom: 1px solid var(--md-sys-color-outline-variant); padding: var(--career-spacing-3) var(--career-spacing-4); }
</style>
