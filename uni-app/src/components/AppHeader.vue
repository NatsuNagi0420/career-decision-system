<!-- 青穗集 · 移动顶栏：统一像素标题、返回入口与微信胶囊安全区，保留长副标题可读性。 -->
<template>
  <view
    class="app-header"
    :class="compact ? 'app-header--compact' : ''"
    :style="headerStyle"
  >
    <view class="app-header-row" :style="rowStyle">
      <button
        :id="buttonRippleId(1)"
        :style="buttonRippleStyle(1)"
        @touchstart="startButtonRipple($event, 1)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="back"
        class="app-header-back qs-icon-button qs-tap-target"
        aria-label="返回对话列表"
        @click="startButtonRipple($event, 1); goBack()"
      >
        <view class="app-header-back-arrow" />
      </button>
      <view :hover-class="subtitle ? 'qs-pressed' : 'none'" :hover-start-time="0" :hover-stay-time="110" class="app-header-title" :class="subtitle ? 'qs-press' : ''" @click="subtitle && $emit('context')">
        <image
          v-if="brand"
          class="app-header-avatar"
          :src="assetPaths.characters.suinaiAvatar"
          mode="aspectFit"
        />
        <view class="app-header-copy">
          <text
            class="app-header-heading"
            :class="brand ? 'app-header-brand' : ''"
          >
            {{ title }}
          </text>
          <text v-if="subtitle" class="app-header-subtitle">
            {{ subtitle }}
          </text>
        </view>
      </view>
      <view class="app-header-actions"><slot /></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { ref } from "vue";
import { assetPaths } from "../static/assets";
defineProps<{
  title: string;
  brand?: boolean;
  back?: boolean;
  compact?: boolean;
  subtitle?: string;
}>();
defineEmits<{ (e: "context"): void }>();
const headerStyle = ref<Record<string, string>>({}),
  rowStyle = ref<Record<string, string>>({});
function goBack() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: "/pages/home/index" }) });
}
// #ifdef MP-WEIXIN
try {
  const info = uni.getWindowInfo(),
    capsule = uni.getMenuButtonBoundingClientRect(),
    top = info.statusBarHeight || 20;
  headerStyle.value = { paddingTop: top + "px" };
  rowStyle.value = {
    height: Math.max(44, (capsule.top - top) * 2 + capsule.height) + "px",
    paddingRight: Math.max(0, info.windowWidth - capsule.left - 17) + "px",
  };
} catch {
  /* 使用系统安全区作为回退。 */
}
// #endif
</script>
<style lang="scss">
.app-header {
  margin: 0 -34rpx 24rpx;
  padding: env(safe-area-inset-top) 34rpx 0;
  background: transparent;
  flex: none;
}
.app-header-row {
  display: flex;
  min-height: 106rpx;
  align-items: center;
  gap: 12rpx;
}
.app-header-title {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
  flex: 1;
}
.app-header-avatar {
  width: 50rpx;
  height: 54rpx;
  flex: none;
}
.app-header-copy {
  min-width: 0;
}
.app-header-heading {
  display: block;
  @include qs-ui-type($qs-type-page);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-header-copy > .app-header-subtitle {
  display: block;
  font-size: 24rpx;
  font-weight: 400;
  color: var(--qs-muted);
  letter-spacing: 0;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 3rpx;
}
.app-header-actions {
  display: flex;
  align-items: center;
  gap: 4rpx;
  flex: none;
}
.app-header-actions .qs-icon-button {
  width: 62rpx;
  height: 64rpx;
  padding: 16rpx;
}
.app-header-back {
  width: 54rpx;
  height: 68rpx;
  padding: 18rpx 16rpx;
  flex: none;
  margin: 0;
}
.app-header-back-arrow {
  width: 20rpx;
  height: 20rpx;
  border-left: 3rpx solid var(--qs-ink);
  border-bottom: 3rpx solid var(--qs-ink);
  transform: rotate(45deg);
}
.app-header--compact {
  margin: 0;
  padding-left: 22rpx;
  padding-right: 22rpx;
  border-bottom: 1rpx solid var(--qs-lilac);
  background: var(--qs-paper);
}
.app-header--compact .app-header-row {
  min-height: 100rpx;
}
.app-header--compact .app-header-heading {
  font-family: $qingsui-font;
  font-size: $qs-type-body;
  font-weight: 500;
}
</style>
