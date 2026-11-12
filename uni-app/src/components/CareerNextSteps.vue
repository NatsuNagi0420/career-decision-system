<!-- 青穗集 · 成长去向：确认后的资料可继续用于画像、岗位、行动和简历。 -->
<template>
  <view class="career-next-steps">
    <button
      :id="buttonRippleId(1, [item.path])"
      :style="buttonRippleStyle(1, [item.path])"
      @touchstart="startButtonRipple($event, 1, [item.path])"
      hover-class="button-hover"
      hover-stop-propagation
      :hover-start-time="0"
      :hover-stay-time="110"
      v-for="item in visibleLinks"
      :key="item.path"
      class="career-next-step qs-reveal qs-tap-target"
      @click="startButtonRipple($event, 1, [item.path]); open(item.path, item.tab)"
    >
      <image class="career-next-step-icon" :src="item.icon" />
      <text class="career-next-step-label">{{ item.label }}</text>
      <text class="qs-chevron">›</text>
    </button>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { computed } from "vue";
import { assetPaths } from "../static/assets";
import { setCareerSource } from "../services/career-context";
const props = defineProps<{ source: string; hideProfile?: boolean }>();
const links = [
  {
    label: "个人画像",
    path: "/pages/profile/index",
    icon: assetPaths.prototype.navProfile,
    tab: false,
  },
  {
    label: "方向与岗位",
    path: "/pages/directions/index",
    icon: assetPaths.prototype.target,
    tab: false,
  },
  {
    label: "下一步行动",
    path: "/pages/growth/index",
    icon: assetPaths.prototype.navGrowth,
    tab: true,
  },
  {
    label: "我的简历",
    path: "/pages/resume/index",
    icon: assetPaths.prototype.resume,
    tab: false,
  },
];
const visibleLinks = computed(() =>
  props.hideProfile
    ? links.filter((item) => item.path !== "/pages/profile/index")
    : links,
);
function open(url: string, tab: boolean) {
  setCareerSource(props.source);
  if (tab) uni.switchTab({ url });
  else uni.navigateTo({ url });
}
</script>
<style lang="scss">
.career-next-steps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx;
  margin: 24rpx 0;
}
.career-next-step {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
  margin: 0;
  padding: 20rpx 16rpx;
  background: var(--qs-paper);
  border: 1rpx solid var(--qs-lilac);
  color: var(--qs-ink);
  border-radius: $qs-radius-control;
  @include qs-ui-type($qs-type-label);
  box-shadow: $qs-shadow-control;
  line-height: 1.5;
  text-align: left;
}
.career-next-step-icon {
  width: 36rpx;
  height: 36rpx;
  flex: none;
}
.career-next-step-label {
  flex: 1;
}
</style>
