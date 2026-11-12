<!-- 青穗集 · 新建对话来源面板：先选择执行位置和项目，再创建真实会话。 -->
<template>
  <MotionSheet
    :open="!closing"
    label="新建对话"
    :locked="busy"
    @close="close"
    @closed="emit('close')"
  >
    <view class="source-sheet-content">
      <view class="qs-sheet-title">
        <text>新建对话</text>
        <button
          :id="buttonRippleId(1)"
          :style="buttonRippleStyle(1)"
          @touchstart="startButtonRipple($event, 1, undefined, busy)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="qs-icon-button qs-tap-target"
          aria-label="关闭"
          :disabled="busy"
          @click="startButtonRipple($event, 1, undefined, busy); close()"
        >
          ×
        </button>
      </view>
      <LoadingSkeleton v-if="loading" :rows="2" />
      <template v-else>
        <text class="qs-inline-note">选择这段对话在哪里执行</text>
        <scroll-view scroll-y class="source-options">
          <button
            :id="buttonRippleId(2)"
            :style="buttonRippleStyle(2)"
            @touchstart="startButtonRipple($event, 2, undefined, !cloudEnabled || busy)"
            hover-class="button-hover"
            hover-stop-propagation
            :hover-start-time="0"
            :hover-stay-time="110"
            class="source-option qs-tap-target"
            :class="[
              selected === 'cloud' ? 'source-option--selected' : '',
              !cloudEnabled || busy ? 'source-option--disabled' : '',
            ]"
            :disabled="!cloudEnabled || busy"
            @click="startButtonRipple($event, 2, undefined, !cloudEnabled || busy); selected = 'cloud'"
          >
            <image
              class="source-option-icon"
              :src="assets.cloud"
              mode="aspectFit"
            />
            <view class="source-option-copy">
              <text>云端</text>
              <text class="qs-row-note">
                {{ cloudEnabled ? "随时继续，无需电脑在线" : "暂未开放" }}
              </text>
            </view>
            <text v-if="selected === 'cloud'" class="source-check">✓</text>
          </button>
          <button
            :id="buttonRippleId(3, [device.id])"
            :style="buttonRippleStyle(3, [device.id])"
            @touchstart="startButtonRipple($event, 3, [device.id], !device.settings.allow_remote || busy)"
            hover-class="button-hover"
            hover-stop-propagation
            :hover-start-time="0"
            :hover-stay-time="110"
            v-for="device in devices"
            :key="device.id"
            class="source-option qs-tap-target"
            :class="[
              selected === device.id ? 'source-option--selected' : '',
              !device.settings.allow_remote || busy
                ? 'source-option--disabled'
                : '',
            ]"
            :disabled="!device.settings.allow_remote || busy"
            @click="startButtonRipple($event, 3, [device.id], !device.settings.allow_remote || busy); selectDevice(device)"
          >
            <image
              class="source-option-icon"
              :src="assets.computer"
              mode="aspectFit"
            />
            <view class="source-option-copy">
              <text>{{ device.name }}</text>
              <text class="qs-row-note">
                {{
                  !device.settings.allow_remote
                    ? "电脑端未开启远程任务"
                    : device.online
                      ? "在线"
                      : "离线 · 任务将等待电脑上线"
                }}
              </text>
            </view>
            <text v-if="selected === device.id" class="source-check">✓</text>
          </button>
        </scroll-view>
        <picker
          v-if="device"
          :range="workspaces.map((item) => item.name)"
          :value="workspaceIndex"
          @change="workspaceIndex = Number(($event as any).detail.value)"
        >
          <view hover-class="qs-pressed" :hover-start-time="0" :hover-stay-time="110" class="source-project qs-press">
            <text>项目</text>
            <text>{{ workspaces[workspaceIndex]?.name }} ⌄</text>
          </view>
        </picker>
        <text v-if="device" class="qs-inline-note">
          新对话使用电脑默认模型及已授权权限。
        </text>
        <view v-if="error" class="qs-error">
          <text>{{ error }}</text>
          <button :id="buttonRippleId(4)" :style="buttonRippleStyle(4)" @touchstart="startButtonRipple($event, 4)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 4); refresh()">重试</button>
        </view>
        <button
          :id="buttonRippleId(5)"
          :style="buttonRippleStyle(5)"
          @touchstart="startButtonRipple($event, 5, undefined, !selected || busy)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="qs-button qs-button--primary qs-bottom-action qs-tap-target"
          :disabled="!selected || busy"
          @click="startButtonRipple($event, 5, undefined, !selected || busy); create()"
        >
          <ActivityDots v-if="busy" light label="正在创建对话" />
          <text>{{ busy ? "正在创建…" : "开始对话" }}</text>
        </button>
        <button :id="buttonRippleId(6)" :style="buttonRippleStyle(6)" @touchstart="startButtonRipple($event, 6, undefined, busy)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="source-manage qs-tap-target" :disabled="busy" @click="startButtonRipple($event, 6, undefined, busy); manage()">
          扫码连接或管理电脑 ↗
        </button>
      </template>
    </view>
  </MotionSheet>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { computed, onMounted, ref } from "vue";
