<!-- 青穗集 · 任务详情：真实状态、授权和成果，不生成虚构的耗时或百分比。 -->
<template>
  <view :class="pageMotionClass" class="qs-page">
    <view v-if="loading && !task" class="qs-state">正在读取任务…</view>
    <view v-if="error" class="qs-error">
      {{ error }}
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 1); load()">重试</button>
    </view>
    <template v-if="task">
      <view class="qs-card task-summary qs-motion-block">
        <text class="qs-detail-title">{{ task.title }}</text>
        <TaskStatus :status="task.status" />
        <text class="qs-inline-note">
          {{ sourceLabel(task.conversation, devices) }}
        </text>
      </view>
      <view v-if="task.input" class="qs-card career-section qs-motion-block"><text class="career-title">任务要求</text><text class="career-body">{{ task.input }}</text></view>
      <view class="task-facts">
        <view>
          <text>创建时间</text>
          <text>{{ formatTime(task.created_at, true) }}</text>
        </view>
        <view>
          <text>最近更新</text>
          <text>{{ formatTime(task.updated_at, true) }}</text>
        </view>
        <view v-if="task.cancel_requested">
          <text>停止请求</text>
          <text>已发送，正在等待执行端响应</text>
        </view>
      </view>
      <text class="qs-section-title">执行进展</text>
      <view class="timeline qs-card qs-motion-block">
        <view>
          <text class="timeline-dot">✓</text>
          <view>
            <text>任务已创建</text>
            <text class="qs-row-note">
              {{ formatTime(task.created_at, true) }}
            </text>
          </view>
        </view>
        <view>
          <text
            class="timeline-dot"
            :class="activeStatus(task.status) ? 'timeline-dot--active' : ''"
          >
            {{ task.status === "completed" ? "✓" : "·" }}
          </text>
          <view>
            <text>{{ taskLabels[task.status] }}</text>
            <text v-if="task.status === 'waiting_pc'" class="qs-row-note">
              电脑上线并开启远程任务后继续执行。
            </text>
            <text v-if="task.error" class="qs-row-note">{{ task.error }}</text>
          </view>
        </view>
      </view>
      <view
        v-for="approval in approvals"
        :key="approval.id"
        class="task-approval"
      >
        <text>{{ approval.reason || "这一步需要你的确认" }}</text>
        <view v-if="task.controllable" class="approval-actions">
          <button :id="buttonRippleId(2, [approval.id])" :style="buttonRippleStyle(2, [approval.id])" @touchstart="startButtonRipple($event, 2, [approval.id], busy)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" :disabled="busy" @click="startButtonRipple($event, 2, [approval.id], busy); decide(approval.id, false)">
            拒绝
          </button>
          <button
            :id="buttonRippleId(3, [approval.id])"
            :style="buttonRippleStyle(3, [approval.id])"
            @touchstart="startButtonRipple($event, 3, [approval.id], busy)"
            hover-class="button-hover"
            hover-stop-propagation
            :hover-start-time="0"
            :hover-stay-time="110"
            class="qs-button--primary qs-tap-target"
            :disabled="busy"
            @click="startButtonRipple($event, 3, [approval.id], busy); decide(approval.id, true)"
          >
            允许
          </button>
        </view>
        <text v-else class="qs-inline-note">请回到电脑端确认。</text>
      </view>
      <view v-if="events.length" class="task-record qs-card qs-motion-block">
        <button :id="buttonRippleId(4)" :style="buttonRippleStyle(4)" @touchstart="startButtonRipple($event, 4)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 4); expanded = !expanded">
          执行记录
          <text>{{ expanded ? "⌃" : "⌄" }}</text>
        </button>
        <SizeReveal :open="expanded" :change-key="events.length">
          <text
            v-for="(event, index) in events"
            :key="index"
            class="record-line"
          >
            {{ eventLabel(event) }}
          </text>
        </SizeReveal>
      </view>
      <text v-if="files.length" class="qs-section-title">相关文件</text>
      <FileRow v-for="file in files" :key="file.id" :file="file" />
      <text
        v-if="files.length && files.some((f) => !f.run_id)"
        class="qs-inline-note"
      >
        文件来自这段会话，部分同步文件尚未标注具体任务。
      </text>
      <button
        :id="buttonRippleId(5)"
        :style="buttonRippleStyle(5)"
        @touchstart="startButtonRipple($event, 5)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="task.status === 'waiting_pc'"
        class="qs-button qs-bottom-action qs-tap-target"
        @click="startButtonRipple($event, 5); devicesPage()"
      >
        查看电脑状态
      </button>
      <button
        :id="buttonRippleId(6)"
        :style="buttonRippleStyle(6)"
        @touchstart="startButtonRipple($event, 6, undefined, busy || task.cancel_requested)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="activeStatus(task.status) && task.controllable"
        class="qs-button qs-bottom-action qs-tap-target"
        :disabled="busy || task.cancel_requested"
        @click="startButtonRipple($event, 6, undefined, busy || task.cancel_requested); stop()"
      >
        {{ task.cancel_requested ? "停止请求已发送" : "停止任务" }}
      </button>
      <button
        :id="buttonRippleId(7)"
        :style="buttonRippleStyle(7)"
        @touchstart="startButtonRipple($event, 7, undefined, busy || retryBlocked)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="
          ['failed', 'interrupted'].includes(task.status) && task.controllable
        "
        class="qs-button qs-bottom-action qs-tap-target"
        :disabled="busy || retryBlocked"
        @click="startButtonRipple($event, 7, undefined, busy || retryBlocked); retry()"
      >
        重试任务
      </button>
      <button
        :id="buttonRippleId(8)"
        :style="buttonRippleStyle(8)"
        @touchstart="startButtonRipple($event, 8)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-button qs-button--primary qs-bottom-action qs-tap-target"
        @click="startButtonRipple($event, 8); openConversation(task.session_id)"
      >
        回到对话
      </button>
    </template>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { computed, ref } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import {
  agentApi,
  hubApi,
  hasToken,
  goToAuth,
  newRequestId,
  type AgentSnapshot,
  type HubDevice,
} from "../../services/api";
import {
  tasksFromSnapshot,
  taskEvents,
  eventLabel,
  sourceLabel,
  formatTime,
  taskLabels,
  activeStatus,
  errorText,
  type TaskItem,
} from "../../services/workspace";
import { openConversation } from "../../services/conversations";
import TaskStatus from "../../components/TaskStatus.vue";
import FileRow from "../../components/FileRow.vue";
import SizeReveal from "../../components/SizeReveal.vue";
const pageMotionClass = usePageMotion();
const snapshot = ref<AgentSnapshot | null>(null),
  task = ref<TaskItem | null>(null),
  devices = ref<HubDevice[]>([]),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  expanded = ref(false);
