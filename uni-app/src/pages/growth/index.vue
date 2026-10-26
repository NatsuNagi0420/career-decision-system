/** 青穗集 · 小程序成长页：把 8110 返回的画像、岗位样本和行动状态变成可继续的路线。 */
<template>
  <view class="qs-page growth-page qs-stagger">
    <view class="page-heading"><text class="qs-eyebrow">MY NEXT STEP</text><text class="qs-title">成长路线</text></view>

    <view v-if="loading" class="growth-loading qs-card"><image class="qs-spin" :src="assets.icons.sync" mode="aspectFit" /><text>正在整理路线</text></view>
    <view v-else-if="errorMessage" class="growth-error qs-card"><image :src="assets.icons.pendingWarning" mode="aspectFit" /><text>{{ errorMessage }}</text><button class="growth-retry qs-ripple" @click="loadCareer">重试</button></view>
    <template v-else>
      <view class="progress-card qs-card">
        <view class="progress-ring" :style="{ background: progressGradient }"><view class="progress-ring-inner"><text>{{ progress }}%</text></view></view>
        <view class="progress-copy-wrap"><text class="progress-title">{{ progressTitle }}</text><text class="progress-copy">{{ progressCopy }}</text></view>
        <image class="progress-art qs-empty-orb" :src="assets.characters.growthRouteIllustration" mode="aspectFit" />
      </view>

      <view class="route-grid qs-stagger">
        <view class="route-tile qs-card"><image :src="assets.icons.resourcesPanel" mode="aspectFit" /><text class="route-value">{{ profileState }}</text><text class="route-label">画像</text></view>
        <view class="route-tile qs-card"><image :src="assets.icons.jobs" mode="aspectFit" /><text class="route-value">{{ jobCount }}</text><text class="route-label">岗位</text></view>
        <view class="route-tile qs-card"><image :src="assets.icons.startAction" mode="aspectFit" /><text class="route-value">{{ actionCount }}</text><text class="route-label">行动</text></view>
      </view>

      <view v-if="directions.length" class="growth-section">
        <view class="section-heading"><text>岗位方向</text><image :src="assets.icons.target" mode="aspectFit" /></view>
        <view class="direction-list qs-card">
          <view v-for="direction in directions" :key="direction.code" class="direction-item">
            <view class="direction-mark"></view>
            <view class="direction-copy"><text class="direction-name">{{ direction.name }}</text><text class="direction-summary">{{ direction.summary }}</text></view>
            <image :src="assets.icons.forward" mode="aspectFit" />
          </view>
        </view>
      </view>

      <view class="growth-section">
        <view class="section-heading"><text>接下来</text><text v-if="actions.length" class="section-meta">{{ actionCount }} 项行动</text></view>
        <view v-if="actions.length" class="action-list qs-card">
          <view v-for="action in actions.slice(0, 3)" :key="action.id" class="action-item">
            <view class="action-status" :class="`action-status--${action.status}`"></view>
            <view><text class="action-title">{{ action.title }}</text><text class="action-copy">{{ action.deliverable }}</text></view>
          </view>
        </view>
        <view v-else class="empty-card qs-card">
          <image class="empty-art qs-empty-orb" :src="assets.characters.pixelCat" mode="aspectFit" />
          <view class="empty-copy-wrap"><text class="empty-title">路线还在等你确认</text><text class="empty-copy">和穗奈聊过的内容，会在确认后变成岗位和行动。</text><button class="qs-button qs-button--primary qs-ripple" @click="openChat">去聊聊</button></view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { AgentApiError, careerApi, goToAuth, hasToken, type CareerAction, type CareerDirection, type CareerView } from "../../services/api";
import { assetPaths } from "../../static/assets";

const assets = assetPaths;
const career = ref<CareerView | null>(null);
const directions = ref<CareerDirection[]>([]);
const loading = ref(false);
const errorMessage = ref("");

const actions = computed<CareerAction[]>(() => career.value?.actions ?? []);
const profileFieldCount = computed(() => {
  const profile = career.value?.profile;
  return profile ? [profile.goal, profile.education, profile.experience, profile.skills, profile.preferences, profile.weekly_hours].filter(Boolean).length : 0;
});
const progress = computed(() => {
  const profilePart = Math.min(profileFieldCount.value / 6, 1) * 60;
  const jobPart = Math.min((career.value?.jobs.length ?? 0) / 3, 1) * 25;
  const actionPart = Math.min(actions.value.length / 3, 1) * 15;
  return Math.round(profilePart + jobPart + actionPart);
});
const progressGradient = computed(() => `conic-gradient(#7656a5 ${progress.value}%, #e6d8f5 0)`);
const progressTitle = computed(() => progress.value ? "路线正在成形" : "路线还在生成中");
const progressCopy = computed(() => progress.value ? "每一条已确认的信息，都会让下一步更具体。" : "先从一次自然对话开始，穗奈只使用你确认过的内容。");
const profileState = computed(() => career.value?.profile.confirmed_at ? "已定" : "—");
const jobCount = computed(() => (career.value?.jobs.length ?? 0) + (career.value?.saved_jobs.length ?? 0));
const actionCount = computed(() => actions.value.length);

onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void loadCareer();
});

