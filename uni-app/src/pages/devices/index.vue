<!-- 青穗集 · 设备与同步页：绑定电脑、查看云端状态与执行设置，所有操作沿用统一触摸反馈。 -->
<template>
  <view :class="pageMotionClass" class="qs-page devices-page">
    <view class="page-heading">
      <text class="qs-eyebrow">DEVICES & SYNC</text>
      <text class="qs-title">设备与同步</text>
    </view>

    <view v-if="loading" class="devices-loading qs-card qs-motion-block">
      <image class="qs-spin" :src="assets.icons.sync" mode="aspectFit" />
      <text>正在读取设备</text>
    </view>
    <view v-else-if="errorMessage" class="devices-error qs-card qs-motion-block">
      <image :src="assets.icons.pendingWarning" mode="aspectFit" />
      <text>{{ errorMessage }}</text>
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="devices-retry qs-tap-target" @click="startButtonRipple($event, 1); refresh()">重试</button>
    </view>

    <template v-else>
      <!-- 云端可用性来自服务配置，实际任务仍有独立状态。 -->
      <view v-if="cloudEnabled" class="device-card qs-card device-card--cloud qs-motion-block">
        <view class="device-icon device-icon--cloud">
          <image :src="assets.prototype.cloud" mode="aspectFit" />
        </view>
        <view class="device-copy">
          <text class="device-name">云助手</text>
          <text class="device-state device-state--online">在线 · 随时可用</text>
        </view>
        <button
          :id="buttonRippleId(2)"
          :style="buttonRippleStyle(2)"
          @touchstart="startButtonRipple($event, 2)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="device-continue qs-tap-target"
          @click="startButtonRipple($event, 2); browseTarget('cloud', null)"
        >
          继续对话
        </button>
      </view>

      <!-- 已绑定电脑 -->
      <view
        v-for="device in activeDevices"
        :key="device.id"
        class="device-card qs-card qs-motion-block"
        :class="device.online ? '' : 'device-card--offline'"
      >
        <view class="device-icon device-icon--wide">
          <image :src="assets.prototype.computer" mode="aspectFit" />
        </view>
        <view class="device-copy">
          <text class="device-name">{{ device.name }}</text>
          <text
            class="device-state"
            :class="device.online ? 'device-state--online' : ''"
          >
            {{ device.online ? "在线" : "离线" }} · {{ workspaceLabel(device) }}
          </text>
        </view>
        <view class="device-actions">
          <button
            :id="buttonRippleId(3, [device.id])"
            :style="buttonRippleStyle(3, [device.id])"
            @touchstart="startButtonRipple($event, 3, [device.id], !device.settings.allow_remote)"
            hover-class="button-hover"
            hover-stop-propagation
            :hover-start-time="0"
            :hover-stay-time="110"
            class="device-continue qs-tap-target"
            :disabled="!device.settings.allow_remote"
            @click="startButtonRipple($event, 3, [device.id], !device.settings.allow_remote); browseTarget('pc', device)"
          >
            {{ device.online ? "继续对话" : "去发指令" }}
          </button>
          <button
            :id="buttonRippleId(4, [device.id])"
            :style="buttonRippleStyle(4, [device.id])"
            @touchstart="startButtonRipple($event, 4, [device.id])"
            hover-class="button-hover"
            hover-stop-propagation
            :hover-start-time="0"
            :hover-stay-time="110"
            class="device-more qs-tap-target"
            :aria-label="device.name + '设置'"
            @click="startButtonRipple($event, 4, [device.id]); openSettings(device)"
          >
            <image :src="assets.icons.more" mode="aspectFit" />
          </button>
        </view>

        <view
          v-if="settings?.id === device.id"
          class="device-settings qs-panel-enter"
        >
          <view class="setting-row">
            <text>接收远程任务</text>
            <switch
              :checked="settings.settings.allow_remote"
              color="#7656a5"
              @change="toggle('allow_remote', $event)"
            />
          </view>
          <view class="setting-row">
            <text>同步电脑对话</text>
            <switch
              :checked="settings.settings.sync_chats"
              color="#7656a5"
              @change="toggle('sync_chats', $event)"
            />
          </view>
          <view class="setting-divider">新对话默认设置</view>
          <view class="setting-row">
            <text>允许修改项目</text>
            <switch
              :checked="
                settings.settings.workspace_access === 'workspace-write'
              "
              color="#7656a5"
              @change="toggle('workspace_access', $event)"
            />
          </view>
          <picker
            :range="modelNames"
            @change="changeModel(Number(($event as any).detail.value))"
          >
            <view hover-class="qs-pressed" :hover-start-time="0" :hover-stay-time="110" class="setting-row setting-row--pick qs-press">
              <text>模型</text>
              <text class="setting-value">{{ modelLabel }} ⌄</text>
            </view>
          </picker>
          <picker
            :range="effortNames"
            @change="changeEffort(Number(($event as any).detail.value))"
          >
            <view hover-class="qs-pressed" :hover-start-time="0" :hover-stay-time="110" class="setting-row setting-row--pick qs-press">
              <text>思考强度</text>
              <text class="setting-value">{{ effortLabel }} ⌄</text>
            </view>
          </picker>
          <text class="setting-note">
            已有对话沿用电脑上的项目与模型；完全访问需在电脑确认。
          </text>
          <view class="setting-actions">
            <button
              :id="buttonRippleId(5, [device.id])"
              :style="buttonRippleStyle(5, [device.id])"
              @touchstart="startButtonRipple($event, 5, [device.id], busy)"
              hover-class="button-hover"
              hover-stop-propagation
              :hover-start-time="0"
              :hover-stay-time="110"
              class="qs-button setting-save qs-tap-target"
              :disabled="busy"
              @click="startButtonRipple($event, 5, [device.id], busy); saveSettings()"
            >
              保存
            </button>
            <button
              :id="buttonRippleId(6, [device.id])"
              :style="buttonRippleStyle(6, [device.id])"
              @touchstart="startButtonRipple($event, 6, [device.id], busy)"
              hover-class="button-hover"
              hover-stop-propagation
              :hover-start-time="0"
              :hover-stay-time="110"
              class="device-remove qs-tap-target"
              :disabled="busy"
              @click="startButtonRipple($event, 6, [device.id], busy); confirmRevoke(device)"
            >
              移除此电脑
            </button>
          </view>
        </view>
      </view>

      <!-- 空状态：还没有绑定任何电脑 -->
      <view v-if="!activeDevices.length" class="empty-card qs-card qs-motion-block">
        <image
          class="empty-art qs-empty-orb"
          :src="assets.characters.suinaiWithPc"
          mode="aspectFit"
        />
        <view class="empty-copy-wrap">
          <text class="empty-title">把电脑也接进来</text>
          <text class="empty-copy">
            在电脑端登录同一账号并打开「设备与同步」，扫码后就能用手机给电脑上的穗奈下任务。
          </text>
        </view>
      </view>

      <button
        :id="buttonRippleId(7)"
        :style="buttonRippleStyle(7)"
        @touchstart="startButtonRipple($event, 7, undefined, busy)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-button qs-button--primary scan-button qs-tap-target"
        :disabled="busy"
        @click="startButtonRipple($event, 7, undefined, busy); scanBind()"
      >
        <image :src="assets.icons.connection" mode="aspectFit" />
        <text>扫码连接电脑</text>
      </button>
      <text class="scan-hint">
        请在电脑端登录同一官方账号，打开“设备与同步”生成二维码。
      </text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import {
  API_ORIGIN,
  agentApi,
  hubApi,
  hasToken,
  goToAuth,
  type HubDevice,
} from "../../services/api";
import { parseDevicePairing } from "../../services/device-pairing";
import { assetPaths } from "../../static/assets";
const pageMotionClass = usePageMotion();

