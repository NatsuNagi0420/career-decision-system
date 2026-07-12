<script setup lang="ts">
withDefaults(defineProps<{ active?: boolean; disabled?: boolean }>(), { active: false, disabled: false })
</script>

<template>
  <button class="m3-tab" type="button" role="tab" :aria-selected="active" :disabled="disabled">
    <span v-if="$slots.icon" class="m3-tab__icon"><slot name="icon" /></span>
    <slot />
  </button>
</template>

<style scoped>
.m3-tab {
  position: relative;
  display: inline-flex;
  min-width: 90px;
  min-height: 48px;
  flex: 1 0 auto;
  align-items: center;
  justify-content: center;
  gap: var(--career-spacing-2);
  border: 0;
  padding: 0 var(--career-spacing-4);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  font: 500 var(--md-sys-typescale-title-small-size) / var(--md-sys-typescale-title-small-line-height) var(--md-ref-typeface-plain);
  letter-spacing: 0;
  cursor: pointer;
}
.m3-tab::after { position: absolute; right: var(--career-spacing-4); bottom: 0; left: var(--career-spacing-4); height: 3px; border-radius: var(--md-sys-shape-corner-full) var(--md-sys-shape-corner-full) 0 0; background: transparent; content: ''; }
.m3-tab:hover:not(:disabled) { background: color-mix(in srgb, var(--md-sys-color-on-surface) var(--career-state-hover-opacity), transparent); }
.m3-tab[aria-selected='true'] { color: var(--md-sys-color-primary); }
.m3-tab[aria-selected='true']::after { background: var(--md-sys-color-primary); }
.m3-tab:disabled { cursor: not-allowed; color: color-mix(in srgb, var(--md-sys-color-on-surface) var(--career-state-disabled-content-opacity), transparent); }
.m3-tab__icon { display: inline-flex; }
</style>
