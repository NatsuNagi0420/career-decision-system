<script setup lang="ts">
withDefaults(defineProps<{ label: string; selected?: boolean; disabled?: boolean; type?: 'assist' | 'filter' }>(), {
  selected: false,
  disabled: false,
  type: 'assist'
})
</script>

<template>
  <md-filter-chip v-if="type === 'filter'" :label="label" :selected="selected" :disabled="disabled" />
  <md-assist-chip v-else :label="label" :disabled="disabled" />
</template>
