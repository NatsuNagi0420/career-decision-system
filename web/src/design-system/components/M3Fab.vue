<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  size?: 'small' | 'medium' | 'large'
  variant?: 'primary' | 'surface' | 'secondary' | 'tertiary'
  lowered?: boolean
}>(), {
  size: 'medium',
  variant: 'primary',
  lowered: false
})
</script>

<template>
  <md-fab :aria-label="label" :size="size" :variant="variant" :lowered="lowered">
    <span slot="icon" class="m3-fab__icon"><slot /></span>
  </md-fab>
</template>

<style scoped>
.m3-fab__icon { display: inline-flex; align-items: center; justify-content: center; }
</style>
