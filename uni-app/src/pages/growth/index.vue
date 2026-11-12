<!-- 青穗集 · 成长手账：统一像素字形、卡片入场与背景点阵位移，保留原业务和同步边界。 -->
<template>
  <view @touchstart="startSurfaceRipple($event)" @click="startSurfaceRipple($event)" :class="pageMotionClass" class="qs-page qs-page--tab growth-page">
    <DotBackground :ripples="surfaceRipples" />
    <!-- #ifdef MP-WEIXIN -->
    <view
      class="qs-page-frame"
      :style="pageFrameReady ? 'display: none;' : ''"
      aria-hidden="true"
    >
      <text class="qs-page-frame-title">成长</text>
      <view class="qs-page-frame-card" />
      <view class="qs-page-frame-line" />
      <view class="qs-page-frame-line qs-page-frame-line--short" />
    </view>
    <!-- #endif -->
    <AppHeader title="成长"><CareerSource @change="changeSource" /></AppHeader>
    <view v-if="error" class="qs-error"
      >{{ error }}<button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 1); load()">重试</button></view
    >
    <LoadingSkeleton v-if="loading && !career" :rows="2" />
    <template v-if="career && summary">
      <view class="growth-goal qs-motion-block">
        <view class="growth-goal-rule" aria-hidden="true" />
        <image
          class="growth-goal-art"
          :src="assetPaths.characters.growthRouteIllustration"
          mode="aspectFit"
          aria-hidden="true"
        />
        <view class="growth-goal-heading"
          ><image :src="assets.target" /><text>我想去的方向</text></view
        >
        <text class="growth-goal-title">{{
          career.profile.goal || "先认识自己，再找到想去的地方。"
        }}</text>
        <button
          :id="buttonRippleId(2)"
          :style="buttonRippleStyle(2)"
          @touchstart="startButtonRipple($event, 2)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="growth-goal-edit qs-tap-target"
          aria-label="和穗奈梳理目标"
          @click="startButtonRipple($event, 2); openGoal()"
        >
          <image :src="assetPaths.icons.edit" />
        </button>
        <view v-if="summary.total" class="growth-goal-bottom">
          <view class="growth-progress"
            ><view
              class="growth-progress-fill qs-progress-fill"
              :style="{ width: summary.completion + '%' }"
          /></view>
          <text class="growth-progress-label"
            >{{ summary.doneCount }} / {{ summary.total }} 项行动已完成</text
          >
        </view>
        <button :id="buttonRippleId(3)" :style="buttonRippleStyle(3)" @touchstart="startButtonRipple($event, 3)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" v-else class="growth-goal-start qs-tap-target" @click="startButtonRipple($event, 3); openGoal()">
          和穗奈一起找方向 <text>↗</text>
        </button>
      </view>

      <view class="growth-trail qs-motion-block qs-motion-step-1" aria-label="职业成长资料入口">
        <button
          :id="buttonRippleId(4)"
          :style="buttonRippleStyle(4)"
          @touchstart="startButtonRipple($event, 4)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="growth-trail-item qs-tap-target"
          @click="startButtonRipple($event, 4); navigate('/pages/profile/index')"
        >
          <view class="growth-trail-icon qs-action-icon growth-trail-icon--profile"
            ><image :src="assets.navProfile"
          /></view>
          <text class="growth-trail-name">经历</text>
          <text class="growth-trail-value">{{
            summary.factCount ? summary.factCount + " 类资料" : "慢慢补充"
          }}</text>
        </button>
        <view class="growth-trail-connector" aria-hidden="true" />
        <button
          :id="buttonRippleId(5)"
          :style="buttonRippleStyle(5)"
          @touchstart="startButtonRipple($event, 5)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="growth-trail-item qs-tap-target"
          @click="startButtonRipple($event, 5); navigate('/pages/directions/index')"
        >
          <view class="growth-trail-icon qs-action-icon growth-trail-icon--jobs"
            ><image :src="assets.books"
          /></view>
          <text class="growth-trail-name">方向</text>
          <text class="growth-trail-value">{{
            career.jobs.length ? career.jobs.length + " 个岗位" : "去探索"
          }}</text>
        </button>
        <view class="growth-trail-connector" aria-hidden="true" />
        <button
          :id="buttonRippleId(6)"
          :style="buttonRippleStyle(6)"
          @touchstart="startButtonRipple($event, 6)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="growth-trail-item qs-tap-target"
          @click="startButtonRipple($event, 6); summary.next ? openAction(summary.next.id) : openGoal()"
        >
          <view class="growth-trail-icon qs-action-icon growth-trail-icon--actions"
            ><image :src="assets.navTasks"
          /></view>
          <text class="growth-trail-name">行动</text>
          <text class="growth-trail-value">{{
            summary.total
              ? summary.doneCount + " / " + summary.total + " 完成"
              : "定下一步"
          }}</text>
        </button>
        <view class="growth-trail-connector" aria-hidden="true" />
        <button
          :id="buttonRippleId(7)"
          :style="buttonRippleStyle(7)"
          @touchstart="startButtonRipple($event, 7)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="growth-trail-item qs-tap-target"
          @click="startButtonRipple($event, 7); navigate('/pages/resume/index')"
        >
          <view class="growth-trail-icon qs-action-icon growth-trail-icon--resume"
            ><image :src="assets.resume"
          /></view>
          <text class="growth-trail-name">简历</text>
          <text class="growth-trail-value">整理与导出</text>
        </button>
      </view>

      <button
        :id="buttonRippleId(8)"
        :style="buttonRippleStyle(8)"
        @touchstart="startButtonRipple($event, 8)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="summary.pendingCount"
        class="growth-pending qs-tap-target"
        @click="startButtonRipple($event, 8); navigate('/pages/profile/index')"
      >
        <view class="growth-pending-mark" /><text
          >{{ summary.pendingCount }} 项记录，等你核对</text
        ><text class="growth-pending-arrow">›</text>
      </button>

      <view class="growth-section-heading"
        ><text>现在，走这一小步</text
        ><image :src="assets.sparkle" aria-hidden="true"
      /></view>
      <view class="growth-next qs-motion-block qs-motion-later">
        <view v-if="summary.next" class="growth-next-top"
          ><text class="growth-next-state">{{
            actionLabel(summary.next.status)
          }}</text
          ><view class="growth-next-pin" aria-hidden="true"
        /></view>
        <text class="growth-next-title">{{
          summary.next?.title ||
          (summary.allDone
            ? "这一轮行动，都完成了。"
            : "把想法变成一件能做的事。")
        }}</text>
        <text v-if="summary.next?.why" class="growth-next-why qs-clamp">{{
          summary.next.why
        }}</text>
        <text v-else-if="!summary.next" class="growth-next-why">{{
          summary.allDone
            ? "带着已经积累的成果，再看看下一步。"
            : "和穗奈聊聊，找到适合你现在的一小步。"
        }}</text>
        <view v-if="summary.relatedJob" class="growth-related-job"
          ><image :src="assets.books" /><text>{{
            summary.relatedJob.title
          }}</text></view
        >
        <view
          v-if="summary.next?.learn || summary.next?.deliverable"
          class="growth-next-details"
        >
          <view v-if="summary.next.learn" class="growth-detail-row"
            ><image :src="assets.books" /><view
              ><text class="growth-detail-label">学什么</text
              ><text class="growth-detail-value qs-clamp">{{
                summary.next.learn
              }}</text></view
            ></view
          >
          <view v-if="summary.next.deliverable" class="growth-detail-row"
            ><image :src="assets.fileDocument" /><view
              ><text class="growth-detail-label">留下什么</text
              ><text class="growth-detail-value qs-clamp">{{
                summary.next.deliverable
              }}</text></view
            ></view
          >
        </view>
        <button
          :id="buttonRippleId(9)"
          :style="buttonRippleStyle(9)"
          @touchstart="startButtonRipple($event, 9)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="growth-next-button qs-tap-target"
          @click="startButtonRipple($event, 9); summary.next ? openAction(summary.next.id) : openGoal()"
        >
          <text>{{
            summary.next
              ? "继续这一步"
              : summary.allDone
                ? "和穗奈回顾一下"
                : "一起确定下一步"
          }}</text
          ><text class="qs-action-arrow">↗</text>
        </button>
      </view>

      <view v-if="summary.otherActions.length" class="growth-action-list">
        <button
          :id="buttonRippleId(10, [action.id])"
          :style="buttonRippleStyle(10, [action.id])"
          @touchstart="startButtonRipple($event, 10, [action.id])"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          v-for="action in summary.otherActions"
          :key="action.id"
          class="growth-action-row qs-tap-target"
          @click="startButtonRipple($event, 10, [action.id]); openAction(action.id)"
        >
          <view
            class="growth-action-dot"
            :class="action.status === 'done' ? 'growth-action-dot--done' : ''"
            ><text v-if="action.status === 'done'">✓</text></view
          >
          <text class="growth-action-name">{{ action.title }}</text
          ><text class="growth-action-status">{{
            actionLabel(action.status)
          }}</text
          ><text class="growth-action-arrow qs-action-arrow">›</text>
        </button>
      </view>

      <view v-if="summary.result" class="growth-result qs-motion-block qs-motion-step-3">
        <image
          class="growth-result-icon"
          :src="assetPaths.characters.experienceItems"
          mode="aspectFit"
        />
        <view class="growth-result-copy"
          ><text class="growth-result-label">留下的积累</text
          ><text class="growth-result-title">{{ summary.result.title }}</text
          ><text class="growth-result-text qs-clamp">{{
            summary.result.result
          }}</text></view
        >
        <button
          :id="buttonRippleId(11)"
          :style="buttonRippleStyle(11)"
          @touchstart="startButtonRipple($event, 11)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="growth-result-open qs-tap-target"
          aria-label="查看已完成行动的成果"
          @click="startButtonRipple($event, 11); openAction(summary.result.id)"
        >
          ↗
        </button>
      </view>

      <view class="growth-companion-note">
        <image
          class="growth-companion-avatar"
          :src="assetPaths.characters.suinaiThink"
          mode="aspectFit"
        />
        <view class="growth-companion-bubble"
          ><text>{{
            summary.allDone
              ? "走过的每一步，都算数。"
              : "不用一次走很远，先把这一步走好。"
          }}</text
          ><button :id="buttonRippleId(12)" :style="buttonRippleStyle(12)" @touchstart="startButtonRipple($event, 12)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="growth-companion-link qs-tap-target" @click="startButtonRipple($event, 12); openGoal()">
            和穗奈聊聊 <text>↗</text>
          </button></view
        >
      </view>
    </template>
  </view>
