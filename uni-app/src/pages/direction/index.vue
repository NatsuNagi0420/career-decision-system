<!-- 青穗集 · 岗位方向页：展示方向概览与真实岗位样本，历史样本始终带时效说明，不伪装在招。 -->
<template>
  <view :class="pageMotionClass" class="qs-page direction-page">
    <view v-if="loading" class="direction-loading qs-card qs-motion-block">
      <image class="qs-spin" :src="assets.icons.sync" mode="aspectFit" />
      <text>正在整理岗位方向</text>
    </view>
    <view v-else-if="errorMessage" class="direction-error qs-card qs-motion-block">
      <image :src="assets.icons.pendingWarning" mode="aspectFit" />
      <text>{{ errorMessage }}</text>
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="direction-retry qs-tap-target" @click="startButtonRipple($event, 1); load()">重试</button>
    </view>
    <template v-else>
      <view class="direction-head qs-card qs-motion-block">
        <text class="direction-title">{{ directionName }}</text>
        <text class="direction-summary">
          {{ direction?.summary || "穗奈正在补充这个方向的介绍。" }}
        </text>
        <view v-if="direction?.common_skills.length" class="skill-chips">
          <text
            v-for="skill in direction.common_skills"
            :key="skill"
            class="skill-chip"
          >
            {{ skill }}
          </text>
        </view>
      </view>

      <view class="jobs-section">
        <view class="jobs-heading">
          <text>岗位样本</text>
          <text class="jobs-meta">{{ samples.length }} 条参考</text>
        </view>
        <view v-if="filterNotes.length" class="filter-notes qs-card qs-motion-block">
          <text v-for="note in filterNotes" :key="note" class="filter-note">
            {{ note }}
          </text>
        </view>
        <view v-if="samples.length" class="jobs-list qs-card qs-motion-block">
          <view v-for="job in samples" :key="job.id" class="job-item">
            <view class="job-main">
              <text class="job-title">{{ job.title }}</text>
              <view class="job-meta">
                <text class="job-company">{{ job.company }}</text>
                <text v-if="job.city" class="job-city">{{ job.city }}</text>
                <view
                  class="job-kind"
                  :class="
                    job.data_kind === 'historical' ? 'job-kind--historical' : ''
                  "
                >
                  <image
                    v-if="job.data_kind === 'historical'"
                    :src="assets.icons.history"
                    mode="aspectFit"
                  />
                  <text>
                    {{
                      job.data_kind === "historical" ? "历史样本" : "近期采集"
                    }}
                  </text>
                </view>
              </view>
              <text class="job-excerpt">{{ job.excerpt }}</text>
              <button :id="buttonRippleId(2, [job.id])" :style="buttonRippleStyle(2, [job.id])" @touchstart="startButtonRipple($event, 2, [job.id])" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="job-plan qs-tap-target" @click="startButtonRipple($event, 2, [job.id]); planJob(job)">
                和穗奈对照这个岗位 ↗
              </button>
            </view>
            <view class="job-side">
              <text
                class="job-status"
                :class="`job-status--${job.recruitment_status}`"
              >
                {{ statusLabel(job) }}
              </text>
              <button
                :id="buttonRippleId(3, [job.id])"
                :style="buttonRippleStyle(3, [job.id])"
                @touchstart="startButtonRipple($event, 3, [job.id])"
                hover-class="button-hover"
                hover-stop-propagation
                :hover-start-time="0"
                :hover-stay-time="110"
                v-if="job.source_url"
                class="job-link qs-tap-target"
                aria-label="查看原文"
                @click="startButtonRipple($event, 3, [job.id]); openSource(job.source_url)"
              >
                <image :src="assets.icons.forward" mode="aspectFit" />
              </button>
            </view>
          </view>
        </view>
        <view v-else class="jobs-empty qs-card qs-motion-block">
          <image
            class="jobs-empty-art qs-empty-orb"
            :src="assets.characters.pixelCat"
            mode="aspectFit"
          />
          <text>这个方向还没有收集到样本，可以回对话里让穗奈去查。</text>
        </view>
        <view class="jobs-notice">
          <image :src="assets.icons.shield" mode="aspectFit" />
          <text>{{ referenceNotice }}</text>
        </view>
      </view>
    </template>

    <button
      :id="buttonRippleId(4)"
      :style="buttonRippleStyle(4)"
      @touchstart="startButtonRipple($event, 4)"
      hover-class="button-hover"
      hover-stop-propagation
      :hover-start-time="0"
      :hover-stay-time="110"
      class="qs-button qs-button--primary direction-action qs-tap-target"
      @click="startButtonRipple($event, 4); openChat()"
    >
      <image :src="assets.icons.chat" mode="aspectFit" />
      让穗奈按这个方向帮我规划
    </button>
  </view>
