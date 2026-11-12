<!-- 青穗集 · 偏好设置：本机阅读偏好与真实模型调用授权分别保存。 -->
<template>
  <view :class="pageMotionClass" class="qs-page">
    <text class="qs-section-title">阅读</text>
    <view class="qs-card settings-list qs-motion-block">
      <picker
        :range="sizes.map((s) => s.label)"
        :value="sizeIndex"
        @change="changeSize"
      >
        <view hover-class="qs-pressed" :hover-start-time="0" :hover-stay-time="110" class="qs-list-row qs-press">
          <text class="qs-row-copy">对话文字大小</text>
          <text class="qs-row-note">{{ sizes[sizeIndex].label }} ⌄</text>
        </view>
      </picker>
    </view>
    <text class="qs-section-title">模型调用</text>
    <view class="qs-card consent-setting qs-motion-block">
      <view>
        <text>允许向模型发送消息与资料</text>
        <text class="qs-row-note">关闭后，执行前会再次征求你的同意。</text>
      </view>
      <switch
        :checked="consent"
        :disabled="busy"
        color="#8970bc"
        @change="changeConsent"
      />
    </view>
    <view v-if="error" class="qs-error">{{ error }}</view>
    <text class="qs-section-title">外观与设备</text>
    <view class="qs-card settings-note qs-motion-block">
      <text>外观采用浅色纸面与淡紫点缀。</text>
      <text>电脑项目、默认模型与远程权限在“我的设备”中设置。</text>
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-button qs-bottom-action qs-tap-target" @click="startButtonRipple($event, 1); devices()">
        管理设备
      </button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { authApi, hasToken, goToAuth } from "../../services/api";
import { errorText } from "../../services/workspace";
const pageMotionClass = usePageMotion();
const sizes = [
  { value: "standard", label: "标准" },
  { value: "large", label: "较大" },
  { value: "largest", label: "大号" },
];
const size = ref(uni.getStorageSync("qingsui.chat.text-size") || "standard"),
  consent = ref(false),
  busy = ref(false),
  error = ref("");
const sizeIndex = computed(() =>
  Math.max(
    0,
    sizes.findIndex((s) => s.value === size.value),
  ),
);
onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void authApi
    .me()
    .then((user) => {
      consent.value = user.external_ai_consent;
    })
    .catch((e) => {
      error.value = errorText(e);
    });
});
function changeSize(e: unknown) {
  const item = sizes[Number((e as { detail: { value: string } }).detail.value)];
  if (item) {
    size.value = item.value;
    uni.setStorageSync("qingsui.chat.text-size", item.value);
    uni.showToast({ title: "已保存", icon: "none" });
  }
}
async function changeConsent(e: unknown) {
  busy.value = true;
  error.value = "";
  try {
    const result = await authApi.consent(
      Boolean((e as { detail: { value: boolean } }).detail.value),
    );
    consent.value = result.external_ai_consent;
  } catch (err) {
    error.value = errorText(err);
  } finally {
    busy.value = false;
  }
}
function devices() {
  uni.navigateTo({ url: "/pages/devices/index" });
}
</script>
<style lang="scss">
.settings-list {
  overflow: hidden;
  padding: 0;
}
.settings-list .qs-row-copy {
  @include qs-ui-type(26rpx);
}
.consent-setting {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 25rpx;
  font-size: 26rpx;
  line-height: 1.7;
}
.consent-setting > view {
  flex: 1;
}
.settings-note {
  padding: 26rpx;
}
.settings-note > text {
  display: block;
  font-size: 26rpx;
  line-height: 1.8;
  margin-bottom: 16rpx;
}
</style>
