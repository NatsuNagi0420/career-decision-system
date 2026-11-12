<!-- 青穗集 · 首页职业概览：统一像素字形、分步卡片入场与原穗奈头像问候，进度来自真实行动。 -->
<template>
  <view class="home-career">
    <view class="home-welcome qs-motion-block">
      <view class="home-welcome-copy">
        <text class="home-date">{{ dateLabel }}</text>
        <text class="home-welcome-title">今天，向目标靠近一点。</text>
      </view>
      <button
        :id="buttonRippleId(9)"
        :style="buttonRippleStyle(9)"
        class="home-suinai-button qs-tap-target"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        aria-label="和穗奈打个招呼"
        @touchstart="startButtonRipple($event, 9)"
        @click="startButtonRipple($event, 9); greet()"
      ><image class="home-suinai-avatar qs-action-icon" :src="assetPaths.characters.suinaiAvatar" mode="aspectFit" /></button>
      <view v-if="greeting" :key="greeting" class="home-suinai-greeting" role="status" aria-live="polite">{{ greeting }}</view>
    </view>
    <view class="home-career-source"><slot name="source" /></view>
    <view v-if="error" class="qs-error home-career-error">
      <text>{{ error }}</text><button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 1); $emit('retry')">重试</button>
    </view>
    <LoadingSkeleton v-if="loading && !career" :rows="2" />
    <template v-if="career && summary">
      <view class="home-goal-card qs-motion-block qs-motion-step-1">
        <view class="home-goal-header">
          <view class="home-goal-label"><image class="home-goal-label-icon" :src="assetPaths.prototype.target" /><text>{{ hasGoal ? '当前目标' : '探索方向' }}</text></view>
          <button :id="buttonRippleId(2)" :style="buttonRippleStyle(2)" @touchstart="startButtonRipple($event, 2)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="home-goal-edit qs-icon-button qs-tap-target" :aria-label="hasGoal ? '和穗奈梳理目标' : '和穗奈探索方向'" @click="startButtonRipple($event, 2); $emit('goal')"><image :src="assetPaths.icons.edit" /></button>
        </view>
        <view class="home-goal-body">
          <view class="home-goal-copy">
            <text class="home-goal-title">{{ career.profile.goal.trim() || '找到适合自己的方向' }}</text>
            <text v-if="!summary.next" class="home-goal-stage">{{ stage }}</text>
          </view>
          <button :id="buttonRippleId(3)" :style="buttonRippleStyle(3)" @touchstart="startButtonRipple($event, 3)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" v-if="summary.total" class="home-ring-button qs-tap-target" :aria-label="'查看行动进度：' + summary.total + ' 项行动已完成 ' + summary.doneCount + ' 项'" @click="startButtonRipple($event, 3); $emit('progress')">
            <view class="home-action-ring" aria-hidden="true">
              <view class="home-ring-track" />
              <view class="home-ring-half home-ring-half--right"><view class="home-ring-arc home-ring-arc--right" :style="{ transform: 'rotate(' + (-135 + Math.min(summary.completion, 50) * 3.6) + 'deg)' }" /></view>
              <view class="home-ring-half home-ring-half--left"><view class="home-ring-arc home-ring-arc--left" :style="{ transform: 'rotate(' + (-135 + Math.max(summary.completion - 50, 0) * 3.6) + 'deg)' }" /></view>
              <view class="home-ring-count"><text :key="summary.doneCount" class="home-ring-value">{{ summary.doneCount }}</text><text class="home-ring-total">/ {{ summary.total }}</text></view>
            </view>
            <text class="home-ring-caption">行动完成</text>
          </button>
          <image v-else class="home-goal-suinai" :src="assetPaths.characters.suinaiThink" mode="aspectFit" aria-label="穗奈陪你探索" />
        </view>
        <view v-if="summary.factCount || career.jobs.length" class="home-career-counts">
          <button :id="buttonRippleId(4)" :style="buttonRippleStyle(4)" @touchstart="startButtonRipple($event, 4)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" v-if="summary.factCount" class="home-career-count qs-tap-target" @click="startButtonRipple($event, 4); $emit('profile')"><text class="home-count-number">{{ summary.factCount }}</text><text>类画像资料</text><text class="home-small-arrow qs-action-arrow">›</text></button>
          <button :id="buttonRippleId(5)" :style="buttonRippleStyle(5)" @touchstart="startButtonRipple($event, 5)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" v-if="career.jobs.length" class="home-career-count qs-tap-target" @click="startButtonRipple($event, 5); $emit('directions')"><text class="home-count-number">{{ career.jobs.length }}</text><text>个岗位记录</text><text class="home-small-arrow qs-action-arrow">›</text></button>
        </view>
      </view>
      <view class="home-today-card qs-motion-block qs-motion-later">
        <view class="home-today-header"><text>今天先做</text><image class="home-today-sparkle" :src="assetPaths.prototype.sparkle" aria-hidden="true" /></view>
        <text class="home-today-title">{{ nextTitle }}</text>
        <text class="home-today-copy">{{ nextDescription }}</text>
        <view class="home-today-actions">
          <button :id="buttonRippleId(6)" :style="buttonRippleStyle(6)" @touchstart="startButtonRipple($event, 6)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="home-today-primary qs-button qs-button--primary qs-tap-target" @click="startButtonRipple($event, 6); $emit('next')"><text>{{ nextLabel }}</text><text class="home-primary-arrow qs-action-arrow">↗</text></button>
          <button :id="buttonRippleId(7)" :style="buttonRippleStyle(7)" @touchstart="startButtonRipple($event, 7)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" v-if="summary.next" class="home-action-detail qs-icon-button qs-tap-target" aria-label="查看行动详情与记录进展" @click="startButtonRipple($event, 7); $emit('detail', summary.next.id)"><image :src="assetPaths.icons.checklist" /></button>
        </view>
      </view>
    </template>
    <view v-else-if="!loading && !error" class="home-career-unavailable"><image class="home-unavailable-art" :src="assetPaths.characters.suinaiThink" mode="aspectFit" /><text>职业资料暂未读取成功</text><button :id="buttonRippleId(8)" :style="buttonRippleStyle(8)" @touchstart="startButtonRipple($event, 8)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="home-unavailable-retry qs-tap-target" @click="startButtonRipple($event, 8); $emit('retry')">重新读取</button></view>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { computed, onUnmounted, ref } from "vue";