const assets = assetPaths;
const devices = ref<HubDevice[]>([]);
const cloudEnabled = ref(false);
const loading = ref(false);
const busy = ref(false);
const errorMessage = ref("");
const settings = ref<HubDevice | null>(null);

const activeDevices = computed(() =>
  devices.value.filter((device) => device.status === "active"),
);
const modelOptions = computed(() => {
  const catalogue =
    settings.value?.catalogue.profiles.filter(
      (profile) => profile.mode === "custom" && profile.ready,
    ) ?? [];
  return [{ id: null as string | null, name: "Suinai Flash" }, ...catalogue];
});
const modelNames = computed(() =>
  modelOptions.value.map((profile) => profile.name),
);
const modelLabel = computed(() => {
  const current = settings.value?.settings;
  if (!current) return "Suinai Flash";
  if (current.model_source === "official") return "Suinai Flash";
  return (
    modelOptions.value.find((profile) => profile.id === current.profile_id)
      ?.name || "模型未就绪"
  );
});
const effortNames = ["自动", "低", "中", "高"] as const;
const effortLabel = computed(() => {
  const value = settings.value?.settings.reasoning_effort ?? "auto";
  return { auto: "自动", low: "低", medium: "中", high: "高" }[value];
});

onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void refresh();
});

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const [list, config] = await Promise.all([
      hubApi.devices(),
      hubApi.config(),
    ]);
    devices.value = list;
    cloudEnabled.value = config.cloud_enabled;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "设备读取失败";
  } finally {
    loading.value = false;
  }
}

