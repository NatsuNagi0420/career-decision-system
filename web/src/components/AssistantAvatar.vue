<script setup lang="ts">
import { computed } from 'vue'
import { assistantAvatarAssets, type AssistantVisualState } from '@/assets/brand'

const props = withDefaults(defineProps<{
  state?: AssistantVisualState
  size?: 'small' | 'medium' | 'large'
  label?: string
}>(), {
  state: 'default',
  size: 'medium',
  label: ''
})

const source = computed(() => assistantAvatarAssets[props.state])
</script>

<template>
  <span class="assistant-avatar" :class="`assistant-avatar--${size}`" :data-assistant-state="state" data-magnetic-preserve>
    <Transition name="assistant-expression">
      <img :key="source" :src="source" alt="" :aria-label="label || undefined" draggable="false" />
    </Transition>
  </span>
</template>

<style scoped>
.assistant-avatar { position: relative; display: inline-grid; flex: none; overflow: hidden; place-items: center; border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 72%, transparent); border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container-lowest); }
.assistant-avatar--small { width: 32px; height: 32px; }
.assistant-avatar--medium { width: 42px; height: 42px; }
.assistant-avatar--large { width: 52px; height: 52px; }
.assistant-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.assistant-expression-enter-active, .assistant-expression-leave-active { transition: opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard); }
.assistant-expression-enter-from, .assistant-expression-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .assistant-expression-enter-active, .assistant-expression-leave-active { transition: none; }
}
</style>