</template>
<script setup lang="ts">
import DotBackground from "../../components/DotBackground.vue";
import { useSurfaceRipple } from "../../services/surface-ripple";
const { surfaceRipples, startSurfaceRipple } = useSurfaceRipple();
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { useTabPageFrame } from "../../services/tab-page-frame";
import { computed, ref, shallowRef } from "vue";
import { onShow, onPullDownRefresh } from "@dcloudio/uni-app";
import {
  careerApi,
  hasToken,
  goToAuth,
  getToken,
  type CareerView,
} from "../../services/api";
import {
  careerSource,
  setCareerSource,
  openCareerChat,
} from "../../services/career-context";
import { errorText } from "../../services/workspace";
import { growthSummary } from "../../services/growth-summary";
import { syncTabBarHighlight } from "../../services/tabbar";
import { assetPaths } from "../../static/assets";
import CareerSource from "../../components/CareerSource.vue";
import AppHeader from "../../components/AppHeader.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
const pageMotionClass = usePageMotion();
const pageFrameReady = useTabPageFrame();
const assets = assetPaths.prototype,
  snapshot = shallowRef<{
    career: CareerView;
    summary: ReturnType<typeof growthSummary>;
  } | null>(null),
  loading = ref(true),
  error = ref(""),
  source = ref(careerSource());
