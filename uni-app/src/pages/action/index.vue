<!-- 青穗集 · 成长行动详情：云端使用版本校验写入，电脑来源通过带上下文的对话更新。 -->
<template>
  <view :class="pageMotionClass" class="qs-page">
    <view v-if="error" class="qs-error">
      {{ error }}
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 1); load()">重试</button>
    </view>
    <view v-if="loading && !action" class="qs-state">正在读取行动…</view>
    <template v-if="action">
      <view class="qs-card action-summary qs-motion-block">
        <text class="qs-detail-title">{{ action.title }}</text>
        <text class="action-state">{{ labels[action.status] }}</text>
      </view>
      <view
        v-for="section in sections"
        :key="section.title"
        class="action-section qs-motion-block"
      >
        <text class="qs-section-title">{{ section.title }}</text>
        <view class="qs-card qs-content">
          {{ section.text || "可以和穗奈继续拆解这一步。" }}
        </view>
      </view>
      <text class="qs-section-title">记录进展</text>
      <textarea
        v-model="result"
        class="action-result"
        maxlength="6000"
        placeholder="做了什么、遇到什么困难，或留下成果链接…"
      />
      <text v-if="source !== 'cloud'" class="qs-inline-note">
        这项行动保存在电脑上，更新内容会带入对应来源的对话，由你确认后发送。
      </text>
      <view class="action-statuses">
        <button
          :id="buttonRippleId(2, [status])"
          :style="buttonRippleStyle(2, [status])"
          @touchstart="startButtonRipple($event, 2, [status], busy)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="qs-tap-target"
          v-for="(label, status) in labels"
          :key="status"
          :class="action.status === status ? 'selected' : ''"
          :disabled="busy"
          @click="startButtonRipple($event, 2, [status], busy); update(status)"
        >
          {{
            status === "todo"
              ? "设为待开始"
              : status === "doing"
                ? "开始 / 更新进展"
                : "记录完成"
          }}
        </button>
      </view>
      <button
        :id="buttonRippleId(3)"
        :style="buttonRippleStyle(3)"
        @touchstart="startButtonRipple($event, 3)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-button qs-button--primary qs-bottom-action qs-tap-target"
        @click="startButtonRipple($event, 3); ask()"
      >
        请穗奈帮我拆解
      </button>
    </template>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import {
  careerApi,
  hasToken,
  goToAuth,
  type CareerView,
} from "../../services/api";
import { careerSource, openCareerChat } from "../../services/career-context";
import { errorText } from "../../services/workspace";
const pageMotionClass = usePageMotion();
const career = ref<CareerView | null>(null),
  source = ref(careerSource()),
  result = ref(""),
  error = ref(""),
  loading = ref(false),
  busy = ref(false);
let id = "";
const labels = { todo: "待开始", doing: "进行中", done: "已完成" };
const action = computed(() => career.value?.actions.find((a) => a.id === id));
const sections = computed(() =>
  action.value
    ? [
        { title: "为什么是这一步", text: action.value.why },
        { title: "要学什么", text: action.value.learn },
        { title: "交付什么", text: action.value.deliverable },
      ]
    : [],
);
onLoad((options) => {
  id = options?.id || "";
});
onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void load();
});
async function load() {
  loading.value = true;
  error.value = "";
  try {
    career.value = await careerApi.view(source.value);
    if (!action.value) throw new Error("这项行动不存在或已被更新。");
    result.value = action.value.result;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}
async function update(status: keyof typeof labels) {
  if (!action.value || !career.value || busy.value) return;
  if (source.value !== "cloud") {
    openCareerChat(
      `请更新我的成长行动“${action.value.title}”：状态为${labels[status]}。\n进展与成果：${result.value || "尚未补充"}\n请保留我的真实表述，并和我核对需要记录的结果。`,
      source.value,
    );
    return;
  }
  if (status === "done") {
    const ok = await new Promise<boolean>((resolve) =>
      uni.showModal({
        title: "记录为已完成？",
        content: action.value!.title,
        confirmText: "记录完成",
        success: (r) => resolve(r.confirm),
        fail: () => resolve(false),
      }),
    );
    if (!ok) return;
  }
  busy.value = true;
  try {
    career.value = await careerApi.change(career.value.revision, {
      type: "action.update",
      id,
      status,
      result: result.value,
    });
    uni.showToast({ title: "进展已记录", icon: "none" });
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
function ask() {
  if (action.value)
    openCareerChat(
      `请帮我进一步拆解这项行动：${action.value.title}\n原因：${action.value.why}\n学习内容：${action.value.learn}\n交付物：${action.value.deliverable}\n我的进展：${result.value || "还没开始"}\n请给我下一步能实际动手的建议。`,
      source.value,
    );
}
</script>
<style lang="scss">
.action-summary {
  padding: 28rpx;
  background: var(--qs-primary-soft);
}
.action-state {
  font-size: 25rpx;
  color: #8064af;
}
.action-result {
  width: 100%;
  min-height: 220rpx;
  padding: 24rpx;
  border: 1rpx solid var(--qs-lilac);
  border-radius: 18rpx;
  background: var(--qs-paper);
  font-size: 27rpx;
  line-height: 1.8;
  box-sizing: border-box;
}
.action-statuses {
  display: flex;
  gap: 14rpx;
  margin-top: 22rpx;
}
.action-statuses > button {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 18rpx 8rpx;
  border: 1rpx solid var(--qs-lilac);
  border-radius: 14rpx;
  background: var(--qs-paper);
  color: var(--qs-muted);
  font-size: 23rpx;
  line-height: 1.6;
}
.action-statuses > .selected {
  background: var(--qs-primary-soft);
  border-color: #a28ac6;
  color: #8064af;
}
</style>
