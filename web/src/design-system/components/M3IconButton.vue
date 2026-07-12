<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  variant?: 'standard' | 'filled' | 'tonal' | 'outlined'
  disabled?: boolean
  selected?: boolean
}>(), {
  variant: 'standard',
  disabled: false,
  selected: false
})
</script>

<template>
  <span class="m3-icon-button-wrap">
    <md-icon-button v-if="variant === 'standard'" :disabled="disabled" :selected="selected" :aria-label="label">
      <slot />
    </md-icon-button>
    <md-filled-icon-button v-else-if="variant === 'filled'" :disabled="disabled" :selected="selected" :aria-label="label">
      <slot />
    </md-filled-icon-button>
    <md-filled-tonal-icon-button v-else-if="variant === 'tonal'" :disabled="disabled" :selected="selected" :aria-label="label">
      <slot />
    </md-filled-tonal-icon-button>
    <md-outlined-icon-button v-else :disabled="disabled" :selected="selected" :aria-label="label">
      <slot />
    </md-outlined-icon-button>
    <span class="m3-icon-button-tooltip" role="tooltip">{{ label }}</span>
  </span>
</template>

<style scoped>
.m3-icon-button-wrap {
  position: relative;
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
}
.m3-icon-button-wrap :deep(svg) { width: 22px; height: 22px; }
.m3-icon-button-tooltip {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 50%;
  width: max-content;
  max-width: 240px;
  transform: translateX(-50%);
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 5px 8px;
  background: var(--md-sys-color-inverse-surface);
  color: var(--md-sys-color-inverse-on-surface);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.m3-icon-button-wrap:hover .m3-icon-button-tooltip,
.m3-icon-button-wrap:focus-within .m3-icon-button-tooltip { opacity: 1; }
</style>
