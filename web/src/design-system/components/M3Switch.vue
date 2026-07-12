<script setup lang="ts">
withDefaults(defineProps<{ modelValue?: boolean; disabled?: boolean; label?: string }>(), {
  modelValue: false,
  disabled: false,
  label: '开关'
})
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const updateValue = (event: Event) => {
  emit('update:modelValue', Boolean((event.target as HTMLElement & { selected?: boolean }).selected))
}
</script>

<template>
  <md-switch
    :selected="modelValue"
    :disabled="disabled"
    :aria-label="label"
    @change="updateValue"
  />
</template>
