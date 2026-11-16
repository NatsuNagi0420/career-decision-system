<!-- 青穗集 · 职业主线：保留纸面像素界面，入口随真实资料变化，不制造完成分数。 -->
<template>
  <view class="career-journey qs-card qs-motion-block">
    <view class="career-journey-heading"><text>我的职业路线</text><button class="qs-icon-button" aria-label="打开求职任务" hover-class="button-hover" @click="open('/pages/career-task/index')"><image :src="assetPaths.icons.forward" /></button></view>
    <view class="career-journey-steps">
      <button v-for="(step, index) in journeySteps" :key="step.key" class="career-journey-step qs-press" :class="index === current ? 'career-journey-step--current' : ''" :aria-label="step.title" :aria-current="index === current ? 'step' : undefined" hover-class="qs-pressed" @click="open(step.url)">
        <text class="career-journey-number">{{ index + 1 }}</text><text>{{ step.title }}</text>
      </button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, shallowRef, watch, onUnmounted } from "vue";
import type { CareerView } from "../services/api";
import { getToken } from "../services/api";
import { developmentApi, type LearningState, type PreparationState } from "../services/career-development";
import { journeyIndex, journeySteps } from "../services/career-flow";
import { setCareerSource } from "../services/career-context";
import { assetPaths } from "../static/assets";
const props = defineProps<{ career: CareerView; source: string }>();
const learning = shallowRef<LearningState | null>(null), preparation = shallowRef<PreparationState | null>(null);
let generation = 0;
watch(() => [props.source, props.career], async () => {
  const current = ++generation, token = getToken();
  learning.value = null; preparation.value = null;
  if (props.source !== "cloud" || !token) return;
  const [route, training] = await Promise.allSettled([developmentApi.learning(), developmentApi.preparation()]);
  if (current !== generation || token !== getToken()) return;
  if (route.status === "fulfilled") learning.value = route.value;
  if (training.status === "fulfilled") preparation.value = training.value;
}, { immediate: true });
onUnmounted(() => generation++);
const current = computed(() => journeyIndex(props.career, learning.value, preparation.value));
function open(url: string) { setCareerSource(props.source); uni.navigateTo({ url }); }
</script>
<style lang="scss">
.career-journey { margin:22rpx 0; padding:16rpx 12rpx 24rpx; }
.career-journey-heading { display:flex; align-items:center; justify-content:space-between; padding-left:14rpx; font-size:27rpx; }
.career-journey-steps { display:flex; gap:4rpx; }
.career-journey-step { flex:1; min-width:0; padding:8rpx 0; margin:0; background:transparent; font-size:20rpx; line-height:1.6; color:var(--qs-muted); border-radius:12rpx; }
.career-journey-number { display:flex; align-items:center; justify-content:center; width:38rpx; height:38rpx; margin:0 auto 12rpx; border:1rpx solid var(--qs-lilac); border-radius:50%; }
.career-journey-step--current { color:$qingsui-primary; }
.career-journey-step--current .career-journey-number { color:var(--qs-paper); background:$qingsui-primary; border-color:$qingsui-primary; }
</style>
