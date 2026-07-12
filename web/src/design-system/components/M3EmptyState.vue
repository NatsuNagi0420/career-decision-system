<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string }>(), { description: '' })
</script>

<template>
  <section class="m3-empty-state" role="status">
    <span v-if="$slots.icon" class="m3-empty-state__icon"><slot name="icon" /></span>
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.actions" class="m3-empty-state__actions"><slot name="actions" /></div>
  </section>
</template>

<style scoped>
.m3-empty-state { display: grid; min-height: 280px; place-content: center; justify-items: center; gap: var(--career-spacing-3); padding: var(--career-spacing-8); color: var(--md-sys-color-on-surface); text-align: center; }
.m3-empty-state__icon { display: grid; width: 56px; height: 56px; place-items: center; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.m3-empty-state h2 { margin: 0; font: 400 var(--md-sys-typescale-title-large-size) / var(--md-sys-typescale-title-large-line-height) var(--md-ref-typeface-brand); }
.m3-empty-state p { max-width: 520px; margin: 0; color: var(--md-sys-color-on-surface-variant); }
.m3-empty-state__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--career-spacing-2); margin-top: var(--career-spacing-2); }
</style>
