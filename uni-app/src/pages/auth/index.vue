/** 青穗集 · 小程序登录页：连接本机 8110 Agent，模型密钥不会进入小程序。 */
<template>
  <view class="qs-page auth-page qs-stagger">
    <view class="auth-mark"><image class="qs-avatar-float" :src="assets.characters.suinaiWave" mode="aspectFit" /><view><text class="qs-eyebrow">QINGSUI / LOCAL AGENT</text><text class="qs-title">先和穗奈见面。</text></view></view>

    <view class="auth-card qs-card">
      <view class="auth-tabs"><button :class="['auth-tab', mode === 'login' ? 'auth-tab--active' : '']" @click="mode = 'login'">登录</button><button :class="['auth-tab', mode === 'register' ? 'auth-tab--active' : '']" @click="mode = 'register'">注册</button></view>
      <view class="field"><text class="field-label">用户名</text><input v-model="username" class="field-input" maxlength="40" placeholder="输入用户名" /></view>
      <view class="field"><text class="field-label">密码</text><input v-model="password" class="field-input" password maxlength="128" placeholder="至少 8 位" /></view>
      <label class="consent-row"><checkbox :checked="consent" color="#7656a5" @click="consent = !consent" /><text>允许穗奈把消息发送给所选模型服务</text></label>
      <button class="qs-button qs-button--primary auth-submit qs-ripple" :disabled="busy" @click="submit">{{ busy ? '正在连接…' : mode === 'login' ? '进入青穗集' : '创建账号' }}</button>
      <button class="test-account qs-ripple" @click="fillTestAccount">填入本机测试账号</button>
      <text v-if="errorMessage" class="auth-error">{{ errorMessage }}</text>
    </view>

    <view class="auth-note"><image :src="assets.icons.connection" mode="aspectFit" /><text>当前调试地址：127.0.0.1:8110</text></view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { AgentApiError, authApi, clearToken, getToken, setToken } from "../../services/api";
import { assetPaths } from "../../static/assets";

const assets = assetPaths;
const mode = ref<"login" | "register">("login");
const username = ref("");
const password = ref("");
const consent = ref(false);
const busy = ref(false);
const errorMessage = ref("");
let checkedExistingSession = false;

onShow(() => {
  if (checkedExistingSession || !getToken()) return;
  checkedExistingSession = true;
  // 有旧令牌时先回到主页面；若令牌已过期，真实接口会把用户送回这里。
  uni.switchTab({ url: "/pages/home/index" });
});

function fillTestAccount() {
  mode.value = "login";
  username.value = "workbench_preview_1023";
  password.value = "Career-preview-2026";
  consent.value = true;
  errorMessage.value = "";
}

async function submit() {
  errorMessage.value = "";
  if (!username.value.trim() || password.value.length < 8) {
    errorMessage.value = "请输入用户名和至少 8 位密码。";
    return;
  }
  busy.value = true;
  try {
    const session = mode.value === "login"
      ? await authApi.login(username.value.trim(), password.value)
      : await authApi.register(username.value.trim(), password.value, consent.value);
    setToken(session.token);
    if (consent.value && !session.user.external_ai_consent) await authApi.consent(true);
    uni.switchTab({ url: "/pages/home/index" });
  } catch (error) {
    if (error instanceof AgentApiError && error.status === 0) {
      errorMessage.value = "连不上 8110，请先启动 Agent 服务。";
    } else {
      errorMessage.value = error instanceof Error ? error.message : "登录没有完成，请稍后再试。";
    }
    clearToken();
  } finally {
    busy.value = false;
  }
}
</script>

<style lang="scss">
.auth-page { display: flex; flex-direction: column; justify-content: center; min-height: 100vh; padding-top: 80rpx; }
.auth-mark { display: flex; align-items: center; gap: 18rpx; margin: 0 10rpx 30rpx; }
.auth-mark image { width: 118rpx; height: 118rpx; border-radius: 50%; background: $qingsui-primary-soft; }
.auth-mark .qs-title { display: block; font-size: 39rpx; }
.auth-card { padding: 28rpx 26rpx 24rpx; }
.auth-tabs { display: flex; gap: 26rpx; margin-bottom: 24rpx; border-bottom: 1rpx solid $qingsui-paper-soft; }
.auth-tab { position: relative; min-width: 100rpx; margin: 0; padding: 0 0 17rpx; border: 0; color: $qingsui-faint; background: transparent; font-size: 26rpx; }
.auth-tab--active { color: $qingsui-primary; }
.auth-tab--active::after { position: absolute; right: 12rpx; bottom: -1rpx; left: 12rpx; height: 5rpx; border-radius: 5rpx; background: $qingsui-primary; content: ""; }
.field { margin-top: 22rpx; }
.field-label { display: block; margin-bottom: 9rpx; color: $qingsui-muted; font-size: 21rpx; }
.field-input { width: 100%; height: 82rpx; padding: 0 20rpx; border: 1rpx solid $qingsui-lilac; border-radius: 16rpx; color: $qingsui-ink; background: #fff; font-size: 25rpx; }
.consent-row { display: flex; align-items: center; gap: 10rpx; margin: 26rpx 0 22rpx; color: $qingsui-muted; font-size: 20rpx; line-height: 1.5; }
.consent-row checkbox { transform: scale(.78); margin-left: -7rpx; }
.auth-submit { width: 100%; min-height: 82rpx; }
.auth-submit[disabled] { opacity: .55; }
.test-account { margin: 17rpx auto 0; padding: 0; border: 0; color: $qingsui-primary; background: transparent; font-size: 20rpx; }
.auth-error { display: block; margin-top: 17rpx; color: #ba5b64; font-size: 20rpx; line-height: 1.5; }
.auth-note { display: flex; align-items: center; justify-content: center; gap: 8rpx; margin-top: 24rpx; color: $qingsui-faint; font-size: 19rpx; }
.auth-note image { width: 25rpx; height: 25rpx; }
</style>
