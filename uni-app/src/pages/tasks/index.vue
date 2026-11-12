<!-- 青穗集 · 任务首页：统一像素字形、卡片入场与背景点阵位移，保留原业务和同步边界。 -->
<template>
  <view @touchstart="startSurfaceRipple($event)" @click="startSurfaceRipple($event)" :class="pageMotionClass" class="qs-page qs-page--tab task-page">
    <DotBackground :ripples="surfaceRipples" />
    <!-- #ifdef MP-WEIXIN -->
    <view
      class="qs-page-frame"
      :style="pageFrameReady ? 'display: none;' : ''"
      aria-hidden="true"
    >
      <text class="qs-page-frame-title">任务</text>
      <view class="qs-page-frame-card" />
      <view class="qs-page-frame-line" />
      <view class="qs-page-frame-line qs-page-frame-line--short" />
    </view>
    <!-- #endif -->
    <AppHeader title="任务">
      <button
        :id="buttonRippleId(1)"
        :style="buttonRippleStyle(1)"
        @touchstart="startButtonRipple($event, 1, undefined, overview.busy)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-icon-button qs-tap-target"
        aria-label="刷新任务"
        :disabled="overview.busy"
        @click="startButtonRipple($event, 1, undefined, overview.busy); refresh(true)"
      >
        <image
          :src="assetPaths.icons.sync"
          :class="overview.busy ? 'qs-spin' : ''"
        />
      </button>
    </AppHeader>
    <MotionTabs v-model="tab" :options="filters" label="任务状态" />
    <picker
      :range="sources.map((s) => s.name)"
      :value="sourceIndex"
      @change="sourceIndex = Number(($event as any).detail.value)"
    >
      <view hover-class="qs-pressed" :hover-start-time="0" :hover-stay-time="110" class="qs-source-select qs-press">
        {{ sources[sourceIndex]?.name || "全部位置" }} ⌄
      </view>
    </picker>
    <view v-if="overview.error" class="qs-error">
      {{ overview.error }}
      <button :id="buttonRippleId(2)" :style="buttonRippleStyle(2)" @touchstart="startButtonRipple($event, 2)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 2); refresh(true)">重试</button>
    </view>
    <view v-if="overview.partialError" class="qs-error">
      {{ overview.partialError }}
      <button :id="buttonRippleId(3)" :style="buttonRippleStyle(3)" @touchstart="startButtonRipple($event, 3)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 3); refresh(true)">重试同步</button>
    </view>
    <view
      v-if="overview.busy && !overview.ready"
      class="overview-sync"
      role="status"
    >
      <view class="overview-sync-dot" />
      <text>
        {{
          overview.total
            ? "正在检查会话 " + overview.scanned + " / " + overview.total
            : "正在同步…"
        }}
      </text>
    </view>
    <LoadingSkeleton v-if="overview.busy && !overview.ready" />
    <view v-else-if="!filtered.length" class="qs-state qs-motion-block">
      <image :src="assets.navTasks" />
      <text>
        {{
          overview.busy
            ? "正在同步任务…"
            : !overview.complete
              ? "同步未完成，暂时无法确认是否还有任务"
              : tab === "attention"
                ? "目前没有需要你处理的任务"
                : "这里会留下穗奈为你做过的事。"
        }}
      </text>
    </view>
    <view class="task-list">
      <view
        :hover-start-time="0"
        v-for="(task, index) in filtered"
        :key="task.session_id + ':' + task.id"
        class="task-card qs-card qs-press"
        :class="index < 6 ? 'qs-motion-block' : ''"
        :style="{ '--qs-enter-delay': Math.min(index, 3) * 28 + 'ms' }"
        hover-class="qs-pressed"
        :hover-stay-time="120"
        @click="open(task)"
      >
        <view class="task-card-main">
          <image
            class="task-main-icon qs-action-icon"
            :src="
              task.status === 'running'
                ? assets.running
                : task.status === 'completed'
                  ? assets.checkCircle
                  : task.status === 'waiting_pc'
                    ? assets.hourglass
                    : assets.clock
            "
            :class="task.status === 'running' ? 'qs-spin' : ''"
            mode="aspectFit"
          />
          <view>
            <text class="task-title qs-clamp">{{ task.title }}</text>
            <TaskStatus :status="task.status" text-only />
            <text v-if="task.error" class="task-error qs-clamp">
              {{ task.error }}
            </text>
          </view>
          <text class="qs-chevron">›</text>
        </view>
        <view class="task-meta">
          <text>{{ sourceLabel(task.conversation, overview.devices) }}</text>
          <text>{{ formatTime(task.updated_at) }}</text>
        </view>
        <text v-if="outputCount(task)" class="task-files">
          {{ outputCount(task) }} 个相关文件
        </text>
      </view>
    </view>

    <view class="qs-dock">
      <button
        :id="buttonRippleId(4)"
        :style="buttonRippleStyle(4)"
        @touchstart="startButtonRipple($event, 4)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-button qs-button--primary qs-bottom-action qs-tap-target"
        @click="startButtonRipple($event, 4); sourceOpen = true"
      >
        <image :src="assets.plus" />
        交代一件事
      </button>
    </view>
    <RemoteDevices
      v-if="sourceOpen"
      @close="sourceOpen = false"
      @created="created"
    />
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
import { computed, ref } from "vue";
import { onShow, onHide, onPullDownRefresh } from "@dcloudio/uni-app";
import { hasToken, goToAuth, type Conversation } from "../../services/api";
import { overview, loadOverview } from "../../services/overview";
import {
  tasksFromSnapshot,
  attentionStatus,
  activeStatus,
  sourceLabel,
  formatTime,
  type TaskItem,
} from "../../services/workspace";
import { openConversation } from "../../services/conversations";
import { syncTabBarHighlight } from "../../services/tabbar";
import { assetPaths } from "../../static/assets";
import TaskStatus from "../../components/TaskStatus.vue";
import RemoteDevices from "../../components/RemoteDevices.vue";
import AppHeader from "../../components/AppHeader.vue";
import MotionTabs from "../../components/MotionTabs.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
import { consumeTaskTab } from "../../services/task-navigation";
const pageMotionClass = usePageMotion();
const pageFrameReady = useTabPageFrame();
const assets = assetPaths.prototype,
  tab = ref("active"),
  sourceIndex = ref(0),
  sourceOpen = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let visible = false,
  refreshGeneration = 0;
