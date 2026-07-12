<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

withDefaults(defineProps<{ label?: string }>(), { label: '菜单' })

const emit = defineEmits<{ close: [restoreFocus: boolean] }>()
const menuRef = ref<HTMLElement | null>(null)

const enabledItems = () => Array.from(menuRef.value?.querySelectorAll<HTMLElement>('md-menu-item:not([disabled])') ?? [])

const handleKeydown = (event: KeyboardEvent) => {
  const items = enabledItems()
  if (!items.length) return
  const currentIndex = items.findIndex((item) => item === document.activeElement || item === event.target)
  let nextIndex: number | undefined

  if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
  if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = items.length - 1
  if (nextIndex !== undefined) {
    event.preventDefault()
    items[nextIndex]?.focus()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close', true)
  } else if (event.key === 'Tab') {
    emit('close', false)
  }
}

onMounted(async () => {
  await nextTick()
  enabledItems()[0]?.focus()
})
</script>

<template><div ref="menuRef" class="m3-menu" role="menu" :aria-label="label" @keydown="handleKeydown"><slot /></div></template>

<style scoped>
.m3-menu { display: grid; min-width: 112px; max-width: 280px; border-radius: var(--md-sys-shape-corner-extra-small); padding-block: var(--career-spacing-2); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface); box-shadow: var(--md-sys-elevation-level2); }
</style>
