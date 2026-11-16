<!-- 青穗集 · 共用尺寸过渡：测量内容高度，让展开和异步更新平滑让位，减少动态时禁用过渡。 -->
<template>
  <view class="qs-size-reveal" :style="{ height }" :aria-hidden="!open">
    <view class="qs-size-reveal-content" :inert="!open ? true : undefined" :style="!open ? 'visibility:hidden' : ''"><slot /></view>
  </view>
</template>
<script setup lang="ts">
import { getCurrentInstance, nextTick, ref, watch, onMounted, onUnmounted } from "vue";
const props = defineProps<{ open: boolean; changeKey?: unknown }>();
const instance = getCurrentInstance();
const height = ref(props.open ? "auto" : "0px");
let generation = 0;
async function measure() {
  const current = ++generation;
  await nextTick();
  if (!props.open) { height.value = "0px"; return; }
  const query = uni.createSelectorQuery().in(instance?.proxy as any);
  query.select(".qs-size-reveal-content").boundingClientRect((rect: any) => {
    if (current === generation && props.open) height.value = rect?.height ? `${rect.height}px` : "auto";
  }).exec();
}
watch(() => [props.open, props.changeKey], measure);
onMounted(measure); onUnmounted(() => generation++);
</script>
<style lang="scss">
.qs-size-reveal { overflow:hidden; transition:height .26s cubic-bezier(.2,.7,.2,1); }
.qs-size-reveal-content { display:flow-root; }
@media (prefers-reduced-motion:reduce) { .qs-size-reveal { transition:none; } }
</style>
