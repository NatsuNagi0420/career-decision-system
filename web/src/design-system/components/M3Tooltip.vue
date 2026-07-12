<script setup lang="ts">
import { useId } from 'vue'
defineProps<{ text: string }>()
const id = useId()
</script>

<template>
  <span class="m3-tooltip-host">
    <slot :describedby="id" />
    <span :id="id" class="m3-tooltip" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.m3-tooltip-host { position: relative; display: inline-flex; }
.m3-tooltip { position: absolute; z-index: 20; top: calc(100% + var(--career-spacing-1)); left: 50%; width: max-content; max-width: 240px; transform: translateX(-50%); border-radius: var(--md-sys-shape-corner-extra-small); padding: 5px var(--career-spacing-2); background: var(--md-sys-color-inverse-surface); color: var(--md-sys-color-inverse-on-surface); font: 500 var(--md-sys-typescale-body-small-size) / var(--md-sys-typescale-body-small-line-height) var(--md-ref-typeface-plain); pointer-events: none; opacity: 0; transition: opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard); }
.m3-tooltip-host:hover .m3-tooltip, .m3-tooltip-host:focus-within .m3-tooltip { opacity: 1; }
</style>