function workspaceLabel(device: HubDevice): string {
  if (!device.settings.allow_remote) return "远程任务已关闭";
  const workspace = device.catalogue.workspaces.find(
    (item) => item.id === device.settings.workspace_id,
  );
  return workspace ? workspace.name : "不绑定项目";
}

function browseTarget(target: "pc" | "cloud", device: HubDevice | null) {
  const deviceId = target === "pc" ? (device?.id ?? null) : null;
  const workspaceId =
    target === "pc" ? (device?.settings.workspace_id ?? null) : null;
  hubApi.setExecution(target, deviceId, workspaceId);
  uni.navigateTo({
    url: `/pages/chat/index?new=1&source=${encodeURIComponent(deviceId || "cloud")}`,
  });
}

function openSettings(device: HubDevice) {
  settings.value =
    settings.value?.id === device.id
      ? null
      : JSON.parse(JSON.stringify(device));
}

function toggle(
  key: "allow_remote" | "sync_chats" | "workspace_access",
  event: unknown,
) {
  const current = settings.value;
  const value = (event as { detail: { value: boolean } }).detail.value;
  if (!current) return;
  if (key === "workspace_access")
    current.settings.workspace_access = value ? "workspace-write" : "read-only";
  else current.settings[key] = value;
}

function changeModel(index: number) {
  const profile = modelOptions.value[index];
  if (!settings.value || !profile) return;
  settings.value.settings.model_source = index === 0 ? "official" : "local";
  settings.value.settings.profile_id = profile.id;
}

function changeEffort(index: number) {
  if (!settings.value) return;
  settings.value.settings.reasoning_effort = (
    ["auto", "low", "medium", "high"] as const
  )[index];
}

async function saveSettings() {
  const device = settings.value;
  if (!device) return;
  busy.value = true;
  try {
    await hubApi.settings(device, device.settings);
    settings.value = null;
    uni.showToast({ title: "已保存", icon: "none" });
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    busy.value = false;
  }
}

async function confirmRevoke(device: HubDevice) {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "移除此电脑？",
      content: "移除后，手机将不能再向它发送任务；电脑端重新扫码可再次连接。",
      confirmText: "移除",
      confirmColor: "#ba5b64",
      cancelText: "取消",
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  busy.value = true;
  try {
    await hubApi.revoke(device.id);
    settings.value = null;
    uni.showToast({ title: "已移除", icon: "none" });
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "移除失败";
  } finally {
    busy.value = false;
  }
}

async function scanBind() {
  // #ifdef H5
  uni.showToast({ title: "请在微信小程序中使用扫码连接", icon: "none" });
  return;
  // #endif
  // #ifndef H5
  busy.value = true;
  errorMessage.value = "";
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      uni.scanCode({
        scanType: ["qrCode"],
        success: (result) => resolve(result.result),
        fail: reject,
      });
    });
    await hubApi.confirm(parseDevicePairing(raw, API_ORIGIN));
    uni.vibrateShort({ type: "light" });
    uni.showToast({ title: "电脑已连接", icon: "success" });
    await refresh();
  } catch (error) {
    const detail = error as { errMsg?: string; message?: string };
    if (!detail.errMsg?.includes("cancel"))
      errorMessage.value = detail.message || "暂时无法扫码，请重试。";
  } finally {
    busy.value = false;
  }
  // #endif
}
</script>

