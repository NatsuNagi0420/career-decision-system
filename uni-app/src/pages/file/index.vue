<!-- 青穗集 · 文件预览：鉴权加载图片、纯文本与文档，HTML 按文本处理。 -->
<template>
  <view :class="pageMotionClass" class="qs-page file-page">
    <text class="qs-detail-title">{{ name }}</text>
    <view v-if="error" class="qs-error">
      {{ error }}
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 1); load()">重试</button>
    </view>
    <view v-if="loading" class="qs-state">正在读取文件…</view>
    <template v-if="content">
      <image
        v-if="imageFile(name)"
        class="preview-image"
        :src="content.url"
        mode="widthFix"
        @click="enlarge"
      />
      <scroll-view
        v-else-if="content.text !== undefined"
        class="text-preview qs-card qs-motion-block"
        scroll-y
      >
        <text user-select>{{ content.text }}</text>
      </scroll-view>
      <!-- #ifdef H5 -->
      <iframe
        v-else-if="fileType(name) === 'pdf'"
        class="pdf-preview"
        :src="content.url"
        title="PDF 文档预览"
      ></iframe>
      <!-- #endif -->
      <view v-else class="qs-state qs-card qs-motion-block">
        <image :src="assets.fileDocument" />
        <text>
          {{
            documentType
              ? "文档已就绪，可使用系统预览。"
              : "此格式暂不支持直接预览，可以保存后打开。"
          }}
        </text>
      </view>
      <button
        :id="buttonRippleId(2)"
        :style="buttonRippleStyle(2)"
        @touchstart="startButtonRipple($event, 2)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="documentType"
        class="qs-button qs-bottom-action qs-tap-target"
        @click="startButtonRipple($event, 2); systemPreview()"
      >
        打开文档预览
      </button>
      <button
        :id="buttonRippleId(3)"
        :style="buttonRippleStyle(3)"
        @touchstart="startButtonRipple($event, 3, undefined, busy)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-button qs-button--primary qs-bottom-action qs-tap-target"
        :disabled="busy"
        @click="startButtonRipple($event, 3, undefined, busy); download()"
      >
        <image :src="assets.download" />
        {{ busy ? "正在处理…" : "下载 / 保存文件" }}
      </button>
      <button
        :id="buttonRippleId(4)"
        :style="buttonRippleStyle(4)"
        @touchstart="startButtonRipple($event, 4)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="session"
        class="file-conversation qs-tap-target"
        @click="startButtonRipple($event, 4); openConversation(session)"
      >
        回到所属对话 ↗
      </button>
    </template>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { computed, ref } from "vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import { hasToken, goToAuth } from "../../services/api";
import {
  readHubFile,
  downloadHubFile,
  imageFile,
  fileType,
  openLocalDocument,
  type HubFileContent,
} from "../../services/hub-files";
import { openConversation } from "../../services/conversations";
import { errorText } from "../../services/workspace";
import { assetPaths } from "../../static/assets";
const pageMotionClass = usePageMotion();
const assets = assetPaths.prototype,
  id = ref(""),
  name = ref(""),
  session = ref(""),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  content = ref<HubFileContent | null>(null);
let disposed = false;
const documentType = computed(() =>
  /\.(pdf|docx?|xlsx?|pptx?)$/i.test(name.value),
);
onLoad((options) => {
  id.value = options?.id || "";
  name.value = options?.name || "文件";
  session.value = options?.session || "";
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void load();
});
onUnload(() => {
  disposed = true;
  content.value?.release();
});
async function load() {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  content.value?.release();
  content.value = null;
  try {
    const result = await readHubFile(id.value, name.value);
    if (disposed) {
      result.release();
      return;
    }
    content.value = result;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}
async function download() {
  busy.value = true;
  try {
    await downloadHubFile(id.value, name.value);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
function enlarge() {
  if (content.value) uni.previewImage({ urls: [content.value.url] });
}
async function systemPreview() {
  // #ifdef H5
  if (fileType(name.value) !== "pdf") await download();
  // #endif
  // #ifndef H5
  const localPath = content.value?.localPath;
  if (localPath) {
    try {
      await openLocalDocument(localPath, name.value);
    } catch (e) {
      error.value = errorText(e);
    }
  }
  // #endif
}
</script>
<style lang="scss">
.preview-image {
  width: 100%;
  border: 1rpx solid var(--qs-lilac);
  border-radius: 18rpx;
  background: var(--qs-paper);
}
.text-preview {
  height: 58vh;
  padding: 24rpx;
  box-sizing: border-box;
}
.text-preview > text {
  font-size: 25rpx;
  line-height: 1.85;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.pdf-preview {
  width: 100%;
  height: 65vh;
  border: 1rpx solid var(--qs-lilac);
  border-radius: 16rpx;
}
.file-conversation {
  font-size: 25rpx;
  background: transparent;
  color: var(--qs-muted);
  margin-top: 20rpx;
}
</style>
