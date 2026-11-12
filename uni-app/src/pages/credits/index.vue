<!-- 青穗集 · 官方积分明细：余额与规则来自统一账号接口，支持游标加载更多。 -->
<template>
  <view :class="pageMotionClass" class="qs-page">
    <view v-if="error" class="qs-error">
      {{ error }}
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 1); load(false)">重试</button>
    </view>
    <view v-if="!data && !error" class="qs-state">正在读取积分…</view>
    <template v-if="data">
      <view class="credits-summary qs-card qs-motion-block">
        <image :src="assets.star" />
        <text class="credits-remaining">
          {{ format(data.summary.remaining_points) }}
        </text>
        <text>剩余积分</text>
        <text class="qs-row-note">
          每日 {{ format(data.summary.daily_points) }} · 北京时间零点刷新
        </text>
        <text v-if="data.summary.reserved_points" class="qs-row-note">
          当前任务已预留 {{ format(data.summary.reserved_points) }} 积分
        </text>
      </view>
      <text class="qs-inline-note">
        官方账号各端共用额度，使用电脑自行配置的第三方 API Key 不消耗官方积分。
      </text>
      <text class="qs-section-title">用量明细</text>
      <view class="qs-card credit-entries qs-motion-block">
        <view v-for="entry in data.entries" :key="entry.id" class="credit-row">
          <view>
            <text>{{ entry.capability }}</text>
            <text class="qs-row-note">
              {{ formatTime(entry.created_at, true) }}
            </text>
          </view>
          <view>
            <text>
              {{
                entry.state === "reserved"
                  ? format(entry.reserved_points)
                  : entry.points
                    ? "-" + format(entry.points)
                    : "0"
              }}
            </text>
            <text class="qs-row-note">{{ stateLabel(entry.state) }}</text>
          </view>
        </view>
        <view v-if="!data.entries.length" class="qs-state">还没有用量记录</view>
      </view>
      <button
        :id="buttonRippleId(2)"
        :style="buttonRippleStyle(2)"
        @touchstart="startButtonRipple($event, 2, undefined, loading)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        v-if="data.next_cursor"
        class="qs-button qs-bottom-action qs-tap-target"
        :disabled="loading"
        @click="startButtonRipple($event, 2, undefined, loading); load(true)"
      >
        查看更多
      </button>
    </template>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  accountApi,
  hasToken,
  goToAuth,
  type OfficialCredits,
} from "../../services/api";
import { formatTime, errorText } from "../../services/workspace";
import { assetPaths } from "../../static/assets";
const pageMotionClass = usePageMotion();
const assets = assetPaths.prototype,
  data = ref<OfficialCredits | null>(null),
  loading = ref(false),
  error = ref("");
onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void load(false);
});
async function load(more = false) {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const next = await accountApi.credits(
      more ? data.value?.next_cursor || undefined : undefined,
    );
    data.value =
      more && data.value
        ? { ...next, entries: [...data.value.entries, ...next.entries] }
        : next;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}
function format(n: number) {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
function stateLabel(state: string) {
  return (
    {
      reserved: "预留中",
      completed: "已结算",
      failed: "已释放",
      interrupted: "已释放",
      unmetered: "未计费",
    }[state] || state
  );
}
</script>
<style lang="scss">
.credits-summary {
  padding: 34rpx;
  text-align: center;
  background: var(--qs-primary-soft);
}
.credits-summary > image {
  width: 70rpx;
  height: 70rpx;
  margin: 0 auto 16rpx;
}
.credits-summary > text {
  display: block;
  font-size: 26rpx;
}
.credits-summary .credits-remaining {
  font-size: 68rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}
.credit-entries {
  padding: 0 25rpx;
}
.credit-row {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  padding: 25rpx 0;
  border-bottom: 1rpx solid var(--qs-lilac);
  font-size: 26rpx;
}
.credit-row:last-child {
  border: 0;
}
.credit-row > view:last-child {
  text-align: right;
  flex: none;
}
</style>
