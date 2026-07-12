<script setup lang="ts">
import { CircleAlert, Info, TriangleAlert } from 'lucide-vue-next'
import M3Button from './M3Button.vue'
import M3Dialog from './M3Dialog.vue'
import {
  acceptConfirm,
  cancelConfirm,
  confirmState
} from '@/design-system/services/feedback'
</script>

<template>
  <M3Dialog :model-value="confirmState.open" :title="confirmState.title" @update:model-value="cancelConfirm">
    <div class="confirm-content" :class="`tone-${confirmState.tone}`">
      <CircleAlert v-if="confirmState.tone === 'error'" :size="24" />
      <Info v-else-if="confirmState.tone === 'info'" :size="24" />
      <TriangleAlert v-else :size="24" />
      <p>{{ confirmState.message }}</p>
    </div>
    <template #actions>
      <M3Button variant="text" @click="cancelConfirm">{{ confirmState.cancelText }}</M3Button>
      <M3Button :class="{ 'destructive-confirm': confirmState.tone === 'error' }" @click="acceptConfirm">
        {{ confirmState.confirmText }}
      </M3Button>
    </template>
  </M3Dialog>
</template>

<style scoped>
.confirm-content { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 16px; }
.confirm-content p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
.confirm-content > svg { color: var(--career-sys-color-warning); }
.confirm-content.tone-error > svg { color: var(--md-sys-color-error); }
.confirm-content.tone-info > svg { color: var(--career-sys-color-info); }
.destructive-confirm { --md-filled-button-container-color: var(--md-sys-color-error); --md-filled-button-label-text-color: var(--md-sys-color-on-error); }
</style>
