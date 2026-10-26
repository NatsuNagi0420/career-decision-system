/** 青穗集 · 小程序画像页：只呈现 8110 返回的已确认职业事实，不把空状态包装成完成结果。 */
<template>
  <view class="qs-page profile-page qs-stagger">
    <view class="page-heading">
      <text class="qs-eyebrow">MY PROFILE</text>
      <text class="qs-title">我的画像</text>
    </view>

    <view v-if="loading" class="profile-loading qs-card"><image class="qs-spin" :src="assets.icons.sync" mode="aspectFit" /><text>正在读取画像</text></view>
    <view v-else-if="errorMessage" class="profile-error qs-card"><image :src="assets.icons.pendingWarning" mode="aspectFit" /><text>{{ errorMessage }}</text><button class="profile-retry qs-ripple" @click="loadCareer">重试</button></view>
    <template v-else>
      <view class="profile-card qs-card">
        <image class="profile-art qs-empty-orb" :src="assets.characters.suinaiFullBody" mode="aspectFit" />
        <view class="profile-head">
          <image :src="assets.characters.suinaiWave" class="profile-avatar qs-avatar-float" mode="aspectFit" />
          <view><text class="profile-name">{{ profileHeadline }}</text><text class="profile-status">{{ profileStatus }}</text></view>
        </view>
        <view v-if="profileFacts.length" class="profile-lines">
          <view v-for="fact in profileFacts" :key="fact.label" class="profile-line">
            <image :src="fact.icon" mode="aspectFit" />
            <view><text class="line-label">{{ fact.label }}</text><text class="line-value">{{ fact.value }}</text></view>
          </view>
        </view>
        <view v-else class="profile-empty">
          <image class="qs-empty-orb" :src="assets.characters.pixelCat" mode="aspectFit" />
          <text>先和穗奈聊几句，画像会从你确认过的内容开始长出来。</text>
        </view>
      </view>

      <view class="profile-stats qs-card">
        <view><text class="stat-value">{{ factCount }}</text><text class="stat-label">已确认线索</text></view>
        <view><text class="stat-value">{{ sourceCount }}</text><text class="stat-label">对话来源</text></view>
        <view><text class="stat-value">{{ jobCount }}</text><text class="stat-label">岗位样本</text></view>
      </view>
    </template>

    <button class="qs-button qs-button--primary qs-ripple profile-action" @click="openChat"><image :src="assets.icons.chat" mode="aspectFit" />和穗奈一起整理</button>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { AgentApiError, careerApi, goToAuth, hasToken, type CareerView } from "../../services/api";
import { assetPaths } from "../../static/assets";

const assets = assetPaths;
const career = ref<CareerView | null>(null);
const loading = ref(false);
const errorMessage = ref("");

const profileFacts = computed(() => {
  const profile = career.value?.profile;
  if (!profile) return [];
  return [
    { label: "当前目标", value: profile.goal, icon: assets.icons.target },
    { label: "教育背景", value: profile.education, icon: assets.icons.project },
    { label: "经历线索", value: profile.experience, icon: assets.icons.checklist },
    { label: "技能依据", value: profile.skills, icon: assets.icons.confirm },
    { label: "偏好", value: profile.preferences, icon: assets.icons.navigate },
    { label: "每周投入", value: profile.weekly_hours, icon: assets.icons.startAction },
  ].filter(item => item.value.trim());
});
const profileHeadline = computed(() => career.value?.profile.confirmed_at ? "正在成形的你" : "还在认识中的你");
const profileStatus = computed(() => career.value?.profile.confirmed_at ? "内容来自已确认事实" : "等待第一份确认资料");
const factCount = computed(() => profileFacts.value.length);
const sourceCount = computed(() => career.value?.sources?.length ?? 0);
const jobCount = computed(() => (career.value?.jobs.length ?? 0) + (career.value?.saved_jobs.length ?? 0));

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
    career.value = await careerApi.view();
  } catch (error) {
    if (error instanceof AgentApiError && error.status === 0) errorMessage.value = "无法连接 8110，请确认 Agent 服务正在运行。";
    else errorMessage.value = error instanceof Error ? error.message : "画像读取失败";
  } finally {
    loading.value = false;
  }
}