</template>

<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { onLoad } from "@dcloudio/uni-app";
import { ref } from "vue";
import {
  isAgentApiError,
  CAREER_CATALOGUE_LIMITS,
  careerApi,
  hasToken,
  goToAuth,
  type CareerDirection,
  type CatalogueJobSample,
} from "../../services/api";
import { assetPaths } from "../../static/assets";

import { careerSource, openCareerChat } from "../../services/career-context";
const pageMotionClass = usePageMotion();
const assets = assetPaths;
const directionCode = ref("");
const directionName = ref("");
const direction = ref<CareerDirection | null>(null);
const samples = ref<CatalogueJobSample[]>([]);
const filterNotes = ref<string[]>([]);
const loading = ref(false);
const errorMessage = ref("");

const referenceNotice =
  "样本来自历史发布与公开采集，仅用于对照岗位要求；招聘状态以招聘方最新公告为准，穗奈不会把过期信息当成在招岗位。";

onLoad((options) => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  directionCode.value = decodeURIComponent(options?.code ?? "");
  directionName.value = decodeURIComponent(options?.name ?? "");
  void load();
});

async function load() {
  if (loading.value || !directionCode.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const [detail, jobs] = await Promise.all([
      careerApi
        .directions({ limit: CAREER_CATALOGUE_LIMITS.directions })
        .then(
          (result) =>
            result.directions.find(
              (item) => item.code === directionCode.value,
            ) ?? null,
        ),
      careerApi.jobs({
        directionCode: directionCode.value,
        limit: CAREER_CATALOGUE_LIMITS.jobs,
      }),
    ]);
    direction.value = detail;
    if (detail) directionName.value = detail.name;
    samples.value = jobs.samples;
    filterNotes.value = jobs.filter_notes ?? [];
  } catch (error) {
    if (isAgentApiError(error) && error.status === 0)
      errorMessage.value = "无法连接服务，请确认 Agent 服务正在运行。";
    else
      errorMessage.value =
        error instanceof Error ? error.message : "岗位样本读取失败";
  } finally {
    loading.value = false;
  }
}

function statusLabel(job: CatalogueJobSample): string {
  if (job.recruitment_status === "open_explicit") return "明确在招";
  if (job.recruitment_status === "closed_explicit") return "已截止";
  return "状态未知";
}

function openSource(url: string) {
  // #ifdef H5
  window.open(url, "_blank");
  return;
  // #endif
  // #ifndef H5
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: "原文链接已复制", icon: "none" }),
  });
  // #endif
}

function openChat() {
  openCareerChat(
    `我想了解并规划“${directionName.value}”方向。常见要求：${direction.value?.common_skills.join("、") || "尚待补充"}。请结合我的已确认画像，和我核对适合的行动。`,
    careerSource(),
  );
}
function planJob(job: CatalogueJobSample) {
  openCareerChat(
    `请帮我对照这个岗位样本：${job.title}，${job.company}，${job.city}。\n岗位要求：${job.excerpt}\n来源：${job.source_url}\n请说明我已有的证据和能力差距；这是一份岗位样本，请核实招聘时效。`,
    careerSource(),
  );
}
</script>

<style lang="scss">
.direction-head {
  margin-top: 20rpx;
  padding: 30rpx 28rpx;
}
.direction-title {
  display: block;
  margin-top: 10rpx;
  color: $qingsui-ink;
  font-size: 40rpx;
  font-weight: 500;
  line-height: 1.3;
}
.direction-summary {
  display: block;
  margin-top: 14rpx;
  color: $qingsui-muted;
  font-size: 22rpx;
  line-height: 1.7;
}
.skill-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 20rpx;
}
.skill-chip {
  padding: 8rpx 18rpx;
  border: 1rpx solid $qingsui-lilac;
  border-radius: 24rpx;
  color: $qingsui-primary;
  background: $qingsui-primary-soft;
  font-size: 19rpx;
}