async function loadCareer() {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const [careerResult, directionResult] = await Promise.allSettled([careerApi.view(), careerApi.directions({ limit: 3 })]);
    if (careerResult.status !== "fulfilled") throw careerResult.reason;
    career.value = careerResult.value;
    directions.value = directionResult.status === "fulfilled" ? directionResult.value.directions : [];
  } catch (error) {
    if (error instanceof AgentApiError && error.status === 0) errorMessage.value = "无法连接 8110，请确认 Agent 服务正在运行。";
    else errorMessage.value = error instanceof Error ? error.message : "路线读取失败";
  } finally {
    loading.value = false;
  }
}

function openChat() { uni.switchTab({ url: "/pages/chat/index" }); }
</script>

<style lang="scss">
.page-heading .qs-title { display: block; }
.progress-card { position: relative; display: flex; align-items: center; gap: 24rpx; min-height: 210rpx; margin-top: 34rpx; padding: 30rpx; overflow: hidden; }
.progress-ring { display: flex; align-items: center; justify-content: center; width: 140rpx; height: 140rpx; flex: none; border-radius: 50%; animation: progress-glow 2.8s ease-in-out infinite; }
.progress-ring-inner { display: flex; align-items: center; justify-content: center; width: 118rpx; height: 118rpx; border-radius: 50%; color: $qingsui-primary; background: $qingsui-paper; font-size: 25rpx; }
.progress-copy-wrap { position: relative; z-index: 1; width: 48%; }
.progress-title { display: block; color: $qingsui-ink; font-size: 27rpx; }
.progress-copy { display: block; margin-top: 10rpx; color: $qingsui-muted; font-size: 20rpx; line-height: 1.6; }
.progress-art { position: absolute; right: -40rpx; bottom: -60rpx; width: 260rpx; height: 260rpx; opacity: .32; }
.route-grid { display: flex; gap: 14rpx; margin-top: 20rpx; }
.route-tile { display: flex; flex: 1; flex-direction: column; align-items: center; min-height: 142rpx; padding: 18rpx 8rpx; text-align: center; }
.route-tile image { width: 34rpx; height: 34rpx; }
.route-value { margin-top: 10rpx; color: $qingsui-primary; font-size: 29rpx; }
.route-label { margin-top: 6rpx; color: $qingsui-faint; font-size: 18rpx; }
.growth-section { margin-top: 34rpx; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin: 0 4rpx 18rpx; color: $qingsui-ink; font-size: 29rpx; }
.section-heading image { width: 34rpx; height: 34rpx; }
.section-meta { color: $qingsui-faint; font-size: 19rpx; }
.direction-list, .action-list { padding: 8rpx 24rpx; }
.direction-item, .action-item { display: flex; align-items: center; gap: 14rpx; min-height: 86rpx; padding: 16rpx 0; border-bottom: 1rpx solid $qingsui-paper-soft; }
.direction-item:last-child, .action-item:last-child { border-bottom: 0; }
.direction-mark { width: 12rpx; height: 12rpx; flex: none; border-radius: 50%; background: $qingsui-mint; box-shadow: 0 0 0 6rpx rgba(116, 170, 152, .14); }
.direction-copy, .action-item > view:nth-child(2) { min-width: 0; flex: 1; }
.direction-name, .direction-summary, .action-title, .action-copy { display: block; }
.direction-name, .action-title { color: $qingsui-ink; font-size: 23rpx; }
.direction-summary, .action-copy { margin-top: 5rpx; overflow: hidden; color: $qingsui-muted; font-size: 18rpx; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.direction-item > image { width: 27rpx; height: 27rpx; }
.action-status { width: 14rpx; height: 14rpx; flex: none; border: 3rpx solid $qingsui-lilac; border-radius: 50%; }
.action-status--doing { border-color: $qingsui-primary; background: $qingsui-primary; animation: action-pulse 1.6s ease-in-out infinite; }
.action-status--done { border-color: $qingsui-mint; background: $qingsui-mint; }
.empty-card { display: flex; align-items: center; min-height: 210rpx; padding: 24rpx; overflow: hidden; }
.empty-art { width: 160rpx; height: 160rpx; flex: none; }
.empty-copy-wrap { padding-left: 14rpx; }
.empty-title { display: block; color: $qingsui-ink; font-size: 27rpx; }
.empty-copy { display: block; margin-top: 10rpx; color: $qingsui-muted; font-size: 21rpx; line-height: 1.6; }
.empty-card .qs-button { width: 190rpx; margin: 22rpx 0 0; min-height: 68rpx; font-size: 22rpx; }
.growth-loading, .growth-error { display: flex; align-items: center; gap: 12rpx; margin-top: 34rpx; padding: 28rpx; color: $qingsui-muted; font-size: 20rpx; }
.growth-loading image, .growth-error image { width: 34rpx; height: 34rpx; flex: none; }
.growth-error { align-items: flex-start; color: $qingsui-danger; line-height: 1.55; }
.growth-retry { height: 54rpx; margin: -8rpx 0 0 auto; padding: 0 14rpx; border: 1rpx solid $qingsui-lilac; border-radius: 13rpx; color: $qingsui-primary; background: $qingsui-primary-soft; font-size: 19rpx; }
@keyframes progress-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(118, 86, 165, .08); } 50% { box-shadow: 0 0 0 8rpx rgba(118, 86, 165, .05); } }
@keyframes action-pulse { 50% { opacity: .45; transform: scale(.72); } }
</style>
