<script setup lang="ts">
withDefaults(defineProps<{ label: string; disabled?: boolean }>(), { disabled: false })
</script>

<template>
  <fieldset class="m3-radio-group" :disabled="disabled">
    <legend class="m3-radio-group__legend">{{ label }}</legend>
    <slot />
  </fieldset>
</template>

<style scoped>
.m3-radio-group { margin: 0; border: 0; padding: 0; }
.m3-radio-group__legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
