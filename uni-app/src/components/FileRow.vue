<!-- 青穗集 · 文件行：按压时文件图标轻抬，预览与独立下载保留原鉴权流程。 -->
<template>
  <view
    :hover-start-time="0"
    class="file-row qs-press qs-reveal"
    hover-class="qs-pressed"
    :hover-stay-time="120"
    @click="preview"
  >
    <image class="file-icon qs-action-icon" :src="assets.fileDocument" mode="aspectFit" />
    <view class="file-copy">
      <text class="file-name">{{ file.name }}</text>
      <text class="file-meta">
        {{ formatBytes(file.bytes) }}
        <text v-if="file.created_at">· {{ formatTime(file.created_at) }}</text>
      </text>
    </view>
    <button
      :id="buttonRippleId(1)"
      :style="buttonRippleStyle(1)"
      @touchstart="startButtonRipple($event, 1, undefined, busy)"
      hover-class="button-hover"
      :hover-start-time="0"
      :hover-stay-time="110"
      class="qs-icon-button qs-tap-target"
      hover-stop-propagation
      aria-label="下载文件"
      :disabled="busy"
      @click.stop="startButtonRipple($event, 1, undefined, busy); download()"
    >
      <ActivityDots v-if="busy" label="正在下载文件" />
      <image v-else :src="assets.download" mode="aspectFit" />
    </button>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { ref } from "vue";
import ActivityDots from "./ActivityDots.vue";
import type { Artifact } from "../services/api";
import { formatBytes, formatTime, errorText } from "../services/workspace";
import { downloadHubFile } from "../services/hub-files";
import { assetPaths } from "../static/assets";
const props = defineProps<{ file: Artifact }>();
const assets = assetPaths.prototype;
const busy = ref(false);
function preview() {
  uni.navigateTo({
    url: `/pages/file/index?id=${encodeURIComponent(props.file.id)}&name=${encodeURIComponent(props.file.name)}&session=${encodeURIComponent(props.file.session_id || props.file.conversation_id || "")}`,
  });
}
async function download() {
  if (busy.value) return;
  busy.value = true;
  try {
    await downloadHubFile(props.file.id, props.file.name);
  } catch (error) {
    uni.showToast({ title: errorText(error), icon: "none" });
  } finally {
    busy.value = false;
  }
}
</script>
<style lang="scss">
.file-row {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 20rpx;
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-control;
  background: var(--qs-paper);
  margin-top: 16rpx;
}
.file-icon {
  flex: none;
  width: 52rpx;
  height: 64rpx;
}
.file-copy {
  flex: 1;
  min-width: 0;
}
.file-name {
  display: block;
  font-family: $qingsui-font;
  font-size: $qs-type-body;
  word-break: break-all;
  line-height: 1.5;
}
.file-meta {
  display: block;
  font-size: 24rpx;
  color: var(--qs-muted);
  margin-top: 6rpx;
}
.file-row .qs-icon-button {
  width: 68rpx;
  height: 68rpx;
  padding: 16rpx;
}
</style>
