<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string | number | null
  value: string | number
  name?: string
  disabled?: boolean
  label?: string
}>(), {
  modelValue: null,
  name: undefined,
  disabled: false,
  label: '单选项'
})
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<template>
  <md-radio
    :value="value"
    :name="name"
    :checked="modelValue === value"
    :disabled="disabled"
    :aria-label="label"
    touch-target="wrapper"
    @change="emit('update:modelValue', value)"
  />
</template>
