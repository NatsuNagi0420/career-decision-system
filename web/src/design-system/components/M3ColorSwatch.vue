<script setup lang="ts">
withDefaults(defineProps<{ color: string; label: string; selected?: boolean }>(), { selected: false })
</script>

<template>
  <button
    class="m3-color-swatch"
    type="button"
    :class="{ selected }"
    :style="{ '--m3-color-swatch': color }"
    :aria-label="label"
    :aria-pressed="selected"
    :title="label"
  />
</template>

<style scoped>
.m3-color-swatch { position: relative; width: 48px; height: 48px; border: 1px solid var(--md-sys-color-outline); border-radius: var(--md-sys-shape-corner-full); background: var(--m3-color-swatch); cursor: pointer; }
.m3-color-swatch::after { position: absolute; inset: 4px; border: 2px solid transparent; border-radius: inherit; content: ''; }
.m3-color-swatch:hover::after { border-color: color-mix(in srgb, var(--md-sys-color-on-surface) 24%, transparent); }
.m3-color-swatch.selected::after { border-color: var(--md-sys-color-surface); box-shadow: 0 0 0 2px var(--md-sys-color-primary); }
</style>
