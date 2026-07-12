<script setup lang="ts">
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
</script>

<template>
  <md-menu-item class="m3-menu-item" :disabled="disabled">
    <span v-if="$slots.icon" slot="start" class="m3-menu-item__icon"><slot name="icon" /></span>
    <span slot="headline" class="m3-menu-item__label"><slot /></span>
  </md-menu-item>
</template>

<style scoped>
.m3-menu-item {
  width: 100%;
  --md-menu-item-container-color: transparent;
  --md-menu-item-label-text-color: var(--md-sys-color-on-surface);
  --md-menu-item-leading-icon-color: var(--md-sys-color-on-surface-variant);
  --md-menu-item-hover-state-layer-color: var(--md-sys-color-on-surface);
  --md-menu-item-hover-state-layer-opacity: var(--career-state-hover-opacity);
  --md-menu-item-pressed-state-layer-color: var(--md-sys-color-on-surface);
  --md-menu-item-pressed-state-layer-opacity: var(--career-state-pressed-opacity);
}
.m3-menu-item__icon, .m3-menu-item__label { display: inline-flex; align-items: center; }
</style>