const filters = [
  { key: "active", text: "进行中" },
  { key: "attention", text: "待确认" },
  { key: "ended", text: "已结束" },
];
const sources = computed(() => [
  { id: "all", name: "全部位置" },
  { id: "cloud", name: "云端" },
  ...overview.devices
    .filter((d) => d.status === "active")
    .map((d) => ({ id: d.id, name: d.name })),
]);
const tasks = computed(() =>
  Object.values(overview.snapshots)
    .flatMap(tasksFromSnapshot)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
);
const filtered = computed(() =>
  tasks.value.filter(
    (t) =>
      (tab.value === "attention"
        ? attentionStatus(t.status)
        : tab.value === "active"
          ? activeStatus(t.status) && !attentionStatus(t.status)
          : !activeStatus(t.status) && !attentionStatus(t.status)) &&
      (sourceIndex.value === 0 ||
        (sources.value[sourceIndex.value]?.id === "cloud"
          ? t.conversation.target === "cloud"
          : t.conversation.device_id === sources.value[sourceIndex.value]?.id)),
  ),
);
onShow(() => {
  visible = true;
  const selectedTab = consumeTaskTab();
  if (selectedTab) tab.value = selectedTab;
  syncTabBarHighlight();
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void refresh();
});
onHide(() => {
  visible = false;
  refreshGeneration++;
  if (timer) clearTimeout(timer);
  sourceOpen.value = false;
});
onPullDownRefresh(async () => {
  try {
    await refresh(true);
  } finally {
    uni.stopPullDownRefresh();
  }
});
async function refresh(force = false) {
  const current = ++refreshGeneration;
  if (timer) clearTimeout(timer);
  await loadOverview(true, force);
  if (visible && current === refreshGeneration)
    timer = setTimeout(
      () => refresh(),
      tasks.value.some((t) => activeStatus(t.status)) ? 6000 : 30000,
    );
}
function open(task: TaskItem) {
  uni.navigateTo({
    url: `/pages/task/index?session=${task.session_id}&id=${task.id}`,
  });
}
function created(item: Conversation) {
  sourceOpen.value = false;
  openConversation(item.id);
}
function outputCount(task: TaskItem) {
  const files = overview.snapshots[task.session_id]?.files ?? [];
  return files.filter(
    (f) =>
      f.kind === "output" &&
      (f.run_id
        ? f.run_id === task.local_run_id
        : f.created_at >= task.created_at && f.created_at <= task.updated_at),
  ).length;
}
</script>
<style lang="scss">
.task-card {
  padding: 28rpx;
  margin-bottom: 22rpx;
  border-radius: $qs-radius-card;
  background: var(--qs-paper);
}
.task-card-main {
  display: flex;
  align-items: center;
  gap: 24rpx;
}
.task-main-icon {
  flex: none;
  width: 54rpx;
  height: 54rpx;
}
.task-card-main > view {
  flex: 1;
  min-width: 0;
}
.task-title {
  font-family: $qingsui-font;
  font-size: $qs-type-body;
  font-weight:400;
  line-height: 1.6;
  margin-bottom: 10rpx;
  color: #40374f;
}
.task-meta {
  display: flex;
  justify-content: space-between;
  gap: 18rpx;
  margin: 20rpx 0 0 78rpx;
  font-size: 24rpx;
  color: var(--qs-muted);
  line-height: 1.4;
}
.task-meta > text:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-meta > text:last-child {
  flex: none;
}
.task-error {
  font-size: 23rpx;
  color: #ad5266;
  margin-top: 10rpx;
  line-height: 1.5;
}
.task-files {
  display: block;
  margin: 12rpx 0 0 78rpx;
  color: var(--qs-muted);
  font-size: 24rpx;
}
</style>