import type { CareerView } from "../services/api";
import type { growthSummary } from "../services/growth-summary";
import { assetPaths } from "../static/assets";
import LoadingSkeleton from "./LoadingSkeleton.vue";
const props = defineProps<{
  career: CareerView | null;
  summary: ReturnType<typeof growthSummary> | null;
  dateLabel: string;
  loading: boolean;
  error: string;
}>();
defineEmits<{
  (event: "goal" | "next" | "progress" | "profile" | "directions" | "retry"): void;
  (event: "detail", id: string): void;
}>();
const hasGoal = computed(() => Boolean(props.career?.profile.goal.trim()));
const greeting = ref("");
const greetings = ["我在，今天也一起往前走一点。", "想到什么，就慢慢说。", "不用一下子想清楚，先从一小步开始。"];
let greetingIndex = 0;
let greetingTimer: ReturnType<typeof setTimeout> | undefined;
function greet() {
  clearTimeout(greetingTimer);
  greeting.value = greetings[greetingIndex++ % greetings.length];
  greetingTimer = setTimeout(() => { greeting.value = ""; }, 3600);
}
onUnmounted(() => clearTimeout(greetingTimer));
const stage = computed(() => props.summary?.allDone ? "已有行动已完成，回顾一下成果吧"
    : hasGoal.value ? "把想去的方向，变成能做的一步" : "从自己的经历与偏好开始");
