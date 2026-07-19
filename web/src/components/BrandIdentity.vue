<script setup lang="ts">
import { brandAssets } from '@/assets/brand'

withDefaults(defineProps<{
  showAvatar?: boolean
  showDescriptor?: boolean
  compact?: boolean
}>(), {
  showAvatar: true,
  showDescriptor: true,
  compact: false
})
</script>

<template>
  <span class="brand-identity" :class="{ compact }">
    <span v-if="showAvatar" class="brand-identity__avatar" data-magnetic-preserve aria-hidden="true">
      <img :src="brandAssets.suinaAvatar" alt="" draggable="false" />
    </span>
    <span class="brand-identity__copy">
      <img class="brand-identity__wordmark" :src="brandAssets.wordmark" alt="青穗集" data-magnetic-preserve draggable="false" />
      <small v-if="showDescriptor" class="brand-identity__descriptor">职业决策与行动</small>
    </span>
  </span>
</template>

<style scoped>
.brand-identity { display: inline-flex; min-width: 0; align-items: center; gap: var(--career-spacing-3); }
.brand-identity__avatar { display: grid; width: 40px; height: 40px; flex: none; overflow: hidden; place-items: center; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-primary-container); }
.brand-identity__avatar img { width: 100%; height: 100%; object-fit: cover; }
.brand-identity__copy { display: grid; min-width: 0; justify-items: start; gap: 1px; }
.brand-identity__wordmark { display: block; width: 104px; height: 25px; object-fit: contain; object-position: left center; }
.brand-identity__descriptor { color: var(--md-sys-color-on-surface-variant); font: 500 var(--md-sys-typescale-label-small-size) / var(--md-sys-typescale-label-small-line-height) var(--md-ref-typeface-plain); white-space: nowrap; }
.brand-identity.compact { gap: var(--career-spacing-2); }
.brand-identity.compact .brand-identity__avatar { width: 36px; height: 36px; }
.brand-identity.compact .brand-identity__wordmark { width: 92px; height: 23px; }
</style>