.jobs-section {
  margin-top: 34rpx;
}
.jobs-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 4rpx 14rpx;
  color: $qingsui-ink;
  font-size: 28rpx;
}
.jobs-meta {
  color: $qingsui-faint;
  font-size: 19rpx;
}
.filter-notes {
  padding: 16rpx 20rpx;
}
.filter-note {
  display: block;
  color: $qingsui-faint;
  font-size: 19rpx;
  line-height: 1.6;
}
.jobs-list {
  padding: 6rpx 24rpx;
}
.job-item {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid $qingsui-paper-soft;
}
.job-item:last-child {
  border-bottom: 0;
}
.job-main {
  min-width: 0;
  flex: 1;
}
.job-title {
  display: block;
  color: $qingsui-ink;
  font-size: 23rpx;
  line-height: 1.4;
}
.job-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 8rpx;
}
.job-company,
.job-city {
  color: $qingsui-muted;
  font-size: 19rpx;
}
.job-kind {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 2rpx 12rpx;
  border-radius: 16rpx;
  background: $qingsui-primary-soft;
  color: $qingsui-primary;
  font-size: 17rpx;
}
.job-kind image {
  width: 22rpx;
  height: 22rpx;
}
.job-kind--historical {
  background: $qingsui-paper-soft;
  color: $qingsui-faint;
}
.job-excerpt {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin-top: 10rpx;
  color: $qingsui-muted;
  font-size: 19rpx;
  line-height: 1.55;
}
.job-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12rpx;
  flex: none;
}
.job-status {
  padding: 4rpx 14rpx;
  border-radius: 16rpx;
  font-size: 17rpx;
  background: $qingsui-paper-soft;
  color: $qingsui-muted;
}
.job-status--open_explicit {
  background: rgba(116, 170, 152, 0.16);
  color: $qingsui-mint;
}
.job-status--closed_explicit {
  background: rgba(186, 91, 100, 0.1);
  color: $qingsui-danger;
}
.job-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  margin: 0;
  padding: 0;
  border: 1rpx solid $qingsui-lilac;
  border-radius: 12rpx;
  background: transparent;
}
.job-link image {
  width: 26rpx;
  height: 26rpx;
  transform: rotate(90deg);
}
.jobs-empty {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 26rpx;
  color: $qingsui-muted;
  font-size: 20rpx;
  line-height: 1.6;
}
.jobs-empty image {
  width: 110rpx;
  height: 110rpx;
  flex: none;
}
.jobs-notice {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  margin: 16rpx 6rpx 0;
  color: $qingsui-faint;
  font-size: 18rpx;
  line-height: 1.7;
}
.jobs-notice image {
  width: 30rpx;
  height: 30rpx;
  flex: none;
  margin-top: 2rpx;
}
.direction-loading,
.direction-error {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 30rpx;
  padding: 28rpx;
  color: $qingsui-muted;
  font-size: 20rpx;
}
.direction-loading image,
.direction-error image {
  width: 34rpx;
  height: 34rpx;
  flex: none;
}
.direction-error {
  align-items: flex-start;
  color: $qingsui-danger;
  line-height: 1.55;
}
.direction-retry {
  height: 54rpx;
  margin: -8rpx 0 0 auto;
  padding: 0 14rpx;
  border: 1rpx solid $qingsui-lilac;
  border-radius: 13rpx;
  color: $qingsui-primary;
  background: $qingsui-primary-soft;
  font-size: 19rpx;
}
.direction-action {
  width: 100%;
  margin-top: 30rpx;
}
.direction-action image {
  width: 32rpx;
  height: 32rpx;
  margin-right: 10rpx;
  filter: brightness(0) invert(1);
}
.job-plan {
  padding: 14rpx 0 0;
  margin: 0;
  text-align: left;
  font-size: 24rpx;
  line-height: 1.6;
  background: transparent;
  color: #8064af;
}
</style>
