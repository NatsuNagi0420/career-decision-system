<!-- 青穗集 · 首次读取占位：固定布局、单层淡变，避免逐条渐变扫描造成反复重绘。 -->
<template>
  <view
    class="loading-skeleton"
    role="status"
    aria-label="正在读取内容"
    aria-busy="true"
  >
    <view v-for="row in rows" :key="row" class="skeleton-row">
      <view class="skeleton-shape skeleton-icon" />
      <view class="skeleton-copy">
        <view class="skeleton-shape skeleton-bar" />
        <view class="skeleton-shape skeleton-bar skeleton-bar--long" />
        <view class="skeleton-shape skeleton-bar skeleton-bar--short" />
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 3 });
</script>
<style lang="scss">
.loading-skeleton {
  padding: 8rpx 0;
  animation: skeleton-breathe 1.6s ease-in-out infinite;
}
.skeleton-row {
  display: flex;
  align-items: flex-start;
  gap: 22rpx;
  padding: 30rpx 24rpx;
  margin-bottom: 18rpx;
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-card;
  background: var(--qs-paper);
}
.skeleton-copy {
  flex: 1;
  padding-top: 4rpx;
}
.skeleton-shape {
  background: var(--qs-paper-soft);
}
.skeleton-icon {
  width: 58rpx;
  height: 58rpx;
  border-radius: $qs-radius-control;
}
.skeleton-bar {
  width: 52%;
  height: 20rpx;
  margin-bottom: 18rpx;
  border-radius: 6rpx;
}
.skeleton-bar--long {
  width: 92%;
  height: 16rpx;
}
.skeleton-bar--short {
  width: 32%;
  height: 14rpx;
  margin-bottom: 0;
}
@keyframes skeleton-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.68;
  }
}
@media (prefers-reduced-motion: reduce) {
  .loading-skeleton {
    animation: none;
  }
}
</style>
