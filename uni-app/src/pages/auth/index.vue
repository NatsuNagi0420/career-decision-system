<!-- 青穗集 · 小程序登录页：官方账号登录与注册，模型密钥不会进入小程序。 -->
<template>
  <view :class="pageMotionClass" class="qs-page auth-page">
    <view class="auth-mark">
      <image
        class="qs-avatar-float"
        :src="assets.characters.suinaiAvatar"
        mode="aspectFit"
      />
      <view>
        <text class="qs-eyebrow">青穗集 · 穗奈</text>
        <text class="qs-title">随时继续你的思考。</text>
      </view>
    </view>

    <view class="auth-card qs-card qs-motion-block">
      <view class="auth-tabs">
        <button
          :id="buttonRippleId(1)"
          :style="buttonRippleStyle(1)"
          @touchstart="startButtonRipple($event, 1)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="qs-tap-target"
          :class="['auth-tab', mode === 'login' ? 'auth-tab--active' : '']"
          @click="startButtonRipple($event, 1); mode = 'login'"
        >
          登录
        </button>
        <button
          :id="buttonRippleId(2)"
          :style="buttonRippleStyle(2)"
          @touchstart="startButtonRipple($event, 2)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="qs-tap-target"
          :class="['auth-tab', mode === 'register' ? 'auth-tab--active' : '']"
          @click="startButtonRipple($event, 2); mode = 'register'"
        >
          注册
        </button>
      </view>
      <view class="field">
        <text class="field-label">用户名</text>
        <input
          v-model="username"
          class="field-input"
          maxlength="64"
          placeholder="输入官方账号"
        />
      </view>
      <view class="field">
        <text class="field-label">密码</text>
        <input
          v-model="password"
          class="field-input"
          password
          maxlength="200"
          :placeholder="mode === 'register' ? '至少 12 位' : '输入密码'"
        />
      </view>
      <label class="consent-row">
        <checkbox
          :checked="consent"
          color="#7656a5"
          @click="consent = !consent"
        />
        <text>允许穗奈把消息发送给所选模型服务</text>
      </label>
      <button
        :id="buttonRippleId(3)"
        :style="buttonRippleStyle(3)"
        @touchstart="startButtonRipple($event, 3, undefined, busy)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-button qs-button--primary auth-submit qs-tap-target"
        :disabled="busy"
        @click="startButtonRipple($event, 3, undefined, busy); submit()"
      >
        {{ busy ? "正在连接…" : mode === "login" ? "进入青穗集" : "创建账号" }}
      </button>
      <text v-if="errorMessage" class="auth-error">{{ errorMessage }}</text>
    </view>

    <view class="auth-note">
      <image :src="assets.icons.connection" mode="aspectFit" />
      <text>当前服务地址：{{ originLabel }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import {
  isAgentApiError,
  apiOriginLabel,
  authApi,
  clearToken,
  getToken,
  setToken,
} from "../../services/api";
import { assetPaths } from "../../static/assets";
const pageMotionClass = usePageMotion();

const assets = assetPaths;
const originLabel = apiOriginLabel();
const mode = ref<"login" | "register">("login");
const username = ref("");
const password = ref("");
const consent = ref(false);
const busy = ref(false);
const errorMessage = ref("");

onShow(() => {
  if (!getToken()) return;
  // 有旧令牌时先回到主页面；若令牌已过期，真实接口会把用户送回这里。
  uni.switchTab({ url: "/pages/home/index" });
});

async function submit() {
  errorMessage.value = "";
  if (
    !username.value.trim() ||
    !password.value ||
    (mode.value === "register" && password.value.length < 12)
  ) {
    errorMessage.value = "请输入官方账号和密码；注册密码至少 12 位。";
    return;
  }
  busy.value = true;
  try {
    const session =
      mode.value === "login"
        ? await authApi.login(username.value.trim(), password.value)
        : await authApi.register(
            username.value.trim(),
            password.value,
            consent.value,
          );
    setToken(session.token);
    if (consent.value && !session.user.external_ai_consent)
      await authApi.consent(true);
    uni.switchTab({ url: "/pages/home/index" });
  } catch (error) {
    if (isAgentApiError(error) && error.status === 0) {
      errorMessage.value = "连不上服务，请先启动 Agent 服务。";
    } else {
      errorMessage.value =
        error instanceof Error ? error.message : "登录没有完成，请稍后再试。";
    }
    clearToken();
  } finally {
    busy.value = false;
  }
}
</script>

<style lang="scss">
.auth-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  padding-top: 80rpx;
}
.auth-mark {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin: 0 10rpx 30rpx;
}
.auth-mark image {
  width: 118rpx;
  height: 118rpx;
  border-radius: 50%;
  background: $qingsui-primary-soft;
}
.auth-mark .qs-title {
  display: block;
  font-size: 39rpx;
}
.auth-card {
  padding: 28rpx 26rpx 24rpx;
}
.auth-tabs {
  display: flex;
  gap: 26rpx;
  margin-bottom: 24rpx;
  border-bottom: 1rpx solid $qingsui-paper-soft;
}
.auth-tab {
  position: relative;
  min-width: 100rpx;
  margin: 0;
  padding: 0 0 17rpx;
  border: 0;
  color: $qingsui-faint;
  background: transparent;
  font-size: 26rpx;
}
.auth-tab--active {
  color: $qingsui-primary;
}
.auth-tab--active::after {
  position: absolute;
  right: 12rpx;
  bottom: -1rpx;
  left: 12rpx;
  height: 5rpx;
  border-radius: 5rpx;
  background: $qingsui-primary;
  content: "";
}
.field {
  margin-top: 22rpx;
}
.field-label {
  display: block;
  margin-bottom: 9rpx;
  color: $qingsui-muted;
  @include qs-ui-type($qs-type-label);
}
.field-input {
  width: 100%;
  height: 82rpx;
  padding: 0 20rpx;
  border: 1rpx solid $qingsui-lilac;
  border-radius: $qs-radius-control;
  color: $qingsui-ink;
  background: $qingsui-paper;
  font-size: 25rpx;
}
.consent-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin: 26rpx 0 22rpx;
  color: $qingsui-muted;
  font-size: 20rpx;
  line-height: 1.5;
}
.consent-row checkbox {
  transform: scale(0.78);
  margin-left: -7rpx;
}
.auth-submit {
  width: 100%;
  min-height: 82rpx;
}
.auth-submit[disabled] {
  opacity: 0.55;
}
.auth-error {
  display: block;
  margin-top: 17rpx;
  color: $qingsui-danger;
  font-size: 20rpx;
  line-height: 1.5;
}
.auth-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  margin-top: 24rpx;
  color: $qingsui-faint;
  font-size: 19rpx;
}
.auth-note image {
  width: 25rpx;
  height: 25rpx;
}
</style>
