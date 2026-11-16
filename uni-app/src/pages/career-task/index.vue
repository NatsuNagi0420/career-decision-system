<!-- 青穗集 · 求职任务入口：先核对目标和材料，选择执行位置后继续已有授权及文件交付流程。 -->
<template>
  <view class="qs-page" :class="pageMotionClass">
    <CareerSource @change="switchSource" />
    <view v-if="notice || errors.career" class="qs-error career-error"><text>{{ notice || errors.career }}</text><CareerButton @click="refresh">重新读取</CareerButton></view>
    <LoadingSkeleton v-if="loading && !career" :rows="2" />
    <view class="career-task-options qs-motion-block"><button v-for="item in careerTasks" :key="item.kind" class="career-task-option qs-card qs-press" :class="kind === item.kind ? 'career-task-option--active' : ''" hover-class="qs-pressed" :aria-pressed="kind === item.kind" @click="kind = item.kind"><image :src="taskIcon(item.icon)" /><text>{{ item.title }}</text><text>{{ kind === item.kind ? '✓' : '›' }}</text></button></view>
    <view class="qs-card career-section qs-motion-block">
      <text class="career-title">{{ selectedTask.title }}</text>
      <picker v-if="career?.jobs.length" :range="['先和穗奈确定岗位', ...career.jobs.map(job => job.title)]" :value="jobIndex" @change="jobIndex = Number($event.detail.value)"><view class="career-picker">{{ job?.title || '先和穗奈确定岗位' }} ⌄</view></picker>
      <textarea v-model="notes" class="career-input" maxlength="10000" :placeholder="selectedTask.placeholder" aria-label="补充任务要求" />
      <view v-if="attachment" class="career-task-file"><text class="career-body">{{ attachment.name }}</text><button class="qs-icon-button" aria-label="移除待发送附件" @click="attachment = null"><image :src="assetPaths.icons.close" /></button></view>
      <CareerButton :disabled="picking" @click="pick">{{ picking ? '读取资料中…' : attachment ? '更换资料' : '选择资料' }}</CareerButton>
      <text class="career-muted">材料先暂存，进入对话后由你确认发送。</text>
    </view>
    <view class="qs-card career-section qs-motion-block">
      <view class="career-heading"><text class="career-title">执行位置</text><button class="qs-icon-button" aria-label="刷新执行位置" :disabled="targetsLoading" @click="loadTargets"><image :src="assetPaths.icons.sync" /></button></view>
      <picker v-if="targets.length" :range="targets.map(item => item.name)" :value="targetIndex" @change="targetIndex = Number($event.detail.value)"><view class="career-picker">{{ target?.name }} ⌄</view></picker>
      <text v-if="targetError" class="career-muted">{{ targetError }}</text>
      <text v-if="target && target.source !== source" class="career-muted">切换执行位置后，穗奈会重新核对该位置的经历资料。</text>
      <CareerButton primary :disabled="!target || targetsLoading || picking || loading" @click="review">核对任务并继续</CareerButton>
    </view>
    <text class="career-muted">开始后可在任务页处理确认，完成文件在对话中预览、下载。</text>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow, onHide, onLoad } from "@dcloudio/uni-app";
import CareerSource from "../../components/CareerSource.vue";
import CareerButton from "../../components/CareerButton.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
import { useCareerWorkspace } from "../../services/career-workspace";
import { usePageMotion } from "../../services/page-motion";
import { careerTasks, careerTaskPrompt, type CareerTaskKind } from "../../services/career-flow";
import { chooseAttachment, type SelectedAttachment } from "../../services/files";
import { openCareerChat } from "../../services/career-context";
import { getToken, hubApi } from "../../services/api";
import { errorText } from "../../services/workspace";
import { assetPaths } from "../../static/assets";
const pageMotionClass = usePageMotion();
const { source, career, loading, errors, refresh, changeSource } = useCareerWorkspace([]);
const kind = ref<CareerTaskKind>("resume"), notes = ref(""), jobIndex = ref(0), attachment = ref<SelectedAttachment | null>(null), picking = ref(false), notice = ref("");
const targets = ref<Array<{ source: string; name: string }>>([]), targetIndex = ref(0), targetsLoading = ref(false), targetError = ref("");
const selectedTask = computed(() => careerTasks.find(task => task.kind === kind.value)!);
const job = computed(() => career.value?.jobs[jobIndex.value - 1]);
const target = computed(() => targets.value[targetIndex.value]);
let generation = 0, owner: string | null = null;
onLoad(options => { if (careerTasks.some(task => task.kind === options?.kind)) kind.value = options!.kind as CareerTaskKind; });
onShow(() => { if (owner !== getToken()) { notes.value = ""; attachment.value = null; jobIndex.value = 0; } owner = getToken(); void loadTargets(); });
onHide(() => generation++);
function taskIcon(icon: string) { return assetPaths.prototype[icon as "resume" | "target" | "books"]; }
function switchSource(value: string) { attachment.value = null; jobIndex.value = 0; changeSource(value); const index = targets.value.findIndex(item => item.source === value); if (index >= 0) targetIndex.value = index; }
async function loadTargets() {
  const current = ++generation, token = getToken(); targetsLoading.value = true; targetError.value = "";
  const results = await Promise.allSettled([hubApi.config(), hubApi.devices()]);
  if (current !== generation || token !== getToken()) return;
  const next: Array<{ source: string; name: string }> = [];
  const [config, devices] = results;
  if (config.status === "fulfilled" && config.value.cloud_enabled) next.push({ source: "cloud", name: "云端" });
  if (devices.status === "fulfilled") devices.value.filter(device => device.status === "active" && device.settings.allow_remote).forEach(device => next.push({ source: device.id, name: device.name + (device.online ? " · 在线" : " · 离线，等待上线") }));
  targets.value = next; targetIndex.value = Math.max(0, next.findIndex(item => item.source === source.value));
  if (config.status === "rejected" || devices.status === "rejected") targetError.value = "部分执行位置尚未读取成功，可刷新重试。";
  else if (!next.length) targetError.value = "暂时没有可用执行位置，请在设备与同步中连接电脑。";
  targetsLoading.value = false;
}
async function pick() {
  const token = getToken(); picking.value = true; notice.value = "";
  try { const file = await chooseAttachment(); if (token === getToken()) attachment.value = file; }
  catch (error) { if (token === getToken() && !/cancel|取消/i.test(errorText(error))) notice.value = errorText(error); }
  finally { picking.value = false; }
}
function review() {
  if (!target.value) return;
  const text = careerTaskPrompt(kind.value, career.value, job.value?.id || "", notes.value, attachment.value?.name, target.value.source === source.value);
  openCareerChat(text, target.value.source, attachment.value);
}
</script>
<style lang="scss">
.career-task-options { display:flex; flex-direction:column; gap:16rpx; margin-top:24rpx; }
.career-task-option { display:flex; align-items:center; gap:18rpx; width:100%; padding:22rpx 24rpx; margin:0; color:var(--qs-ink); font-size:27rpx; line-height:1.6; text-align:left; }
.career-task-option image { width:44rpx; height:44rpx; }
.career-task-option--active { background:var(--qs-primary-soft); border-color:$qingsui-primary; }
.career-task-file { display:flex; align-items:center; justify-content:space-between; margin-bottom:18rpx; }
</style>
