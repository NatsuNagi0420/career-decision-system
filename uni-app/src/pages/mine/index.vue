<!-- 青穗集 · 我的页面：统一像素字形、卡片入场与背景点阵位移，保留原业务和同步边界。 -->
<template>
  <view @touchstart="startSurfaceRipple($event)" @click="startSurfaceRipple($event)" :class="pageMotionClass" class="qs-page qs-page--tab">
    <DotBackground :ripples="surfaceRipples" />
    <!-- #ifdef MP-WEIXIN -->
    <view
      class="qs-page-frame"
      :style="pageFrameReady ? 'display: none;' : ''"
      aria-hidden="true"
    >
      <text class="qs-page-frame-title">我的</text>
      <view class="qs-page-frame-card" />
      <view class="qs-page-frame-line" />
      <view class="qs-page-frame-line qs-page-frame-line--short" />
    </view>
    <!-- #endif -->
    <AppHeader title="我的" />
    <view class="account-hero qs-motion-block">
      <view class="account-avatar" aria-label="当前用户头像">
        {{ user?.username?.trim().slice(0, 1).toUpperCase() || "我" }}
      </view>
      <view>
        <text class="account-name">{{ user?.username || "青穗集用户" }}</text>
        <text v-if="user" class="qs-row-note">账号 {{ user.id }}</text>
      </view>
    </view>
    <button
      :id="buttonRippleId(1)"
      :style="buttonRippleStyle(1)"
      @touchstart="startButtonRipple($event, 1)"
      hover-class="button-hover"
      hover-stop-propagation
      :hover-start-time="0"
      :hover-stay-time="110"
      class="mine-device-card qs-card qs-motion-block qs-motion-step-1 qs-tap-target"
      @click="startButtonRipple($event, 1); navigate('/pages/devices/index')"
    >
      <image :src="assets.computer" />
      <view>
        <text class="qs-row-title">我的电脑</text>
        <text class="qs-row-note">
          {{
            devicesReady
              ? devices.length
                ? devices.filter((d) => d.online).length +
                  " / " +
                  devices.length +
                  " 台在线"
                : "扫码连接电脑"
              : "设备状态暂未同步"
          }}
        </text>
      </view>
      <text class="qs-chevron">›</text>
    </button>
    <button
      :id="buttonRippleId(2)"
      :style="buttonRippleStyle(2)"
      @touchstart="startButtonRipple($event, 2)"
      hover-class="button-hover"
      hover-stop-propagation
      :hover-start-time="0"
      :hover-stay-time="110"
      class="points-card qs-card qs-motion-block qs-motion-step-2 qs-tap-target"
      @click="startButtonRipple($event, 2); navigate('/pages/credits/index')"
    >
      <image :src="assets.star" />
      <view>
        <text class="points-label">我的积分</text>
        <text class="points-number">
          {{
            credits
              ? formatPoints(credits.summary.remaining_points)
              : "查看余额"
          }}
        </text>
      </view>
      <text class="qs-chevron">›</text>
    </button>
    <view v-if="error" class="qs-error">
      {{ error }}
      <button :id="buttonRippleId(3)" :style="buttonRippleStyle(3)" @touchstart="startButtonRipple($event, 3)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 3); load()">重试</button>
    </view>
    <view class="mine-links qs-card qs-motion-block qs-motion-step-3">
      <button :id="buttonRippleId(4)" :style="buttonRippleStyle(4)" @touchstart="startButtonRipple($event, 4)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-list-row qs-tap-target" @click="startButtonRipple($event, 4); navigate('/pages/settings/index')">
        <image class="qs-list-icon" :src="assets.settings" />
        <view class="qs-row-copy">
          <text class="qs-row-title">偏好设置</text>
        </view>
        <text class="qs-chevron">›</text>
      </button>
      <button :id="buttonRippleId(5)" :style="buttonRippleStyle(5)" @touchstart="startButtonRipple($event, 5)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-list-row qs-tap-target" @click="startButtonRipple($event, 5); navigate('/pages/help/index')">
        <image class="qs-list-icon" :src="assets.help" />
        <view class="qs-row-copy">
          <text class="qs-row-title">帮助与反馈</text>
        </view>
        <text class="qs-chevron">›</text>
      </button>
      <button :id="buttonRippleId(6)" :style="buttonRippleStyle(6)" @touchstart="startButtonRipple($event, 6)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-list-row qs-tap-target" @click="startButtonRipple($event, 6); about()">
        <image class="qs-list-icon" :src="assets.clock" />
        <view class="qs-row-copy">
          <text class="qs-row-title">关于青穗集</text>
        </view>
        <text class="qs-chevron">›</text>
      </button>
    </view>
    <view class="mine-footer">
      <image :src="assetPaths.characters.suinaiAvatar" mode="aspectFit" />
      <text>穗奈和你，一起慢慢前进。</text>
    </view>
    <button :id="buttonRippleId(7)" :style="buttonRippleStyle(7)" @touchstart="startButtonRipple($event, 7)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="logout qs-tap-target" @click="startButtonRipple($event, 7); logout()">退出登录</button>
  </view>
