<!-- 青穗集 · 记录核对：展示真实草稿、过期状态与确认操作。 -->
<template>
  <view class="career-proposal qs-card qs-motion-block">
    <text class="career-proposal-title">{{ proposal.title }}</text>
    <view
      v-for="(row, index) in proposalRows(proposal)"
      :key="index"
      class="career-proposal-row"
    >
      <text class="career-proposal-label">{{ row.label }}</text>
      <text class="career-proposal-value">{{ row.value }}</text>
    </view>
    <text v-if="proposal.stale" class="qs-inline-note">
      {{ proposal.stale_reason || "依据已经变化，请让穗奈重新核对。" }}
    </text>
    <view class="career-proposal-actions">
      <button
        :id="buttonRippleId(1)"
        :style="buttonRippleStyle(1)"
        @touchstart="startButtonRipple($event, 1, undefined, busy)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="source === 'cloud'"
        class="career-proposal-action qs-tap-target"
        :class="busy ? 'career-proposal-action--disabled' : ''"
        :disabled="busy"
        @click="startButtonRipple($event, 1, undefined, busy); $emit('decide', proposal, false)"
      >
        忽略
      </button>
      <button
        :id="buttonRippleId(2)"
        :style="buttonRippleStyle(2)"
        @touchstart="startButtonRipple($event, 2, undefined, busy)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="career-proposal-action career-proposal-action--primary qs-tap-target"
        :class="busy ? 'career-proposal-action--disabled' : ''"
        :disabled="busy"
        @click="startButtonRipple($event, 2, undefined, busy); $emit('decide', proposal, true)"
      >
        {{
          proposal.stale
            ? "重新核对"
            : source === "cloud"
              ? "确认记录"
              : "去电脑对话核对"
        }}
      </button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import type { CareerProposal } from "../services/api";
import { proposalRows } from "../services/career-records";
defineProps<{ proposal: CareerProposal; source: string; busy: boolean }>();
defineEmits<{
  (e: "decide", proposal: CareerProposal, approved: boolean): void;
}>();
</script>
<style lang="scss">
.career-proposal {
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.career-proposal-title {
  display: block;
  @include qs-ui-type($qs-type-section);
  line-height: 1.5;
  margin-bottom: 22rpx;
}
.career-proposal-row {
  margin: 18rpx 0;
}
.career-proposal-label {
  display: block;
  font-size: 24rpx;
  color: var(--qs-muted);
  margin-bottom: 8rpx;
}
.career-proposal-value {
  display: block;
  font-size: 27rpx;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.career-proposal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 20rpx;
  margin-top: 26rpx;
}
.career-proposal-action {
  margin: 0;
  background: var(--qs-paper-soft);
  color: var(--qs-ink);
  font-size: 26rpx;
  padding: 14rpx 24rpx;
  line-height: 1.5;
  border-radius: $qs-radius-control;
}
.career-proposal-action--primary {
  background: var(--qs-primary-soft);
  color: #665180;
}
.career-proposal-action--disabled {
  opacity: 0.5;
}
</style>
