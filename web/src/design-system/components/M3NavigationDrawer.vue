<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const props = withDefaults(defineProps<{ modelValue: boolean; label?: string; modal?: boolean }>(), {
  label: '导航抽屉',
  modal: true
})
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const close = () => emit('update:modelValue', false)
const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && props.modelValue) close() }

watch(() => props.modelValue, (open) => {
  document.body.style.overflow = open && props.modal ? 'hidden' : ''
}, { immediate: true })
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="m3-drawer">
      <div v-if="modelValue" class="m3-drawer-host" :class="{ modal }" @click.self="close">
        <aside class="m3-navigation-drawer" :aria-label="label"><slot /></aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m3-drawer-host { position: fixed; z-index: 900; inset: 0; display: flex; background: color-mix(in srgb, var(--md-sys-color-scrim) 32%, transparent); }
.m3-drawer-host:not(.modal) { width: fit-content; background: transparent; pointer-events: none; }
.m3-navigation-drawer { width: min(360px, calc(100vw - 56px)); height: 100%; overflow-y: auto; border-radius: 0 var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) 0; padding: var(--career-spacing-3); background: var(--md-sys-color-surface-container-low); color: var(--md-sys-color-on-surface); box-shadow: var(--md-sys-elevation-level1); pointer-events: auto; }
.m3-drawer-enter-active, .m3-drawer-leave-active { transition: opacity var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized); }
.m3-drawer-enter-from, .m3-drawer-leave-to { opacity: 0; }
</style>
