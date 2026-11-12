<!-- 青穗集 · 对话与成长衔接：按执行来源读取待确认记录，用户核对后再保存。 -->
<template>
  <view class="career-bridge">
    <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="career-bridge-entry qs-tap-target" @click="startButtonRipple($event, 1); openReview()">
      <image class="career-bridge-icon" :src="assets.navGrowth" />
      <text class="career-bridge-label">
        {{ pending.length ? pending.length + " 项成长记录待确认" : "成长记录" }}
      </text>
      <text class="qs-chevron">›</text>
    </button>
    <MotionSheet :open="opened" label="成长记录" @close="opened = false">
      <view class="career-review-sheet">
        <view class="qs-sheet-title">
          <text>{{ sourceLabel }} · 成长记录</text>
          <button
            :id="buttonRippleId(2)"
            :style="buttonRippleStyle(2)"
            @touchstart="startButtonRipple($event, 2)"
            hover-class="button-hover"
            hover-stop-propagation
            :hover-start-time="0"
            :hover-stay-time="110"
            class="qs-icon-button qs-tap-target"
            aria-label="关闭成长记录"
            @click="startButtonRipple($event, 2); opened = false"
          >
            ×
          </button>
        </view>
        <scroll-view
          scroll-y
          class="career-review-scroll"
          :class="
            !pending.length && !loading ? 'career-review-scroll--compact' : ''
          "
        >
          <view v-if="error" class="qs-error">
            {{ error }}
            <button :id="buttonRippleId(3)" :style="buttonRippleStyle(3)" @touchstart="startButtonRipple($event, 3)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 3); refresh()">重试</button>
          </view>
          <LoadingSkeleton v-if="loading && !career" :rows="2" />
          <template v-if="career">
            <text v-if="pending.length" class="qs-inline-note">
              本位置的待确认草稿，核对后才会进入正式记录。
            </text>
            <CareerProposalCard
              v-for="proposal in pending"
              :key="proposal.id"
              :proposal="proposal"
              :source="source"
              :busy="busy"
              @decide="decide"
            />
            <view v-if="!pending.length" class="career-record-state qs-reveal">
              <view
                v-if="confirmed"
                class="qs-confirm-check"
                aria-label="已保存"
              >
                ✓
              </view>
              <text>
                {{
                  confirmed ? "已保存，继续下一步吧。" : "还没有待确认的整理。"
                }}
              </text>
              <button :id="buttonRippleId(4)" :style="buttonRippleStyle(4)" @touchstart="startButtonRipple($event, 4)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-button qs-tap-target" @click="startButtonRipple($event, 4); organize()">
                请穗奈整理这段对话
              </button>
            </view>
            <CareerNextSteps :source="source" />
          </template>
        </scroll-view>
      </view>
    </MotionSheet>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { computed, ref, watch } from "vue";
import {
  careerApi,
  getToken,
  type CareerView,
  type CareerProposal,
} from "../services/api";
import { pendingProposals, proposalRows } from "../services/career-records";
import { errorText } from "../services/workspace";
import { assetPaths } from "../static/assets";
import CareerProposalCard from "./CareerProposalCard.vue";
import CareerNextSteps from "./CareerNextSteps.vue";
import MotionSheet from "./MotionSheet.vue";
import LoadingSkeleton from "./LoadingSkeleton.vue";
const props = defineProps<{ source: string; sourceLabel: string }>();
const emit = defineEmits<{ (e: "draft", text: string): void }>();
const assets = assetPaths.prototype,
  career = ref<CareerView | null>(null),
  opened = ref(false),
  loading = ref(false),
  busy = ref(false),
  confirmed = ref(false),
  error = ref("");
const pending = computed(() => pendingProposals(career.value));
let generation = 0;
watch(
  () => props.source,
  () => {
    career.value = null;
    confirmed.value = false;
    void refresh();
  },
  { immediate: true },
);
async function refresh() {
  if (busy.value) return;
  const current = ++generation,
    source = props.source,
    owner = getToken();
  loading.value = true;
  error.value = "";
  try {
    const next = await careerApi.view(source);
    if (current === generation && owner === getToken()) career.value = next;
  } catch (e) {
    if (current === generation) error.value = errorText(e);
  } finally {
    if (current === generation) loading.value = false;
  }
}
function openReview() {
  opened.value = true;
  void refresh();
}
function organize() {
  opened.value = false;
  emit(
    "draft",
    "请整理这段对话里与我的经历、技能、职业目标或下一步有关的信息，调用职业记录工具生成待确认草稿。仅引用我实际说过的事实，缺失的信息先问我，不要直接当作已确认内容。",
  );
}
async function decide(proposal: CareerProposal, approved: boolean) {
  if (busy.value || !career.value) return;
  if (props.source !== "cloud" || proposal.stale) {
    opened.value = false;
    emit(
      "draft",
      "请和我核对这项电脑端建议（编号：" +
        proposal.id +
        "）：" +
        proposal.title +
        "\n" +
        proposalRows(proposal)
          .map((r) => r.label + "：" + r.value)
          .join("\n") +
        "\n核对后再生成待确认记录。",
    );
    return;
  }
  const current = ++generation,
    owner = getToken();
  busy.value = true;
  error.value = "";
  try {
    const next = await careerApi.change(career.value.revision, {
      type: "proposal.decide",
      id: proposal.id,
      approved,
    });
    if (current !== generation || owner !== getToken()) return;
    career.value = next;
    confirmed.value = approved;
    if (approved) uni.showToast({ title: "已保存到成长记录", icon: "success" });
  } catch (e) {
    if (current === generation) {
      error.value = errorText(e);
      try {
        const next = await careerApi.view(props.source);
        if (current === generation && owner === getToken()) career.value = next;
      } catch {
        /* 保留错误以供重试。 */
      }
    }
  } finally {
    busy.value = false;
  }
}
defineExpose({ refresh });
</script>
<style lang="scss">
.career-bridge-entry {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 18rpx 8rpx;
  margin: 0;
  background: transparent;
  color: #6b5b83;
  font-size: 25rpx;
  line-height: 1.5;
  text-align: left;
}
.career-bridge-icon {
  width: 34rpx;
  height: 34rpx;
}
.career-bridge-label {
  flex: 1;
}
.career-review-sheet {
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}
.career-review-scroll {
  max-height: 65vh;
  height: 65vh;
}
.career-review-scroll--compact {
  height: auto;
}
.career-record-state {
  padding: 28rpx 0;
  font-size: 27rpx;
  color: var(--qs-muted);
}
.career-record-state .qs-button {
  margin-top: 26rpx;
}
</style>
