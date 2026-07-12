<script setup lang="ts">
withDefaults(defineProps<{ title?: string; description: string }>(), { title: '暂时无法加载' })
</script>

<template>
  <section class="m3-error-state" role="alert">
    <div><strong>{{ title }}</strong><p>{{ description }}</p></div>
    <slot name="actions" />
  </section>
</template>

<style scoped>
.m3-error-state { display: flex; align-items: center; justify-content: space-between; gap: var(--career-spacing-4); border-left: 4px solid var(--md-sys-color-error); border-radius: var(--md-sys-shape-corner-small); padding: var(--career-spacing-4); background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
.m3-error-state strong { font: 500 var(--md-sys-typescale-title-medium-size) / var(--md-sys-typescale-title-medium-line-height) var(--md-ref-typeface-brand); }
.m3-error-state p { margin: var(--career-spacing-1) 0 0; }
@media (max-width: 599px) { .m3-error-state { align-items: stretch; flex-direction: column; } }
</style>