function openChat() { uni.switchTab({ url: "/pages/chat/index" }); }
</script>

<style lang="scss">
.page-heading .qs-title { display: block; }
.profile-card { position: relative; margin-top: 34rpx; padding: 30rpx; overflow: hidden; }
.profile-art { position: absolute; right: -32rpx; top: 0; width: 230rpx; height: 300rpx; opacity: .18; }
.profile-head { position: relative; z-index: 1; display: flex; align-items: center; gap: 20rpx; padding-bottom: 28rpx; border-bottom: 1rpx solid $qingsui-paper-soft; }
.profile-avatar { width: 106rpx; height: 106rpx; border-radius: 50%; background: $qingsui-primary-soft; }
.profile-name { display: block; color: $qingsui-ink; font-size: 28rpx; }
.profile-status { display: block; margin-top: 10rpx; color: $qingsui-faint; font-size: 21rpx; }
.profile-lines { position: relative; z-index: 1; }
.profile-line { display: flex; align-items: flex-start; gap: 16rpx; padding: 23rpx 0 0; animation: profile-line-enter .38s ease both; }
.profile-line:nth-child(2) { animation-delay: .06s; }
.profile-line:nth-child(3) { animation-delay: .12s; }
.profile-line:nth-child(4) { animation-delay: .18s; }
.profile-line:nth-child(5) { animation-delay: .24s; }
.profile-line:nth-child(6) { animation-delay: .3s; }
.profile-line image { width: 34rpx; height: 34rpx; flex: none; }
.line-label, .line-value { display: block; }
.line-label { color: $qingsui-muted; font-size: 20rpx; }
.line-value { max-height: 80rpx; margin-top: 5rpx; overflow: hidden; color: $qingsui-ink; font-size: 22rpx; line-height: 1.55; }
.profile-empty { position: relative; z-index: 1; display: flex; align-items: center; gap: 16rpx; padding-top: 26rpx; color: $qingsui-muted; font-size: 20rpx; line-height: 1.6; }
.profile-empty image { width: 96rpx; height: 96rpx; flex: none; }
.profile-stats { display: flex; align-items: center; justify-content: space-around; margin-top: 20rpx; padding: 22rpx 10rpx; text-align: center; }
.profile-stats > view { min-width: 0; flex: 1; border-right: 1rpx solid $qingsui-paper-soft; }
.profile-stats > view:last-child { border-right: 0; }
.stat-value, .stat-label { display: block; }
.stat-value { color: $qingsui-primary; font-size: 32rpx; }
.stat-label { margin-top: 7rpx; color: $qingsui-faint; font-size: 18rpx; }
.profile-loading, .profile-error { display: flex; align-items: center; gap: 12rpx; margin-top: 34rpx; padding: 28rpx; color: $qingsui-muted; font-size: 20rpx; }
.profile-loading image, .profile-error image { width: 34rpx; height: 34rpx; flex: none; }
.profile-error { align-items: flex-start; color: $qingsui-danger; line-height: 1.55; }
.profile-retry { height: 54rpx; margin: -8rpx 0 0 auto; padding: 0 14rpx; border: 1rpx solid $qingsui-lilac; border-radius: 13rpx; color: $qingsui-primary; background: $qingsui-primary-soft; font-size: 19rpx; }
.profile-action { width: 100%; margin-top: 28rpx; }
.profile-action image { width: 32rpx; height: 32rpx; margin-right: 10rpx; filter: brightness(0) invert(1); }
@keyframes profile-line-enter { from { opacity: 0; transform: translateX(-8rpx); } to { opacity: 1; transform: translateX(0); } }
</style>