let generation = 0,
  owner: string | null = null;
const career = computed(() => snapshot.value?.career ?? null);
const summary = computed(() => snapshot.value?.summary ?? null);
onShow(() => {
  syncTabBarHighlight();
  if (!hasToken()) {
    goToAuth();
    return;
  }
  const nextSource = careerSource(),
    nextOwner = getToken();
  if (nextSource !== source.value || nextOwner !== owner) snapshot.value = null;
  source.value = nextSource;
  owner = nextOwner;
  void load();
});
onPullDownRefresh(async () => {
  try {
    await load();
  } finally {
    uni.stopPullDownRefresh();
  }
});
async function load() {
  const current = ++generation,
    requestOwner = getToken(),
    requestSource = source.value;
  loading.value = true;
  error.value = "";
  try {
    const value = await careerApi.view(requestSource);
    if (current === generation && requestOwner === getToken())
      snapshot.value = { career: value, summary: growthSummary(value) };
  } catch (e) {
    if (current === generation && requestOwner === getToken())
      error.value = errorText(e);
  } finally {
    if (current === generation) loading.value = false;
  }
}
function changeSource(value: string) {
  source.value = value;
  setCareerSource(value);
  snapshot.value = null;
  void load();
}
function navigate(url: string) {
  uni.navigateTo({ url });
}
function openGoal() {
  openCareerChat(
    career.value?.profile.goal
      ? summary.value?.allDone
        ? `我目前的目标是：${career.value.profile.goal}。请和我回顾已完成行动的实际成果，再一起确定下一步。`
        : `我目前的目标是：${career.value.profile.goal}。请结合我的已确认经历，和我一起梳理下一步。`
      : "我想结合自己的经历和偏好，探索适合的职业方向。请一次只引导我补充一件重要的信息。",
    source.value,
  );
}
function openAction(id: string) {
  navigate("/pages/action/index?id=" + encodeURIComponent(id));
}
function actionLabel(status: string) {
  return (
    (
      { todo: "待开始", doing: "进行中", done: "已完成" } as Record<
        string,
        string
      >
    )[status] || status
  );
}
</script>
<style lang="scss">
.growth-page {
  padding-bottom: calc(170rpx + env(safe-area-inset-bottom));
}
.growth-goal {
  position: relative;
  overflow: hidden;
  padding: 28rpx 28rpx 24rpx;
  background: var(--qs-mint-soft);
  border: 1rpx solid #d0dfd2;
  border-radius: $qs-radius-card;
  box-shadow: $qs-shadow-card;
}
.growth-goal-rule {
  position: absolute;
  left: 0;
  top: 25rpx;
  bottom: 25rpx;
  width: 5rpx;
  background: #8eae98;
  border-radius: 4rpx;
}
.growth-goal-heading {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10rpx;
  @include qs-ui-type($qs-type-label);
  color: #6f8a76;
}
.growth-goal-heading image {
  width: 32rpx;
  height: 32rpx;
}
.growth-goal-title {
  position: relative;
  display: block;
  max-width: 78%;
  min-height: 92rpx;
  margin: 22rpx 0 26rpx;
  color: #365642;
  font-family: $qingsui-font;
  font-size: $qs-type-page;
  font-weight:400;
  line-height: 1.55;
  white-space: pre-line;
  word-break: break-word;
}
.growth-goal-art {
  position: absolute;
  right: 4rpx;
  bottom: 67rpx;
  width: 159rpx;
  height: 100rpx;
  opacity: 0.8;
}
.growth-goal-edit {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 64rpx;
  height: 64rpx;
  padding: 18rpx;
  margin: 0;
  background: transparent;
}
.growth-goal-edit image {
  width: 100%;
  height: 100%;
}
.growth-goal-bottom {
  display: flex;
  align-items: center;
  gap: 20rpx;
  position: relative;
}
.growth-progress {
  flex: 1;
  height: 8rpx;
  background: #d5e2d5;
  border-radius: 6rpx;
  overflow: hidden;
}
.growth-progress-fill {
  height: 100%;
  border-radius: 6rpx;
  background: #83a48d;
}
.growth-progress-label {
  flex: none;
  font-size: 21rpx;
  color: #6f8977;
}
.growth-goal-start {
  display: inline-flex;
  align-items: center;
  gap: 18rpx;
  padding: 8rpx 0;
  margin: 0;
  background: transparent;
  color: #4d785a;
  line-height: 1.5;
  font-size: 24rpx;
}
.growth-trail {
  display: flex;
  align-items: flex-start;
  padding: 30rpx 0 26rpx;
}
.growth-trail-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  line-height: 1.4;
}
.growth-trail-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76rpx;
  height: 76rpx;
  border: 1rpx solid #e6deef;
  border-radius: $qs-radius-control;
  background: #f0eaf7;
}
.growth-trail-icon image {
  width: 45rpx;
  height: 45rpx;
}
.growth-trail-icon--jobs {
  background: #f6efdd;
  border-color: #ebe1ca;
}
.growth-trail-icon--actions {
  background: #eaf1e9;
  border-color: #dce7db;
}
.growth-trail-icon--resume {
  background: #f5eaf0;
  border-color: #eadde6;
}
.growth-trail-name {
  margin-top: 13rpx;
  @include qs-ui-type($qs-type-label);
  color: #51465f;
}
.growth-trail-value {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #9a8fa4;
  white-space: nowrap;
}
.growth-trail-connector {
  width: 19rpx;
  height: 1rpx;
  background: #ded4e7;
  margin-top: 38rpx;
  flex: none;
}
.growth-pending {
  display: flex;
  align-items: center;
  gap: 13rpx;
  width: 100%;
  margin: 0 0 32rpx;
  padding: 18rpx 22rpx;
  border: 1rpx solid #eee0c8;
  border-radius: $qs-radius-control;
  background: #fbf2e2;
  color: #9c7e42;
  text-align: left;
  font-size: 24rpx;
  line-height: 1.5;
}
.growth-pending-mark {
  width: 9rpx;
  height: 9rpx;
  border-radius: 50%;
  background: #c5a15c;
}
.growth-pending-arrow {
  margin-left: auto;
  font-size: 27rpx;
}
.growth-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 5rpx 0 18rpx;
  color: #53455e;
  @include qs-ui-type($qs-type-section);
}
.growth-section-heading image {
  width: 34rpx;
  height: 34rpx;
}
.growth-next {
  position: relative;
  overflow: hidden;
  background: var(--qs-paper);
  border: 1rpx solid var(--qs-lilac);
  border-top: 4rpx solid #a58cb9;
  border-radius: $qs-radius-card;
  box-shadow: $qs-shadow-card;
  padding: 26rpx;
}
.growth-next-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.growth-next-pin {
  width: 20rpx;
  height: 20rpx;
  border: 1rpx solid #b8a2c7;
  background: #f0e6f6;
  transform: rotate(45deg);
}
.growth-next-state {
  color: #82718f;
  @include qs-ui-type($qs-type-small);
}
.growth-next-title {
  display: block;
  margin-top: 12rpx;
  color: #483853;
  font-family: $qingsui-font;
  font-size: $qs-type-section;
  font-weight:400;
  line-height: 1.55;
}
.growth-next-why {
  display: block;
  color: #908398;
  margin-top: 14rpx;
  font-size: 24rpx;
  line-height: 1.75;
}
.growth-related-job {
  display: flex;
  align-items: center;
  gap: 9rpx;
  margin-top: 18rpx;
  color: #8c7b99;
  font-size: 22rpx;
}
.growth-related-job image {
  width: 27rpx;
  height: 27rpx;
}
.growth-next-details {
  margin-top: 22rpx;
  padding: 21rpx;
  background: var(--qs-paper-soft);
  border-radius: $qs-radius-inset;
}
.growth-detail-row {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
}
.growth-detail-row + .growth-detail-row {
  margin-top: 22rpx;
}
.growth-detail-row > image {
  width: 31rpx;
  height: 33rpx;
  margin-top: 4rpx;
  flex: none;
}
.growth-detail-row > view {
  min-width: 0;
  flex: 1;
}
.growth-detail-label {
  display: block;
  margin-bottom: 6rpx;
  font-size: 21rpx;
  color: #a095aa;
}
.growth-detail-value {
  color: #6e5e7d;
  font-size: 24rpx;
  line-height: 1.65;
}
.growth-next-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin: 24rpx 0 0;
  padding: 21rpx 24rpx;
  border: 1rpx solid #7e689f;
  border-radius: $qs-radius-control;
  background: #8772a8;
  box-shadow: 2rpx 3rpx 0 rgba(98, 73, 132, 0.2);
  color: #fff8ff;
  text-align: left;
  @include qs-ui-type(26rpx);
  line-height: 1.5;
}
.growth-action-list {
  padding: 5rpx 5rpx 0;
}
.growth-action-row {
  display: flex;
  align-items: center;
  gap: 13rpx;
  padding: 23rpx 3rpx;
  margin: 0;
  width: 100%;
  border-bottom: 1rpx solid #eae3ed;
  background: transparent;
  text-align: left;
  font-size: 24rpx;
  line-height: 1.5;
}
.growth-action-dot {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: none;
  width: 29rpx;
  height: 29rpx;
  border: 1rpx solid #d8cde2;
  border-radius: 50%;
  color: #799b85;
  font-size: 20rpx;
}
.growth-action-dot--done {
  background: #e7efe5;
  border-color: #cddfcf;
}
.growth-action-name {
  flex: 1;
  min-width: 0;
  color: #796d84;
  font-family: $qingsui-font;
  font-size: $qs-type-body;
}
.growth-action-status {
  flex: none;
  color: #a195aa;
  font-size: 21rpx;
}
.growth-action-arrow {
  color: #b3a7ba;
}
.growth-result {
  display: flex;
  align-items: flex-start;
  gap: 17rpx;
  padding: 25rpx 22rpx;
  margin-top: 27rpx;
  background: #f0f3e9;
  border: 1rpx solid #d9e2ce;
  border-radius: $qs-radius-card;
}
.growth-result-icon {
  width: 93rpx;
  height: 97rpx;
  flex: none;
}
.growth-result-copy {
  flex: 1;
  min-width: 0;
}
.growth-result-label {
  display: block;
  font-size: 21rpx;
  color: #8e9a76;
}
.growth-result-title {
  display: block;
  margin-top: 8rpx;
  font-size: 25rpx;
  color: #62714d;
  line-height: 1.5;
}
.growth-result-text {
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #899379;
}
.growth-result-open {
  flex: none;
  width: 50rpx;
  height: 56rpx;
  padding: 0;
  margin: 0;
  background: transparent;
  color: #8f9f77;
  font-size: 30rpx;
  line-height: 56rpx;
}
.growth-companion-note {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 32rpx 0 0;
}
.growth-companion-avatar {
  width: 125rpx;
  height: 140rpx;
  flex: none;
}
.growth-companion-bubble {
  flex: 1;
  min-width: 0;
  padding: 18rpx 20rpx;
  border: 1rpx solid #e9dfef;
  border-radius: $qs-radius-card $qs-radius-card $qs-radius-card 4rpx;
  background: #f4edf8;
  color: #8c789d;
  font-size: 24rpx;
  line-height: 1.65;
}
.growth-companion-link {
  padding: 10rpx 0 0;
  margin: 0;
  color: #9278a8;
  background: transparent;
  text-align: left;
  font-size: 22rpx;
  line-height: 1.5;
}
.growth-companion-link text {
  margin-left: 10rpx;
}
.growth-page .app-header-actions .qs-source-select {
  padding: 12rpx 0;
  margin: 0;
  font-size: 23rpx;
}
@media (prefers-reduced-motion: reduce) {
  .growth-progress-fill {
    transition: none;
  }
}
</style>
