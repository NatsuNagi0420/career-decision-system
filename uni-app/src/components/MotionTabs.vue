<!-- 青穗集 · 分段切换：滑块轻回弹、选中文字抬起，点击反馈不阻塞筛选。 -->
<template>
  <view class="motion-tabs qs-motion-block" role="tablist" :aria-label="label">
    <view class="motion-tabs-track">
      <view class="motion-tabs-indicator" :style="indicatorStyle" />
      <button
        :id="buttonRippleId(1, [item.key])"
        :style="buttonRippleStyle(1, [item.key])"
        @touchstart="startButtonRipple($event, 1, [item.key])"
        hover-stop-propagation
        :hover-start-time="0"
        v-for="item in options"
        :key="item.key"
        class="motion-tab qs-tap-target"
        :class="modelValue === item.key ? 'motion-tab--active' : ''"
        hover-class="motion-tab--pressed"
        :hover-stay-time="100"
        role="tab"
        :aria-selected="modelValue === item.key"
        @click="startButtonRipple($event, 1, [item.key]); modelValue !== item.key && $emit('update:modelValue', item.key)"
      >
        <text class="motion-tab-label">{{ item.text }}</text>
      </button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { computed } from "vue";
const props = defineProps<{
  modelValue: string;
  options: Array<{ key: string; text: string }>;
  label: string;
}>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
const indicatorStyle = computed(() => ({
  width: 100 / Math.max(1, props.options.length) + "%",
  transform:
    "translateX(" +
    Math.max(
      0,
      props.options.findIndex((item) => item.key === props.modelValue),
    ) *
      100 +
    "%)",
}));
</script>
<style lang="scss">
.motion-tabs {
  padding: 7rpx;
  margin-bottom: 26rpx;
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-control;
  background: var(--qs-paper-soft);
}
.motion-tabs-track {
  position: relative;
  display: flex;
}
.motion-tabs-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-inset;
  background: var(--qs-paper);
  box-shadow: $qs-shadow-control;
  transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.18);
  pointer-events: none;
}
.motion-tab {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: center;
  min-height: 64rpx;
  margin: 0;
  padding: 0 12rpx;
  border: 0;
  border-radius: $qs-radius-inset;
  background: transparent;
  color: var(--qs-muted);
  @include qs-ui-type($qs-type-label);
  line-height: 1.3;
  transition: color 0.2s, transform 0.34s cubic-bezier(0.18, 0.9, 0.3, 1.45);
}
.motion-tab-label {
  display: inline-block;
  transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.4);
}
.motion-tab--active {
  color: #705992;
}
.motion-tab--active .motion-tab-label {
  transform: translateY(-2rpx) scale(1.04);
  animation: motion-tab-pick 0.4s ease-out;
}
.motion-tab--pressed {
  transform: translateY(2rpx) scale(0.95);
  transition-duration: 0.09s;
}
@keyframes motion-tab-pick {
  0% { transform: translateY(2rpx) scale(0.94); }
  55% { transform: translateY(-4rpx) scale(1.08); }
  100% { transform: translateY(-2rpx) scale(1.04); }
}
@media (prefers-reduced-motion: reduce) {
  .motion-tabs-indicator,
  .motion-tab,
  .motion-tab-label {
    transition: none;
    animation: none;
  }
  .motion-tab--active .motion-tab-label,
  .motion-tab--pressed {
    animation: none;
    transform: none;
  }
}
</style>