let session = "",
  taskId = "",
  visible = false,
  timer: ReturnType<typeof setTimeout> | undefined;
let retryId = "";
const events = computed(() =>
  snapshot.value ? taskEvents(snapshot.value, task.value) : [],
);
const files = computed(
  () =>
    snapshot.value?.files?.filter(
      (f) =>
        f.kind === "output" &&
        (!f.run_id || f.run_id === task.value?.local_run_id),
    ) ?? [],
);
const approvals = computed(
  () =>
    snapshot.value?.approvals?.filter(
      (a) => a.status === "pending" && a.run_id === task.value?.local_run_id,
    ) ?? [],
);
const retryBlocked = computed(() =>
  snapshot.value
    ? tasksFromSnapshot(snapshot.value).some((t) => activeStatus(t.status))
    : false,
);
onLoad((options) => {
  session = options?.session || "";
  taskId = options?.id || "";
});
onShow(() => {
  visible = true;
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void hubApi
    .devices()
    .then((d) => {
      devices.value = d;
    })
    .catch(() => undefined);
  void load();
});
onHide(cleanup);
onUnload(cleanup);
function cleanup() {
  visible = false;
  if (timer) clearTimeout(timer);
}
async function load() {
  if (loading.value || !session) return;
  if (timer) clearTimeout(timer);
  loading.value = true;
  try {
    const value = await agentApi.snapshot(session);
    snapshot.value = value;
    task.value = tasksFromSnapshot(value).find((t) => t.id === taskId) ?? null;
    if (!task.value) throw new Error("这项任务不存在或已被删除。");
    error.value = "";
    if (visible && activeStatus(task.value.status))
      timer = setTimeout(load, 1800);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}
async function operate(fn: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
async function decide(id: string, approved: boolean) {
  if (task.value?.controllable)
    await operate(() => hubApi.approve(taskId, id, approved));
}
async function stop() {
  await operate(() => hubApi.cancel(taskId));
}
async function retry() {
  if (!task.value || !task.value.controllable || retryBlocked.value) return;
  retryId = retryId || newRequestId();
  const result = await (async () => {
    busy.value = true;
    try {
      const run = await agentApi.run(session, task.value!.input, "", retryId);
      taskId = run.id;
      retryId = "";
      await load();
      return true;
    } catch (e) {
      error.value = errorText(e);
      return false;
    } finally {
      busy.value = false;
    }
  })();
  if (result) expanded.value = false;
}
function devicesPage() {
  uni.navigateTo({ url: "/pages/devices/index" });
}
</script>
<style lang="scss">
.task-summary {
  padding: 28rpx;
}
.task-facts {
  padding: 20rpx 4rpx;
}
.task-facts > view {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  padding: 14rpx 0;
  font-size: 25rpx;
  line-height: 1.6;
}
.task-facts > view > text:first-child {
  color: var(--qs-muted);
  flex: none;
}
.task-facts > view > text:last-child {
  text-align: right;
}
.timeline {
  padding: 28rpx;
}
.timeline > view {
  display: flex;
  gap: 22rpx;
  padding: 14rpx 0 25rpx;
  font-size: 27rpx;
}
.timeline-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 38rpx;
  height: 38rpx;
  border: 2rpx solid #a0b5a1;
  border-radius: 50%;
  color: #638d74;
}
.timeline-dot--active {
  background: var(--qs-primary-soft);
  border-color: #a28ac6;
  animation: qs-pulse 1.6s infinite;
}
.task-approval {
  margin-top: 24rpx;
  padding: 25rpx;
  background: var(--qs-warn-soft);
  border: 1rpx solid #e6d2ad;
  border-radius: 18rpx;
  font-size: 27rpx;
  line-height: 1.7;
}
.approval-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
}
.approval-actions button {
  flex: 1;
  font-size: 25rpx;
}
.task-record {
  margin-top: 24rpx;
  padding: 10rpx 24rpx;
}
.task-record > button {
  display: flex;
  justify-content: space-between;
  background: transparent;
  color: var(--qs-muted);
  font-size: 25rpx;
  padding: 16rpx 0;
}
.record-line {
  display: block;
  font-size: 23rpx;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.7;
  margin-bottom: 16rpx;
}
</style>