<style lang="scss">
.page-heading .qs-title {
  display: block;
}
.devices-loading,
.devices-error {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 34rpx;
  padding: 28rpx;
  color: $qingsui-muted;
  font-size: 20rpx;
}
.devices-loading image,
.devices-error image {
  width: 34rpx;
  height: 34rpx;
  flex: none;
}
.devices-error {
  align-items: flex-start;
  color: $qingsui-danger;
  line-height: 1.55;
}
.devices-retry {
  height: 54rpx;
  margin: -8rpx 0 0 auto;
  padding: 0 14rpx;
  border: 1rpx solid $qingsui-lilac;
  border-radius: 13rpx;
  color: $qingsui-primary;
  background: $qingsui-primary-soft;
  font-size: 19rpx;
}

.device-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 22rpx;
  padding: 26rpx 24rpx;
  flex-wrap: wrap;
}
.device-card--cloud {
  border-color: $qingsui-primary-strong;
}
.device-card--offline {
  opacity: 0.78;
}
.device-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  flex: none;
  border-radius: $qs-radius-control;
  background: $qingsui-primary-soft;
}
.device-icon image {
  width: 56rpx;
  height: 56rpx;
}
.device-icon--wide {
  width: 96rpx;
  border-radius: $qs-radius-control;
}
.device-icon--wide image {
  width: 88rpx;
  height: 88rpx;
}
.device-copy {
  min-width: 0;
  flex: 1;
}
.device-name {
  display: block;
  overflow: hidden;
  color: $qingsui-ink;
  font-size: 27rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.device-state {
  display: block;
  margin-top: 9rpx;
  color: $qingsui-faint;
  font-size: 20rpx;
}
.device-state--online {
  color: $qingsui-mint;
}
.device-actions {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.device-continue {
  min-width: 150rpx;
  height: 60rpx;
  margin: 0;
  padding: 0 18rpx;
  border: 1rpx solid $qingsui-primary;
  border-radius: 14rpx;
  color: $qingsui-primary;
  background: $qingsui-primary-soft;
  font-size: 21rpx;
}
.device-continue[disabled] {
  opacity: 0.5;
}
.device-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60rpx;
  height: 60rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 14rpx;
  background: transparent;
}
.device-more image {
  width: 32rpx;
  height: 32rpx;
}
.device-more:active {
  background: $qingsui-primary-soft;
}

.device-settings {
  position: relative;
  z-index: 1;
  width: 100%;
  margin-top: 18rpx;
  padding: 6rpx 18rpx 18rpx;
  border: 1rpx solid $qingsui-lilac;
  border-radius: $qs-radius-control;
  background: $qingsui-paper;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  padding: 18rpx 0;
  color: $qingsui-ink;
  font-size: 24rpx;
}
.setting-row--pick {
  color: $qingsui-primary;
}
.setting-value {
  color: $qingsui-primary;
  font-size: 23rpx;
}
.setting-divider {
  margin-top: 10rpx;
  padding: 16rpx 0 4rpx;
  border-top: 1rpx solid $qingsui-paper-soft;
  color: $qingsui-muted;
  font-size: 22rpx;
}
.setting-note {
  display: block;
  padding: 6rpx 0 14rpx;
  color: $qingsui-faint;
  font-size: 20rpx;
  line-height: 1.7;
}
.setting-actions {
  display: flex;
  gap: 14rpx;
}
.setting-save {
  flex: 1;
  min-height: 68rpx;
  font-size: 22rpx;
}
.device-remove {
  flex: 1;
  min-height: 68rpx;
  border: 1rpx solid $qingsui-danger-soft;
  border-radius: 18rpx;
  color: $qingsui-danger;
  background: transparent;
  font-size: 22rpx;
}

.empty-card {
  display: flex;
  align-items: center;
  min-height: 200rpx;
  margin-top: 22rpx;
  padding: 24rpx;
  overflow: hidden;
}
.empty-art {
  width: 150rpx;
  height: 150rpx;
  flex: none;
}
.empty-copy-wrap {
  padding-left: 16rpx;
}
.empty-title {
  display: block;
  color: $qingsui-ink;
  font-size: 26rpx;
}
.empty-copy {
  display: block;
  margin-top: 10rpx;
  color: $qingsui-muted;
  font-size: 20rpx;
  line-height: 1.65;
}

.scan-button {
  width: 100%;
  margin-top: 30rpx;
}
.scan-button image {
  width: 32rpx;
  height: 32rpx;
  margin-right: 10rpx;
  filter: brightness(0) invert(1);
}
.scan-hint {
  display: block;
  margin: 14rpx 0 6rpx;
  color: $qingsui-faint;
  font-size: 19rpx;
  text-align: center;
}
</style>
