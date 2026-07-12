<script setup lang="ts">
import { ref } from 'vue'
import M3Button from './M3Button.vue'

const props = withDefaults(defineProps<{
  label?: string
  accept?: string
  disabled?: boolean
  variant?: 'filled' | 'tonal' | 'outlined' | 'text'
}>(), {
  label: '选择文件',
  accept: '',
  disabled: false,
  variant: 'outlined'
})
const emit = defineEmits<{ selected: [file: File] }>()
const inputRef = ref<HTMLInputElement | null>(null)

const open = () => inputRef.value?.click()
const selected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('selected', file)
}
</script>

<template>
  <span class="m3-file-picker">
    <M3Button :variant="variant" :disabled="disabled" @click="open">
      <template v-if="$slots.icon" #icon><slot name="icon" /></template>
      {{ label }}
    </M3Button>
    <input ref="inputRef" type="file" :accept="accept" :disabled="disabled" tabindex="-1" @change="selected" />
  </span>
</template>

<style scoped>
.m3-file-picker { display: inline-flex; }
.m3-file-picker input { position: fixed; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
