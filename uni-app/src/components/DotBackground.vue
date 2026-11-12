<!-- 青穗集 · 交互点阵背景：触点推动背景小点向外错开并回弹，卡片与文字不随波动。 -->
<template>
  <view class="dot-background" :class="ready ? 'dot-background--ready' : ''" aria-hidden="true">
    <canvas class="dot-background-canvas" type="2d" :disable-scroll="true" />
  </view>
</template>
<script setup lang="ts">
import { getCurrentInstance, onMounted, onUnmounted, ref, watch } from "vue";
import { onHide, onReady, onResize, onShow } from "@dcloudio/uni-app";
import { createDotFieldRenderer } from "../services/dot-field";
import type { SurfaceRipple } from "../services/surface-ripple";

const props = defineProps<{ ripples: SurfaceRipple[] }>();
const instance = getCurrentInstance();
const ready = ref(false);
let renderer: ReturnType<typeof createDotFieldRenderer> | undefined;
let visible = true, mounted = false, reduced = false, revision = 0;
let origin = { left: 0, top: 0 };
let removeMotionListener: (() => void) | undefined;

interface DotCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2D | null;
  requestAnimationFrame?: (callback: () => void) => number;
  cancelAnimationFrame?: (id: number) => void;
}

function sync() {
  if (!visible) { renderer?.stop(); return; }
  renderer?.update(reduced ? [] : props.ripples.map(wave => ({
    ...wave, x: wave.x - origin.left, y: wave.y - origin.top,
  })));
}
function attach(canvas: DotCanvas, width: number, height: number, left = 0, top = 0) {
  if (!width || !height) return;
  const info = uni.getWindowInfo();
  const pixelRatio = Math.min(info.pixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(pixelRatio, pixelRatio);
  origin = { left, top };
  renderer?.stop();
  renderer = createDotFieldRenderer({
    context, width, height, spacing: (info.windowWidth || width) / 750 * 24,
    requestFrame: callback => canvas.requestAnimationFrame
      ? canvas.requestAnimationFrame(callback)
      : setTimeout(callback, 34) as unknown as number,
    cancelFrame: id => canvas.cancelAnimationFrame ? canvas.cancelAnimationFrame(id) : clearTimeout(id),
  });
  sync();
  ready.value = true;
}
function initialize() {
  if (!mounted) return;
  const request = ++revision;
  // #ifdef MP-WEIXIN
  uni.createSelectorQuery().in(instance?.proxy).select(".dot-background-canvas")
    .fields({ node: true, size: true, rect: true }, (result: unknown) => {
      const bounds = result as { node?: DotCanvas; width: number; height: number; left: number; top: number };
      if (request !== revision || !mounted || !bounds?.node) return;
      attach(bounds.node, bounds.width, bounds.height, bounds.left, bounds.top);
    }).exec();
  // #endif
  // #ifdef H5
  const host = instance?.proxy?.$el as HTMLElement | undefined;
  const canvas = host?.querySelector("canvas");
  const bounds = canvas?.getBoundingClientRect();
  if (canvas && bounds) {
    const node: DotCanvas = {
      get width() { return canvas.width; }, set width(value) { canvas.width = value; },
      get height() { return canvas.height; }, set height(value) { canvas.height = value; },
      getContext: () => canvas.getContext("2d"),
      requestAnimationFrame: callback => requestAnimationFrame(callback),
      cancelAnimationFrame: id => cancelAnimationFrame(id),
    };
    attach(node, bounds.width, bounds.height, bounds.left, bounds.top);
  }
  // #endif
}
watch(() => props.ripples, sync);
onMounted(() => {
  mounted = true;
  // #ifdef H5
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  reduced = preference.matches;
  const change = () => { reduced = preference.matches; sync(); };
  preference.addEventListener("change", change);
  removeMotionListener = () => preference.removeEventListener("change", change);
  // #endif
  // 等原生视图提交后取 canvas；页面 ready 还会兜底一次首次查询。
  if (instance?.proxy) void instance.proxy.$nextTick(initialize);
  else initialize();
});
onReady(initialize);
onResize(initialize);
onShow(() => { visible = true; sync(); });
onHide(() => { visible = false; renderer?.stop(); });
onUnmounted(() => {
  mounted = false;
  revision++;
  renderer?.stop();
  removeMotionListener?.();
});
</script>
<style lang="scss">
.dot-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background-color: var(--qs-bg);
  background-image: var(--qs-bg-texture);
  background-size: 24rpx 24rpx;
}
.dot-background-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
}
.dot-background--ready { background-image: none; }
.dot-background--ready .dot-background-canvas { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .dot-background--ready { background-image: var(--qs-bg-texture); }
  .dot-background-canvas { display: none; }
}
</style>