const nextTitle = computed(() => props.summary?.next?.title || (
  props.summary?.allDone ? "回顾成果，再定下一步" : hasGoal.value ? "把目标拆成下一步" : "从一段经历开始"));
const nextDescription = computed(() => props.summary?.next
  ? props.summary.next.deliverable.trim() ? "留下：" + props.summary.next.deliverable : props.summary.next.why || "和穗奈一起拆解，找到可以动手的第一步。"
  : props.summary?.allDone ? "看看已经做成了什么，再一起决定怎么继续。"
    : hasGoal.value ? "结合已确认的资料，和穗奈一起定下能动手的行动。" : "聊一件你做过的事，慢慢发现自己擅长什么、想做什么。");
const nextLabel = computed(() => props.summary?.allDone ? "和穗奈一起回顾" : "和穗奈一起梳理");
</script>
<style lang="scss">
.home-welcome { position:relative; display:flex; align-items:center; gap:20rpx; margin:2rpx 0 20rpx; }
.home-welcome-copy { flex:1; min-width:0; }
.home-date { display:block; color:var(--qs-muted); font-size:23rpx; line-height:1.5; }
.home-welcome-title { display:block; margin-top:7rpx; color:var(--qs-ink); @include qs-ui-type($qs-type-section); line-height:1.5; }
.home-suinai-button { flex:none; width:82rpx; height:82rpx; margin:0; padding:4rpx; border:1rpx solid var(--qs-lilac); border-radius:$qs-radius-card; background:var(--qs-primary-soft); }
.home-suinai-avatar { width:100%; height:100%; }
.home-suinai-greeting { position:absolute; z-index:5; right:0; top:calc(100% + 14rpx); max-width:430rpx; padding:18rpx 22rpx; border:1rpx solid #d7c7e7; border-radius:$qs-radius-control; background:var(--qs-paper); box-shadow:0 8rpx 24rpx rgba(93,66,123,.12); color:#735a8d; font-size:25rpx; line-height:1.6; transform-origin:top right; pointer-events:none; animation:home-greeting-in .34s cubic-bezier(.18,.9,.3,1.25) both,home-greeting-out .18s ease-in 3.42s forwards; }
.home-suinai-greeting::before { content:""; position:absolute; right:30rpx; top:-7rpx; width:12rpx; height:12rpx; border-top:1rpx solid #d7c7e7; border-left:1rpx solid #d7c7e7; background:var(--qs-paper); transform:rotate(45deg); }
.home-career-source { display:flex; justify-content:flex-end; margin-bottom:14rpx; }
.home-career-error { margin-bottom:20rpx; }
.home-goal-card { padding:18rpx 28rpx 0; border:1rpx solid #d0dfd2; border-radius:$qs-radius-card; box-shadow:$qs-shadow-card; background:var(--qs-mint-soft); color:#35513f; }
.home-goal-header { display:flex; justify-content:space-between; align-items:center; gap:12rpx; }
.home-goal-label { display:flex; align-items:center; gap:10rpx; @include qs-ui-type($qs-type-label); color:#55715e; }
.home-goal-label-icon { width:32rpx; height:32rpx; }
.home-goal-edit { padding:16rpx; width:64rpx; height:64rpx; margin-right:-12rpx; }
.home-goal-body { display:flex; align-items:center; justify-content:space-between; gap:22rpx; padding:8rpx 0 30rpx; }
.home-goal-copy { flex:1; min-width:0; }
.home-goal-title { display:block; color:#314e3b; font-family:$qingsui-font; font-size:38rpx; line-height:1.45; font-weight:400; word-break:break-word; white-space:pre-line; }
.home-goal-stage { display:block; margin-top:18rpx; color:#577461; font-size:$qs-type-label; line-height:1.6; }
.home-goal-suinai { flex:none; width:198rpx; height:215rpx; }
.home-ring-button { display:flex; flex-direction:column; align-items:center; gap:10rpx; flex:none; width:218rpx; padding:0; margin:0; background:transparent; line-height:1.4; }
.home-action-ring { position:relative; width:204rpx; height:204rpx; }
.home-ring-track,.home-ring-half { position:absolute; top:0; height:100%; }
.home-ring-track { left:0; width:100%; box-sizing:border-box; border:13rpx solid #cbdccb; border-radius:50%; }
.home-ring-half { width:50%; overflow:hidden; }
.home-ring-half--right { right:0; }
.home-ring-half--left { left:0; }
.home-ring-arc { position:absolute; top:0; width:200%; height:100%; box-sizing:border-box; border:13rpx solid #658b70; border-radius:50%; transition:transform .5s cubic-bezier(.2,.75,.25,1); }
.home-ring-arc--right { right:0; border-left-color:transparent; border-bottom-color:transparent; }
.home-ring-arc--left { left:0; border-right-color:transparent; border-top-color:transparent; }
.home-ring-count { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:7rpx; color:#35513f; @include qs-ui-type(48rpx); font-variant-numeric:tabular-nums; }
.home-ring-total { font-size:26rpx; font-weight:400; padding-top:13rpx; }
.home-ring-value { display:inline-block; animation:home-count-in .42s cubic-bezier(.18,.9,.3,1.35); }
.home-ring-caption { color:#577461; @include qs-ui-type($qs-type-small); }
.home-career-counts { display:flex; gap:26rpx; border-top:1rpx solid #cadbce; }
.home-career-count { display:flex; align-items:center; gap:9rpx; flex:1; min-width:0; padding:20rpx 0; margin:0; color:#4a6654; background:transparent; font-size:23rpx; line-height:1.5; text-align:left; }
.home-count-number { @include qs-ui-type(36rpx); font-variant-numeric:tabular-nums; }
.home-small-arrow { margin-left:auto; font-size:30rpx; }
.home-today-card { margin-top:26rpx; padding:28rpx; border:1rpx solid var(--qs-lilac); border-radius:$qs-radius-card; box-shadow:$qs-shadow-card; background:var(--qs-paper); }
.home-today-header { display:flex; justify-content:space-between; align-items:center; color:var(--qs-muted); @include qs-ui-type($qs-type-label); }
.home-today-sparkle { width:32rpx; height:32rpx; }
.home-today-title { display:block; margin-top:20rpx; color:var(--qs-ink); font-family:$qingsui-font; font-size:30rpx; font-weight:400; line-height:1.5; word-break:break-word; }
.home-today-copy { display:block; margin-top:10rpx; color:var(--qs-muted); font-size:$qs-type-body; line-height:1.7; word-break:break-word; }
.home-today-actions { display:flex; align-items:center; gap:14rpx; margin-top:26rpx; }
.home-today-primary { flex:1; min-width:0; min-height:84rpx; justify-content:space-between; gap:12rpx; margin:0; border-radius:$qs-radius-control; }
.home-primary-arrow { font-size:32rpx; }
.home-action-detail { flex:none; width:78rpx; height:78rpx; padding:20rpx; border:1rpx solid var(--qs-lilac); border-radius:$qs-radius-control; background:var(--qs-paper); }
.home-career-unavailable { display:flex; align-items:center; flex-direction:column; gap:18rpx; padding:24rpx 0; color:var(--qs-muted); font-size:26rpx; }
.home-unavailable-art { width:140rpx; height:140rpx; }
.home-unavailable-retry { margin:0; padding:12rpx 28rpx; background:var(--qs-primary-soft); color:#735b90; font-size:25rpx; }
@keyframes home-greeting-in { from { opacity:0; transform:translateY(8rpx) scale(.94); } to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes home-greeting-out { to { opacity:0; transform:translateY(-4rpx) scale(.98); } }
@keyframes home-count-in { 0% { transform:scale(.88); } 55% { transform:scale(1.13); } 100% { transform:scale(1); } }
@media (prefers-reduced-motion:reduce) { .home-ring-arc { transition:none; } .home-suinai-greeting,.home-ring-value { animation:none; } }
</style>
