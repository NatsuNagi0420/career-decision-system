<!-- 青穗集 · 底部面板：遮罩淡入、短上滑与落位回弹，完整退场且不阻塞快速重开。 -->
<template>
  <view
    v-if="rendered"
    class="motion-sheet-mask"
    :class="leaving ? 'motion-sheet-mask--leaving' : ''"
  >
    <view
      class="motion-sheet-backdrop"
      @click="requestClose"
      @touchmove.stop.prevent
    />
    <view
      class="motion-sheet-panel"
      :class="leaving ? 'motion-sheet-panel--leaving' : ''"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      @click.stop
    >
      <view class="motion-sheet-handle" />
      <slot />
    </view>
  </view>
</template>
<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
const props = defineProps<{ open: boolean; label: string; locked?: boolean }>();
const emit = defineEmits<{ (e: "close"): void; (e: "closed"): void }>();
const rendered = ref(false),
  leaving = ref(false);
let exitTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => props.open,
  (value) => {
    clearTimeout(exitTimer);
    if (value) {
      rendered.value = true;
      leaving.value = false;
    } else if (rendered.value) {
      leaving.value = true;
      exitTimer = setTimeout(() => {
        rendered.value = false;
        emit("closed");
      }, 180);
    }
  },
  { immediate: true },
);
function requestClose() {
  if (!props.locked && !leaving.value) emit("close");
}
onUnmounted(() => clearTimeout(exitTimer));
</script>
<style lang="scss">
.motion-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: flex-end;
  animation: motion-mask-in 0.2s ease both;
}
.motion-sheet-mask--leaving {
  animation: motion-mask-out 0.18s ease both;
}
.motion-sheet-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(35, 28, 52, 0.32);
}
.motion-sheet-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 88vh;
  padding: 18rpx 30rpx calc(30rpx + env(safe-area-inset-bottom));
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-sheet $qs-radius-sheet 0 0;
  background: var(--qs-paper);
  box-shadow: 0 -12rpx 60rpx rgba(52, 40, 75, 0.12);
  transform-origin: bottom center;
  animation: motion-sheet-in 0.36s ease-out both;
}
.motion-sheet-panel--leaving {
  animation: motion-sheet-out 0.18s ease-in both;
  pointer-events: none;
}
.motion-sheet-handle {
  flex: none;
  width: 62rpx;
  height: 7rpx;
  margin: 0 auto 22rpx;
  border-radius: 9rpx;
  background: var(--qs-lilac);
}
@keyframes motion-mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes motion-mask-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes motion-sheet-in {
  0% {
    transform: translateY(110rpx);
    opacity: 0;
  }
  72% {
    transform: translateY(-7rpx);
    opacity: 1;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes motion-sheet-out {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(45rpx);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .motion-sheet-mask,
  .motion-sheet-panel {
    animation: none;
  }
}
</style>