import MotionSheet from "./MotionSheet.vue";
import LoadingSkeleton from "./LoadingSkeleton.vue";
import ActivityDots from "./ActivityDots.vue";
import { onShow } from "@dcloudio/uni-app";
import { invalidateOverview } from "../services/overview";
import {
  agentApi,
  hubApi,
  type Conversation,
  type HubDevice,
} from "../services/api";
import { errorText } from "../services/workspace";
import { assetPaths } from "../static/assets";
const props = defineProps<{ preferred?: string }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "created", item: Conversation): void;
}>();
const assets = assetPaths.prototype;
const devices = ref<HubDevice[]>([]),
  cloudEnabled = ref(false),
  loading = ref(true),
  busy = ref(false),
  closing = ref(false),
  error = ref(""),
  selected = ref(""),
  workspaceIndex = ref(0);
const device = computed(() =>
  devices.value.find((item) => item.id === selected.value),
);
const workspaces = computed(() => [
  { id: null as string | null, name: "不绑定项目" },
  ...(device.value?.catalogue.workspaces ?? []),
]);
async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const [list, config] = await Promise.all([
      hubApi.devices(),
      hubApi.config(),
    ]);
    devices.value = list.filter((d) => d.status === "active");
    cloudEnabled.value = config.cloud_enabled;
    const preferred = devices.value.find(
      (d) => d.id === props.preferred && d.settings.allow_remote,
    );
    if (preferred) selectDevice(preferred);
    else if (props.preferred === "cloud" && config.cloud_enabled)
      selected.value = "cloud";
    else if (config.cloud_enabled) selected.value = "cloud";
    else {
      const first = devices.value.find((d) => d.settings.allow_remote);
      if (first) selectDevice(first);
    }
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}
onMounted(() => void refresh());
onShow(() => {
  if (!loading.value) void refresh();
});
function selectDevice(item: HubDevice) {
  selected.value = item.id;
  workspaceIndex.value = Math.max(
    0,
    [{ id: null }, ...item.catalogue.workspaces].findIndex(
      (w) => w.id === item.settings.workspace_id,
    ),
  );
}
async function create() {
  if (busy.value || !selected.value) return;
  busy.value = true;
  error.value = "";
  try {
    const selection = {
      target: selected.value === "cloud" ? ("cloud" as const) : ("pc" as const),
      device_id: device.value?.id ?? null,
      workspace_id: device.value
        ? (workspaces.value[workspaceIndex.value]?.id ?? null)
        : null,
    };
    const item = await agentApi.createConversation(null, selection);
    invalidateOverview(item.id);
    emit("created", item);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
function close() {
  if (!busy.value) closing.value = true;
}
function manage() {
  uni.navigateTo({ url: "/pages/devices/index" });
}
</script>
<style lang="scss">
.source-options {
  max-height: 45vh;
}
.source-sheet-content {
  min-height: 0;
}
.source-option {
  transition:
    border-color 0.2s,
    background-color 0.2s,
    transform 0.16s;
  display: flex;
  align-items: center;
  gap: 20rpx;
  width: 100%;
  padding: 24rpx;
  margin: 0 0 18rpx;
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-card;
  background: var(--qs-paper);
  text-align: left;
  color: var(--qs-ink);
  font-size: 28rpx;
  line-height: 1.4;
}
.source-option-icon {
  flex: none;
  width: 64rpx;
  height: 64rpx;
}
.source-option-copy {
  flex: 1;
  min-width: 0;
  font-family: $qingsui-font;
}
.source-option--selected {
  border-color: #9278bb;
  background: var(--qs-primary-soft);
}
.source-option--disabled {
  opacity: 0.5;
}
.source-check {
  animation: qs-check-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  color: #9278bb;
}
.source-project {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  font-size: 26rpx;
  padding: 24rpx;
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-control;
}
.source-manage {
  font-size: 24rpx;
  color: var(--qs-muted);
  background: transparent;
  margin-top: 22rpx;
}
</style>
