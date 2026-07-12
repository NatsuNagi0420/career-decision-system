<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-vue-next'
import { dismissSnackbar, snackbarState } from '@/design-system/services/feedback'

const current = computed(() => snackbarState.queue[0])
let timer = 0

watch(current, (item) => {
  window.clearTimeout(timer)
  if (item) timer = window.setTimeout(() => dismissSnackbar(item.id), item.duration)
}, { immediate: true })

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <Teleport to="body">
    <Transition name="m3-snackbar">
      <div v-if="current" class="m3-snackbar" :class="`tone-${current.tone}`" role="status" aria-live="polite">
        <CircleCheck v-if="current.tone === 'success'" :size="20" />
        <TriangleAlert v-else-if="current.tone === 'warning'" :size="20" />
        <CircleAlert v-else-if="current.tone === 'error'" :size="20" />
        <Info v-else :size="20" />
        <span>{{ current.message }}</span>
        <button type="button" aria-label="关闭提示" @click="dismissSnackbar(current.id)"><X :size="18" /></button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m3-snackbar {
  position: fixed;
  z-index: 1000;
  right: 24px;
  bottom: 24px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: min(440px, calc(100vw - 32px));
  min-height: 48px;
  align-items: center;
  gap: 12px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 8px 8px 8px 16px;
  background: var(--md-sys-color-inverse-surface);
  color: var(--md-sys-color-inverse-on-surface);
  box-shadow: var(--md-sys-elevation-level3);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
}
.m3-snackbar.tone-success > svg { color: var(--career-sys-color-success-container); }
.m3-snackbar.tone-warning > svg { color: var(--career-sys-color-warning-container); }
.m3-snackbar.tone-error > svg { color: var(--md-sys-color-error-container); }
.m3-snackbar.tone-info > svg { color: var(--career-sys-color-info-container); }
.m3-snackbar button {
  display: inline-grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 0;
  border-radius: var(--md-sys-shape-corner-full);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.m3-snackbar button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.m3-snackbar-enter-active, .m3-snackbar-leave-active { transition: opacity var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized), transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized); }
.m3-snackbar-enter-from, .m3-snackbar-leave-to { opacity: 0; transform: translateY(24px); }
@media (max-width: 599px) { .m3-snackbar { right: 16px; bottom: 96px; } }
</style>
