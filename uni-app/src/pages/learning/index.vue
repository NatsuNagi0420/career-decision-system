<!-- 青穗集 · 学习路线：消费现有路线、确认和进度接口，保留真实资源与用户成果。 -->
<template>
  <view class="qs-page" :class="pageMotionClass">
    <CareerSource @change="changeSource" />
    <view v-if="errors.career || errors.learning" class="qs-error career-error"><text>{{ errors.career || errors.learning }}</text><CareerButton @click="refresh">重试</CareerButton></view>
    <LoadingSkeleton v-if="loading && !career" :rows="2" />
    <view v-if="source !== 'cloud'" class="qs-card career-section qs-motion-block"><text class="career-body">当前为电脑资料。结构化路线在云端记录，电脑学习继续在原会话中进行。</text><view class="career-actions"><CareerButton @click="generate">和穗奈继续学习</CareerButton></view></view>
    <template v-else>
      <view v-if="learning?.proposal" class="qs-card career-section qs-motion-block">
        <text class="career-title">{{ learning.proposal.path.title }}</text><text class="career-muted">待你确认的学习路线</text>
        <text v-for="node in learning.proposal.path.nodes" :key="node.key" class="career-body">· {{ node.title }}</text>
        <text v-if="learning.proposal.stale" class="career-muted">资料已变化，请重新梳理后确认。</text>
        <view class="career-actions"><view><CareerButton :disabled="saving || loading" @click="decide(false)">暂不采用</CareerButton></view><view><CareerButton primary :disabled="saving || loading || learning.proposal.stale" @click="decide(true)">采用路线</CareerButton></view></view>
      </view>
      <picker v-if="learning?.paths.length" :range="learning.paths.map(path => path.title)" :value="pathIndex" @change="selectPath"><view class="career-picker">{{ path?.title || '选择学习路线' }} ⌄</view></picker>
      <view v-if="path" class="qs-card career-section qs-motion-block">
        <text class="career-title">{{ path.title }}</text><text class="career-muted">{{ done }} / {{ path.nodes.length }} 节已完成</text>
        <view class="career-progress"><view class="career-progress-fill" :style="{ width: Math.round(done / path.nodes.length * 100) + '%' }" /></view>
        <text class="career-body">{{ path.summary }}</text>
      </view>
      <view v-for="(node, index) in path?.nodes || []" :key="node.key" class="qs-card career-section qs-motion-block">
        <button class="learning-node-heading qs-press" hover-class="qs-pressed" :aria-expanded="expanded === node.key" @click="expand(node)"><text class="learning-node-number">{{ node.status === 'done' ? '✓' : index + 1 }}</text><text class="learning-node-title">{{ node.title }}</text><text class="career-muted">{{ statusLabels[node.status] }}</text></button>
        <SizeReveal :open="expanded === node.key" :change-key="[node.updated_at, resources.length, resourceBusy, resourceError, node.resources.length].join(':')">
          <view class="career-rule">
            <text class="career-body">{{ node.objective }}</text><text class="career-quote">岗位依据：{{ node.requirement }}</text>
            <text class="career-muted">预计 {{ node.estimated_minutes }} 分钟{{ node.prerequisites.length ? ' · 先修：' + prerequisiteTitles(node) : '' }}</text>
            <text class="career-body">练习：{{ node.exercise }}</text><text class="career-body">产出：{{ node.deliverable }}</text>
            <textarea v-model="notes" class="career-input" maxlength="6000" placeholder="学习笔记" aria-label="学习笔记" />
            <textarea v-model="result" class="career-input" maxlength="6000" placeholder="实际完成的作品、链接或成果" aria-label="学习成果" />
            <view class="career-actions"><view><CareerButton :disabled="saving || loading" @click="saveNode(node, 'doing')">保存进展</CareerButton></view><view><CareerButton primary :disabled="saving || loading" @click="saveNode(node, 'done')">完成这一节</CareerButton></view></view>
            <view class="career-actions"><view><CareerButton @click="askNode(node)">和穗奈学这一节</CareerButton></view><view><CareerButton :disabled="resourceBusy" @click="findResources(node)">{{ resourceBusy ? '查找中…' : '查找学习资料' }}</CareerButton></view></view>
            <text v-if="resourceError" class="career-muted">{{ resourceError }}</text>
            <view v-if="searchUrl" class="career-actions"><CareerButton @click="openExternalLink(searchUrl)">去站内继续搜索</CareerButton></view>
            <view v-for="resource in node.resources" :key="resource.id" class="career-rule"><text class="career-body">{{ resource.title }}</text><text class="career-muted">{{ resource.author }} · {{ resource.duration }}</text><view class="career-actions"><CareerButton @click="openExternalLink(resource.url)">打开资料链接</CareerButton></view></view>
            <view v-for="resource in resources.filter(item => !node.resources.some(saved => saved.id === item.id))" :key="resource.id" class="career-rule"><text class="career-body">{{ resource.title }}</text><text class="career-muted">{{ resource.author }} · {{ resource.duration }}</text><view class="career-actions"><view><CareerButton @click="openExternalLink(resource.url)">资料链接</CareerButton></view><view><CareerButton :disabled="saving || loading" @click="attach(node, resource.id)">加入本节</CareerButton></view></view></view>
          </view>
        </SizeReveal>
      </view>
      <view v-if="!path && !loading" class="qs-card career-section qs-motion-block"><image class="career-empty-art" :src="assetPaths.characters.suinaiThink" mode="aspectFit" /><text class="career-body">围绕想去的岗位，安排学什么、练什么、留下什么。</text></view>
      <CareerButton :disabled="!career" @click="generate">{{ path ? '和穗奈调整路线' : '和穗奈安排学习路线' }}</CareerButton>
      <text class="career-muted">完成记录由你填写，不代表能力认证。</text>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import CareerSource from "../../components/CareerSource.vue";
