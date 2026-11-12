<!-- 青穗集 · 处理中反馈：仅随真实等待状态挂载，三点错峰起伏。 -->
<template>
  <view
    class="activity-dots"
    :class="light ? 'activity-dots--light' : ''"
    role="status"
    :aria-label="label"
  >
    <view class="activity-dot" />
    <view class="activity-dot activity-dot--second" />
    <view class="activity-dot activity-dot--third" />
  </view>
</template>
<script setup lang="ts">
withDefaults(defineProps<{ label?: string; light?: boolean }>(), {
  label: "正在处理",
});
</script>
<style lang="scss">
.activity-dots {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 7rpx;
  min-width: 42rpx;
  height: 26rpx;
}
.activity-dot {
  width: 7rpx;
  height: 7rpx;
  border-radius: 50%;
  background: #9278b4;
  animation: activity-dot 1.15s ease-in-out infinite;
}
.activity-dot--second {
  animation-delay: 0.14s;
}
.activity-dot--third {
  animation-delay: 0.28s;
}
.activity-dots--light .activity-dot {
  background: #fff;
}
@keyframes activity-dot {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-5rpx);
  }
}
@media (prefers-reduced-motion: reduce) {
  .activity-dot {
    animation: none;
    opacity: 0.65;
  }
}
</style>
