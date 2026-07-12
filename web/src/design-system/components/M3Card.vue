<script setup lang="ts">
withDefaults(defineProps<{
  tag?: 'article' | 'section' | 'div' | 'button' | 'aside' | 'main' | 'form' | 'p'
  variant?: 'elevated' | 'filled' | 'outlined'
  interactive?: boolean
}>(), {
  tag: 'article',
  variant: 'filled',
  interactive: false
})
</script>

<template>
  <component :is="tag" class="m3-card" :class="[`m3-card--${variant}`, { 'm3-card--interactive': interactive }]" :type="tag === 'button' ? 'button' : undefined">
    <slot />
  </component>
</template>

<style scoped>
.m3-card {
  position: relative;
  min-width: 0;
  border-radius: var(--md-sys-shape-corner-medium);
  color: var(--md-sys-color-on-surface);
}
.m3-card--filled { border: 0; background: var(--md-sys-color-surface-container-highest); }
.m3-card--elevated { border: 0; background: var(--md-sys-color-surface-container-low); box-shadow: var(--md-sys-elevation-level1); }
.m3-card--outlined { border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface); }
.m3-card--interactive { cursor: pointer; transition: background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard), box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard); }
.m3-card--interactive:hover { background: var(--md-sys-color-surface-container-high); box-shadow: var(--md-sys-elevation-level1); }
</style>