import CareerButton from "../../components/CareerButton.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
import SizeReveal from "../../components/SizeReveal.vue";
import { useCareerWorkspace } from "../../services/career-workspace";
import { usePageMotion } from "../../services/page-motion";
import { openCareerChat } from "../../services/career-context";
import { developmentApi, type LearningNode, type LearningResource } from "../../services/career-development";
import { getToken } from "../../services/api";
import { errorText } from "../../services/workspace";
import { openExternalLink } from "../../services/external-link";
import { assetPaths } from "../../static/assets";
const pageMotionClass = usePageMotion();
const { source, career, learning, loading, saving, errors, refresh, changeSource, changeLearning } = useCareerWorkspace(["learning"]);
const expanded = ref(""), notes = ref(""), result = ref(""), resourceBusy = ref(false), resourceError = ref(""), resources = ref<LearningResource[]>([]), searchUrl = ref("");
const pathIndex = computed(() => Math.max(0, learning.value?.paths.findIndex(item => item.id === learning.value?.active_path_id) ?? 0));
const path = computed(() => learning.value?.paths[pathIndex.value]);
const done = computed(() => path.value?.nodes.filter(node => node.status === "done").length ?? 0);
const statusLabels = { todo: "待开始", doing: "学习中", done: "已完成", skipped: "已跳过" };
let resourceGeneration = 0;
watch(() => [source.value, path.value?.id], () => { expanded.value = ""; resources.value = []; resourceGeneration++; resourceBusy.value = false; });
function expand(node: LearningNode) { expanded.value = expanded.value === node.key ? "" : node.key; notes.value = node.notes; result.value = node.result; resources.value = []; resourceError.value = ""; searchUrl.value = ""; resourceGeneration++; resourceBusy.value = false; }
function prerequisiteTitles(node: LearningNode) { return node.prerequisites.map(key => path.value?.nodes.find(item => item.key === key)?.title || key).join('、'); }
async function selectPath(event: any) { const selected = learning.value?.paths[Number(event.detail.value)]; if (selected) await changeLearning({ type: "path.select", id: selected.id }); }
async function decide(approved: boolean) { if (learning.value?.proposal) await changeLearning({ type: "proposal.decide", id: learning.value.proposal.id, approved }); }
async function saveNode(node: LearningNode, status: LearningNode["status"]) {
  if (!path.value) return;
  if (await changeLearning({ type: "node.update", path_id: path.value.id, key: node.key, status, notes: notes.value, result: result.value })) uni.showToast({ title: "已保存", icon: "success" });
}
function generate() { openCareerChat(`请读取我的已确认经历、目标岗位和最新学习记录，结合可投入时间，用 propose_learning_path 为我${path.value ? '调整' : '安排'}学习路线。每一节都包含岗位依据、学习目标、先修关系、练习和交付物，先给草稿让我确认。没有目标岗位时先和我选岗位。`, source.value); }
function askNode(node: LearningNode) { openCareerChat(`我在学习「${path.value?.title}」的「${node.title}」。目标：${node.objective}\n岗位依据：${node.requirement}\n练习：${node.exercise}\n我的笔记：${notes.value}\n请读取学习记录，一步一步带我完成练习，不把计划当成已掌握的能力。`, source.value); }
async function findResources(node: LearningNode) {
  const current = ++resourceGeneration, token = getToken(); resourceBusy.value = true; resourceError.value = "";
  try { const response = await developmentApi.videos(node.search_query); if (current !== resourceGeneration || token !== getToken()) return; resources.value = response.resources; searchUrl.value = /^https?:\/\//i.test(response.search_url) ? response.search_url : ""; if (response.status !== "available") resourceError.value = response.message || "暂未找到可用资料，请稍后重试。"; }
  catch (error) { if (current === resourceGeneration && token === getToken()) resourceError.value = errorText(error); }
  finally { if (current === resourceGeneration) resourceBusy.value = false; }
}
async function attach(node: LearningNode, resourceId: string) { if (path.value) await changeLearning({ type: "resource.attach", path_id: path.value.id, key: node.key, resource_id: resourceId }); }
</script>
<style lang="scss">
.learning-node-heading { display:flex; align-items:center; gap:16rpx; margin:0; padding:0; text-align:left; color:var(--qs-ink); background:transparent; line-height:1.6; }
.learning-node-number { display:flex; align-items:center; justify-content:center; flex-shrink:0; width:42rpx; height:42rpx; border-radius:50%; background:var(--qs-primary-soft); color:$qingsui-primary; font-size:24rpx; }
.learning-node-title { flex:1; font-size:28rpx; }
</style>
