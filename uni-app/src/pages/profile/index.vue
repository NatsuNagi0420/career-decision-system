<!-- 青穗集 · 画像详情：分开显示已确认资料与待确认建议，写入遵守数据来源和版本。 -->
<template>
  <view :class="pageMotionClass" class="qs-page">
    <CareerSource @change="changeSource" />
    <view v-if="error" class="qs-error">
      {{ error }}
      <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" @touchstart="startButtonRipple($event, 1)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 1); load()">重试</button>
    </view>
    <view v-if="loading && !career" class="qs-state">正在读取画像…</view>
    <template v-if="career">
      <view class="profile-mark">
        <image :src="assetPaths.characters.suinaiAvatar" mode="aspectFit" />
        <view>
          <text>慢慢认识你</text>
          <text class="qs-row-note">
            {{
              career.profile.confirmed_at
                ? "内容来自你确认过的经历"
                : "先从一次自然对话开始"
            }}
          </text>
        </view>
      </view>
      <template v-if="pending.length">
        <text class="qs-section-title">等你确认</text>
        <CareerProposalCard
          v-for="proposal in pending"
          :key="proposal.id"
          :proposal="proposal"
          :source="source"
          :busy="busy"
          @decide="decide"
        />
      </template>
      <text class="qs-section-title">已确认资料</text>
      <view v-if="!facts.length" class="qs-state">
        <image :src="assets.navProfile" />
        <text>你说过并确认的经历，会慢慢在这里成形。</text>
      </view>
      <view v-else class="qs-card facts-list qs-motion-block">
        <view v-for="fact in facts" :key="fact.key" class="fact-row">
          <view>
            <text>{{ fact.label }}</text>
            <button
              :id="buttonRippleId(2, [fact.key])"
              :style="buttonRippleStyle(2, [fact.key])"
              @touchstart="startButtonRipple($event, 2, [fact.key])"
              hover-class="button-hover"
              hover-stop-propagation
              :hover-start-time="0"
              :hover-stay-time="110"
              class="qs-tap-target"
              aria-label="补充或纠正这项资料"
              @click="startButtonRipple($event, 2, [fact.key]); correct(fact.label, fact.value)"
            >
              ↗
            </button>
          </view>
          <text>{{ fact.value }}</text>
        </view>
      </view>
      <template v-if="career.skills?.length">
        <text class="qs-section-title">技能与依据</text>
        <view class="qs-card skills-list qs-motion-block">
          <view
            v-for="(skill, index) in career.skills"
            :key="skill.name"
            class="skill-row"
          >
            <button :id="buttonRippleId(3, [skill.name])" :style="buttonRippleStyle(3, [skill.name])" @touchstart="startButtonRipple($event, 3, [skill.name])" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 3, [skill.name]); expanded = expanded === index ? -1 : index">
              <text>{{ skill.name }}</text>
              <text>
                {{ stageLabel(skill.stage) }}
                {{ expanded === index ? "⌃" : "⌄" }}
              </text>
            </button>
            <view v-if="expanded === index">
              <text
                v-for="(evidence, i) in skill.evidence"
                :key="i"
                class="skill-evidence"
              >
                “{{ evidence.quote }}”
              </text>
              <text v-if="!skill.evidence.length" class="qs-inline-note">
                尚未记录引用依据。
              </text>
            </view>
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
        v-if="career.sources?.length"
        class="profile-sources qs-tap-target"
        @click="startButtonRipple($event, 4); sourcesOpen = !sourcesOpen"
      >
        {{ sourcesOpen ? "收起" : "查看" }}记录依据 ·
        {{ career.sources.length }}
      </button>
      <view v-if="sourcesOpen" class="qs-card qs-motion-block">
        <text v-for="item in career.sources" :key="item.id" class="source-text">
          {{ item.text }}
        </text>
      </view>
      <CareerNextSteps v-if="facts.length" :source="source" hide-profile />
      <button
        :id="buttonRippleId(5)"
        :style="buttonRippleStyle(5)"
        @touchstart="startButtonRipple($event, 5)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-button qs-button--primary qs-bottom-action qs-tap-target"
        @click="startButtonRipple($event, 5); supplement()"
      >
        继续和穗奈补充
      </button>
    </template>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { computed, ref } from "vue";