</template>
<script setup lang="ts">
import DotBackground from "../../components/DotBackground.vue";
import { useSurfaceRipple } from "../../services/surface-ripple";
const { surfaceRipples, startSurfaceRipple } = useSurfaceRipple();
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { useTabPageFrame } from "../../services/tab-page-frame";
import { ref } from "vue";
import { onShow, onPullDownRefresh } from "@dcloudio/uni-app";
import {
  authApi,
  accountApi,
  hubApi,
  clearToken,
  hasToken,
  goToAuth,
  type SessionUser,
  type HubDevice,
  type OfficialCredits,
} from "../../services/api";
import { syncTabBarHighlight } from "../../services/tabbar";
import { assetPaths } from "../../static/assets";
import AppHeader from "../../components/AppHeader.vue";
import { errorText } from "../../services/workspace";
const pageMotionClass = usePageMotion();
const pageFrameReady = useTabPageFrame();
const devicesReady = ref(false);
const assets = assetPaths.prototype,
  user = ref<SessionUser | null>(null),
  devices = ref<HubDevice[]>([]),
  credits = ref<OfficialCredits | null>(null),
  error = ref("");
let busy = false;
onShow(() => {
  syncTabBarHighlight();
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void load();
});
onPullDownRefresh(async () => {
  try {
    await load();
  } finally {
    uni.stopPullDownRefresh();
  }
});
async function load() {
  if (busy) return;
  busy = true;
  error.value = "";
  try {
    const [me, list, points] = await Promise.allSettled([
      authApi.me(),
      hubApi.devices(),
      accountApi.credits(),
    ]);
    if (me.status === "fulfilled") user.value = me.value;
    else throw me.reason;
    devicesReady.value = list.status === "fulfilled";
    if (list.status === "fulfilled")
      devices.value = list.value.filter((d) => d.status === "active");
    if (points.status === "fulfilled") credits.value = points.value;
    else credits.value = null;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy = false;
  }
}
function navigate(url: string) {
  uni.navigateTo({ url });
}
function formatPoints(n: number) {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
function about() {
  uni.showModal({
    title: "青穗集 · 穗奈",
    content:
      "你的移动协作伙伴，也是职业成长的同行者。\n手机连接电脑与云端，让每次对话成为前进的积累。",
    showCancel: false,
  });
}
function logout() {
  uni.showModal({
    title: "退出登录？",
    content: "将清除当前登录状态，已同步的数据会保留。",
    confirmText: "退出",
    success: (r) => {
      if (r.confirm)
        void authApi
          .logout()
          .catch(() => undefined)
          .finally(() => {
            clearToken();
            user.value = null;
            devices.value = [];
            credits.value = null;
            goToAuth();
          });
    },
  });
}
</script>
<style lang="scss">
.mine-device-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  width: 100%;
  text-align: left;
  padding: 28rpx;
  margin-bottom: 18rpx;
  color: var(--qs-ink);
  background: var(--qs-paper);
  line-height: 1.5;
}
.mine-device-card > image {
  width: 64rpx;
  height: 64rpx;
  flex: none;
}
.mine-device-card > view {
  flex: 1;
}

.account-hero {
  display: flex;
  align-items: center;
  gap: 26rpx;
  margin: 10rpx 0 36rpx;
  padding: 8rpx 4rpx;
}
.account-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #78628f;
  font-size: 48rpx;
  font-weight:400;
  flex: none;
  width: 142rpx;
  height: 142rpx;
  border-radius: 50%;
  border: 1rpx solid #e1d6ec;
  background: #f1ebf8;
  padding: 10rpx;
}
.account-name {
  display: block;
  font-size: $qs-type-page;
  font-weight:400;
  line-height: 1.4;
}
.account-hero .qs-row-note {
  margin-top: 14rpx;
  font-size: 24rpx;
  color: var(--qs-muted);
}
.points-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  width: 100%;
  padding: 22rpx 26rpx;
  text-align: left;
  color: var(--qs-ink);
  background: var(--qs-primary-soft);
  border-color: var(--qs-lilac);
}
.points-card > image {
  width: 48rpx;
  height: 48rpx;
}
.points-card > view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}
.points-label {
  display: block;
  @include qs-ui-type($qs-type-label);
  color: #746586;
}
.points-number {
  display: block;
  @include qs-ui-type(36rpx);
  line-height: 1.5;
  color: #615079;
  font-variant-numeric: tabular-nums;
}
.mine-links {
  margin-top: 28rpx;
  padding: 0;
  overflow: hidden;
}
.mine-links .qs-row-title {
  @include qs-ui-type(26rpx);
}
.mine-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  background: var(--qs-primary-soft);
  border: 1rpx solid var(--qs-lilac);
  margin-top: 32rpx;
  min-height: 150rpx;
  padding: 8rpx 16rpx;
  border-radius: $qs-radius-card;
  overflow: hidden;
}
.mine-footer > image {
  width: 116rpx;
  height: 125rpx;
}
.mine-footer > text {
  @include qs-ui-type($qs-type-label);
  color: #746586;
}
.logout {
  margin-top: 34rpx;
  background: transparent;
  color: var(--qs-muted);
  font-size: 24rpx;
}
</style>
