<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'filled' | 'tonal' | 'outlined' | 'text'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  href?: string
  target?: string
}>(), {
  variant: 'filled',
  type: 'button',
  disabled: false,
  href: undefined,
  target: undefined
})
</script>

<template>
  <md-filled-button
    v-if="variant === 'filled'"
    class="m3-button"
    :type="type"
    :disabled="disabled"
    :href="href"
    :target="target"
  >
    <span v-if="$slots.icon" slot="icon" class="m3-button__icon"><slot name="icon" /></span>
    <span class="m3-button__label"><slot /></span>
  </md-filled-button>
  <md-filled-tonal-button
    v-else-if="variant === 'tonal'"
    class="m3-button"
    :type="type"
    :disabled="disabled"
    :href="href"
    :target="target"
  >
    <span v-if="$slots.icon" slot="icon" class="m3-button__icon"><slot name="icon" /></span>
    <span class="m3-button__label"><slot /></span>
  </md-filled-tonal-button>
  <md-outlined-button
    v-else-if="variant === 'outlined'"
    class="m3-button"
    :type="type"
    :disabled="disabled"
    :href="href"
    :target="target"
  >
    <span v-if="$slots.icon" slot="icon" class="m3-button__icon"><slot name="icon" /></span>
    <span class="m3-button__label"><slot /></span>
  </md-outlined-button>
  <md-text-button
    v-else
    class="m3-button"
    :type="type"
    :disabled="disabled"
    :href="href"
    :target="target"
  >
    <span v-if="$slots.icon" slot="icon" class="m3-button__icon"><slot name="icon" /></span>
    <span class="m3-button__label"><slot /></span>
  </md-text-button>
</template>

<style scoped>
.m3-button { min-width: 0; letter-spacing: 0; }
.m3-button__icon { display: inline-flex; align-items: center; justify-content: center; }
.m3-button__label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: var(--m3-button-label-gap, var(--career-spacing-2));
  line-height: var(--md-sys-typescale-label-large-line-height);
}
.m3-button__label > :deep(svg), .m3-button__label > :deep(img) { flex: 0 0 auto; }
</style>