import { onShow, onPullDownRefresh } from "@dcloudio/uni-app";
import {
  careerApi,
  hasToken,
  goToAuth,
  type CareerView,
  type CareerProposal,
} from "../../services/api";
import {
  careerSource,
  setCareerSource,
  openCareerChat,
} from "../../services/career-context";
import { errorText } from "../../services/workspace";
import { assetPaths } from "../../static/assets";
import CareerSource from "../../components/CareerSource.vue";
import CareerProposalCard from "../../components/CareerProposalCard.vue";
import CareerNextSteps from "../../components/CareerNextSteps.vue";
import {
  profileLabels as labels,
  proposalRows,
  pendingProposals,
} from "../../services/career-records";
const pageMotionClass = usePageMotion();
const assets = assetPaths.prototype,
  career = ref<CareerView | null>(null),
  source = ref(careerSource()),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  expanded = ref(-1),
  sourcesOpen = ref(false);
let generation = 0;
const facts = computed(() =>
  career.value
    ? Object.entries(labels)
        .map(([key, label]) => ({
          key,
          label,
          value: String(
            career.value!.profile[key as keyof typeof career.value.profile] ||
              "",
          ),
        }))
        .filter((f) => f.value)
    : [],
);
const pending = computed(() => pendingProposals(career.value));
onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  source.value = careerSource();
  void load();
});
onPullDownRefresh(async () => {
  try {
    await load();
  } finally {
    uni.stopPullDownRefresh();
  }
});
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  try {
    const value = await careerApi.view(source.value);
    if (current === generation) career.value = value;
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
async function decide(proposal: CareerProposal, approved: boolean) {
  if (source.value !== "cloud" || proposal.stale) {
    openCareerChat(
      `请和我核对你整理的“${proposal.title}”建议，然后再记录到画像：\n${proposalRows(
        proposal,
      )
        .map((r) => `${r.label}：${r.value}`)
        .join("\n")}`,
      source.value,
    );
    return;
  }
  if (!career.value || busy.value) return;
  busy.value = true;
  try {
    career.value = await careerApi.change(career.value.revision, {
      type: "proposal.decide",
      id: proposal.id,
      approved,
    });
    uni.showToast({ title: approved ? "已确认记录" : "已忽略", icon: "none" });
  } catch (e) {
    const message = errorText(e);
    await load();
    error.value = message;
  } finally {
    busy.value = false;
  }
}
function correct(label: string, value: string) {
  openCareerChat(
    `我想补充或纠正画像里的“${label}”。目前记录是：${value}\n请先和我核对需要修改的内容。`,
    source.value,
  );
}
function supplement() {
  openCareerChat(
    "我想补充自己的经历和偏好，请结合目前的已确认画像，问我一个最需要澄清的问题。",
    source.value,
  );
}
function stageLabel(stage: string) {
  return (
    { confirmed: "已确认", emerging: "积累中", suggested: "待核对" }[stage] ||
    stage
  );
}
</script>
<style lang="scss">
.profile-mark {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin: 10rpx 0 30rpx;
  font-size: 33rpx;
}
.profile-mark > image {
  width: 128rpx;
  height: 128rpx;
  background: var(--qs-primary-soft);
  border: 1rpx solid var(--qs-lilac);
  border-radius: 50%;
  padding: 6rpx;
}
.facts-list,
.skills-list {
  padding: 4rpx 26rpx;
}
.fact-row {
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--qs-lilac);
}
.fact-row:last-child {
  border: 0;
}
.fact-row > view {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--qs-muted);
  font-size: 23rpx;
}
.fact-row button {
  font-size: 29rpx;
  margin: 0;
  padding: 0 10rpx;
  background: transparent;
  color: #8064af;
  line-height: 1.2;
}
.fact-row > text {
  display: block;
  margin-top: 12rpx;
  font-size: 27rpx;
  line-height: 1.85;
  white-space: pre-wrap;
}
.skill-row {
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--qs-lilac);
}
.skill-row > button {
  display: flex;
  justify-content: space-between;
  text-align: left;
  background: transparent;
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--qs-ink);
  padding: 8rpx 0;
}
.skill-row > button > text:last-child {
  font-size: 22rpx;
  color: var(--qs-muted);
}
.skill-evidence,
.source-text {
  display: block;
  padding: 18rpx;
  font-size: 24rpx;
  line-height: 1.8;
  color: var(--qs-muted);
}
.profile-sources {
  background: transparent;
  color: var(--qs-muted);
  font-size: 24rpx;
  margin-top: 22rpx;
}
</style>
