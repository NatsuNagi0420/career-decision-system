<!-- 青穗集 · 岗位方向列表：真实静态岗位库检索，已记录目标与可探索方向分组展示。 -->
<template>
  <view :class="pageMotionClass" class="qs-page">
    <CareerSource @change="changeSource" />
    <view class="direction-search qs-motion-block">
      <input
        v-model="query"
        placeholder="搜索方向，例如产品、开发、设计"
        @confirm="load"
      />
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-icon-button qs-tap-target" aria-label="搜索方向" @click="startButtonRipple($event, 1); load()">
        <image :src="assets.search" />
      </button>
    </view>
    <view v-if="error" class="qs-error">
      {{ error }}
      <button :id="buttonRippleId(2)" :style="buttonRippleStyle(2)" @touchstart="startButtonRipple($event, 2)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 2); load()">重试</button>
    </view>
    <view class="direction-results qs-motion-block">
      <template v-if="career?.jobs.length">
        <text class="qs-section-title">正在关注的岗位</text>
        <view
          :hover-start-time="0"
          v-for="job in career.jobs"
          :key="job.id"
          class="saved-job qs-card qs-press"
          hover-class="qs-pressed"
          :hover-stay-time="120"
          @click="planJob(job)"
        >
          <text>{{ job.title }}</text>
          <text class="qs-row-note">{{ job.company }}</text>
          <text class="qs-row-note qs-clamp">{{ job.description }}</text>
          <text class="saved-plan">围绕这个岗位继续聊 ↗</text>
        </view>
      </template>
      <text class="qs-section-title">探索职业方向</text>
      <LoadingSkeleton v-if="loading && !directions.length" />
      <view
        :hover-start-time="0"
        v-for="direction in directions"
        :key="direction.code"
        class="direction-option qs-card qs-press"
        hover-class="qs-pressed"
        :hover-stay-time="120"
        @click="open(direction)"
      >
        <view>
          <text>{{ direction.name }}</text>
          <text class="qs-chevron">›</text>
        </view>
        <text class="qs-row-note qs-clamp">{{ direction.summary }}</text>
        <view class="direction-tags">
          <text v-for="skill in direction.common_skills.slice(0, 4)" :key="skill">
            {{ skill }}
          </text>
        </view>
      </view>
      <text
        v-if="!loading && !error && !directions.length"
        class="qs-inline-note"
      >
        没有找到这个方向，可以换个关键词。
      </text>
      <text v-if="coverage" class="qs-inline-note">{{ coverage }}</text>
    </view>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  careerApi,
  CAREER_CATALOGUE_LIMITS,
  hasToken,
  goToAuth,
  type CareerDirection,
  type CareerView,
  type CareerJob,
} from "../../services/api";
import {
  careerSource,
  setCareerSource,
  openCareerChat,
} from "../../services/career-context";
import { errorText } from "../../services/workspace";
import { assetPaths } from "../../static/assets";
import CareerSource from "../../components/CareerSource.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
const pageMotionClass = usePageMotion();
const assets = assetPaths.prototype,
  source = ref(careerSource()),
  career = ref<CareerView | null>(null),
  directions = ref<CareerDirection[]>([]),
  query = ref(""),
  loading = ref(false),
  error = ref(""),
  coverage = ref("");
let generation = 0;
onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void load();
});
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  try {
    const [list, view] = await Promise.all([
      careerApi.directions({
        query: query.value || undefined,
        limit: CAREER_CATALOGUE_LIMITS.directions,
      }),
      careerApi.view(source.value),
    ]);
    if (current !== generation) return;
    directions.value = list.directions;
    coverage.value = list.coverage_note || "";
    career.value = view;
  } catch (e) {
    if (current === generation) error.value = errorText(e);
  } finally {
    if (current === generation) loading.value = false;
  }
}
function changeSource(value: string) {
  source.value = value;
  setCareerSource(value);
  career.value = null;
  void load();
}
function open(item: CareerDirection) {
  uni.navigateTo({
    url: `/pages/direction/index?code=${encodeURIComponent(item.code)}&name=${encodeURIComponent(item.name)}`,
  });
}
function planJob(job: CareerJob) {
  openCareerChat(
    `我想对照这个岗位规划下一步：\n岗位：${job.title}\n公司：${job.company}\n要求：${job.description}\n请结合我的已确认画像，说明已有证据和待补充的能力，不要虚构经历。`,
    source.value,
  );
}
</script>
<style lang="scss">
.direction-search {
  display: flex;
  gap: 12rpx;
  align-items: center;
  padding: 8rpx 14rpx 8rpx 24rpx;
  background: var(--qs-paper);
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-control;
}
.direction-search input {
  flex: 1;
  min-width: 0;
  font-size: 25rpx;
}
.direction-option,
.saved-job {
  padding: 26rpx;
  margin-bottom: 22rpx;
}
.direction-option > view:first-child {
  display: flex;
  justify-content: space-between;
  @include qs-ui-type($qs-type-section);
}
.direction-tags {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
  margin-top: 18rpx;
}
.direction-tags > text {
  padding: 6rpx 13rpx;
  border-radius: $qs-radius-inset;
  background: var(--qs-primary-soft);
  font-size: 22rpx;
  color: var(--qs-muted);
}
.saved-job > text:first-child {
  font-size: 29rpx;
}
.saved-plan {
  display: block;
  font-size: 24rpx;
  color: #8064af;
  margin-top: 18rpx;
}
</style>
