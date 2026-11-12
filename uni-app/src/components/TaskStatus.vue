<!-- 青穗集 · 真实任务状态图标，只有执行中的任务使用循环动效。 -->
<template>
  <view class="task-status" :class="`task-status--${status}`">
    <image
      v-if="!textOnly"
      :key="status"
      class="task-status-icon"
      :src="icon"
      :class="[
        status === 'running' ? 'qs-spin' : '',
        status === 'completed' ? 'task-status-icon--done' : '',
      ]"
      mode="aspectFit"
    />
    <text :key="status" class="task-status-label">
      {{ taskLabels[status] }}
    </text>
    <ActivityDots
      v-if="status === 'queued' || status === 'running'"
      :label="taskLabels[status]"
    />
  </view>
</template>
<script setup lang="ts">
import { computed } from "vue";
import ActivityDots from "./ActivityDots.vue";
import type { RunStatus } from "../services/api";
import { taskLabels } from "../services/workspace";
import { assetPaths } from "../static/assets";
const props = defineProps<{ status: RunStatus; textOnly?: boolean }>();
const icon = computed(() =>
  props.status === "running"
    ? assetPaths.prototype.running
    : props.status === "completed"
      ? assetPaths.prototype.checkCircle
      : props.status === "waiting_pc"
        ? assetPaths.prototype.hourglass
        : props.status === "failed" || props.status === "interrupted"
          ? assetPaths.icons.pendingWarning
          : assetPaths.prototype.clock,
);
</script>
<style lang="scss">
.task-status {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: var(--qs-muted);
  font-size: 24rpx;
}
.task-status-icon {
  width: 34rpx;
  height: 34rpx;
}
.task-status-label {
  animation: qs-soft-in 0.2s ease backwards;
}
.task-status-icon--done {
  animation: qs-check-in 0.32s ease backwards;
}
@media (prefers-reduced-motion: reduce) {
  .task-status-label,
  .task-status-icon--done {
    animation: none;
  }
}
.task-status--running {
  color: #8064af;
}
.task-status--completed {
  color: #638d74;
}
.task-status--awaiting_approval,
.task-status--waiting_input {
  color: #a37b3c;
}
.task-status--failed,
.task-status--interrupted {
  color: #ad5266;
}
</style>
