<!-- 青穗集 · 岗位比较：展示真实依据、准备成本和未知项，首选备选由用户确认。 -->
<template>
  <view class="qs-page" :class="pageMotionClass">
    <CareerSource @change="switchSource" />
    <view v-if="errors.career || errors.preparation || notice" class="qs-error career-error"><text>{{ notice || errors.career || errors.preparation }}</text><CareerButton @click="refresh">重新读取</CareerButton></view>
    <LoadingSkeleton v-if="loading && !career" :rows="2" />
    <view v-if="career" class="qs-card career-section qs-motion-block">
      <text class="career-title">把几个方向放在一起看</text>
      <text v-if="career.jobs.length < 2" class="career-muted">先保留至少两个岗位，才能比较。</text>
      <view class="career-chip-list"><button v-for="job in career.jobs" :key="job.id" class="career-chip qs-press" :class="selected.includes(job.id) ? 'career-chip--active' : ''" hover-class="qs-pressed" :aria-pressed="selected.includes(job.id)" @click="toggle(job.id)">{{ selected.includes(job.id) ? '✓ ' : '' }}{{ job.title }}</button></view>
      <text v-if="source !== 'cloud'" class="career-muted">电脑来源继续在原会话比较；云端决策记录单独保存。</text>
      <view class="career-actions"><view><CareerButton @click="explore">继续找岗位</CareerButton></view><view><CareerButton primary :disabled="selected.length < 2 || loading" @click="compare">比较 {{ selected.length }} 个岗位</CareerButton></view></view>
    </view>
    <view v-for="board in preparation?.boards || []" :key="board.id" class="qs-card career-section qs-motion-block">
      <view class="career-heading"><text class="career-title">{{ board.title }}</text><text v-if="board.primary_job_id" class="career-muted">已选方向</text></view>
      <text v-if="board.stale" class="career-muted">画像或岗位已变化，重新比较后再保存选择。</text>
      <view v-for="option in board.options" :key="option.job_id" class="compare-option career-rule">
        <text class="career-title">{{ jobTitle(option.job_id) }}</text>
        <text class="career-muted">吸引点</text><text class="career-body">{{ option.attraction }}</text>
        <text class="career-muted">准备成本</text><text class="career-body">{{ option.preparation_cost }}</text>
        <text class="career-muted">取舍</text><text class="career-body">{{ option.tradeoff }}</text>
        <text class="career-muted">尚待核实</text><text v-for="unknown in option.unknowns" :key="unknown" class="career-body">· {{ unknown }}</text>
        <view class="career-actions"><CareerButton @click="toggleEvidence(board.id + option.job_id)">{{ evidenceOpen === board.id + option.job_id ? '收起依据' : '查看原文依据' }}</CareerButton></view>
        <SizeReveal :open="evidenceOpen === board.id + option.job_id" :change-key="option.evidence.length"><view v-for="(evidence, index) in option.evidence" :key="index"><text class="career-muted">{{ sourceTitle(evidence.source_id) }}</text><text class="career-quote">{{ evidence.quote }}</text></view></SizeReveal>
        <view class="career-actions"><view><CareerButton :primary="choice(board).primary === option.job_id" :disabled="board.stale || saving || loading" @click="choosePrimary(board, option.job_id)">{{ choice(board).primary === option.job_id ? '✓ 首选' : '设为首选' }}</CareerButton></view><view><CareerButton :primary="choice(board).backups.includes(option.job_id)" :disabled="board.stale || saving || loading" @click="chooseBackup(board, option.job_id)">{{ choice(board).backups.includes(option.job_id) ? '✓ 备选' : '设为备选' }}</CareerButton></view></view>
      </view>
      <textarea :value="choice(board).reason" class="career-input" maxlength="1000" placeholder="记下你自己的选择理由（可选）" aria-label="选择理由" @input="updateReason(board, $event)" />
      <CareerButton primary :disabled="board.stale || saving || loading || !choice(board).primary" @click="save(board)">{{ saving ? '保存中…' : '保存我的选择' }}</CareerButton>
      <text v-if="board.next_question" class="career-muted">{{ board.next_question }}</text>
      <view class="career-actions"><view><CareerButton @click="reconsider(board)">和穗奈核实</CareerButton></view><view><CareerButton :disabled="!board.primary_job_id" @click="learn">围绕首选去学习</CareerButton></view></view>
    </view>
    <view v-if="career?.comparisons.length" class="qs-card career-section qs-motion-block"><text class="career-title">已有岗位对照</text><view v-for="item in career.comparisons" :key="item.job_id" class="career-rule"><text class="career-body">{{ jobTitle(item.job_id) }}</text><text class="career-muted">{{ item.summary }}</text><view v-for="(check, index) in item.checks" :key="index" class="compare-check"><text class="career-body">{{ check.requirement }}</text><text class="career-muted">{{ assessmentLabels[check.assessment] }} · {{ check.reason }}</text></view></view></view>
    <text v-if="career && !preparation?.boards.length && !loading" class="career-muted">穗奈整理比较草稿后会显示在这里，最终选择由你决定。</text>
  </view>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import CareerSource from "../../components/CareerSource.vue";
import CareerButton from "../../components/CareerButton.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
import SizeReveal from "../../components/SizeReveal.vue";
import { useCareerWorkspace } from "../../services/career-workspace";
import { usePageMotion } from "../../services/page-motion";
import { openCareerChat } from "../../services/career-context";
import type { DecisionBoard } from "../../services/career-development";
const pageMotionClass = usePageMotion();
const { source, career, preparation, errors, loading, saving, refresh, changeSource, changePreparation } = useCareerWorkspace(["preparation"]);
const selected = ref<string[]>([]), evidenceOpen = ref(""), notice = ref("");
const choices = ref<Record<string, { primary: string | null; backups: string[]; reason: string }>>({});
const assessmentLabels = { supported: "有经历支持", partial: "部分支持", unknown: "证据待补", conflict: "存在不一致" };
watch(() => career.value?.jobs, jobs => { selected.value = selected.value.filter(id => jobs?.some(job => job.id === id)); if (!selected.value.length && jobs) selected.value = jobs.slice(0, 3).map(job => job.id); });
watch(career, value => { if (!value) { choices.value = {}; evidenceOpen.value = ""; notice.value = ""; } });
function switchSource(value: string) { choices.value = {}; selected.value = []; evidenceOpen.value = ""; notice.value = ""; changeSource(value); }
function toggle(id: string) { if (selected.value.includes(id)) selected.value = selected.value.filter(value => value !== id); else if (selected.value.length < 3) selected.value = [...selected.value, id]; else uni.showToast({ title: "每次最多比较 3 个岗位", icon: "none" }); }
function compare() {
  const jobs = career.value?.jobs.filter(job => selected.value.includes(job.id)) || [];
  openCareerChat(`请读取我的已确认资料，比较以下已保存岗位：\n${jobs.map(job => `${job.title}（编号：${job.id}）`).join('\n')}\n请逐项比较吸引点、准备成本、取舍和未知信息，逐字引用岗位原文及真实经历，使用 propose_job_decision 保存比较草稿，首选和备选由我决定。不要编造匹配百分比或录用概率。`, source.value);
}
function jobTitle(id: string) { return career.value?.jobs.find(job => job.id === id)?.title || "原岗位已移除"; }
function sourceTitle(id: string) { return id.startsWith("job.") ? "岗位原文 · " + jobTitle(id.slice(4)) : id.startsWith("profile.") ? "画像资料" : "经历原文"; }
function toggleEvidence(id: string) { evidenceOpen.value = evidenceOpen.value === id ? "" : id; }
function choice(board: DecisionBoard) { return choices.value[board.id] || { primary: board.primary_job_id, backups: board.backup_job_ids, reason: board.reason }; }
function choosePrimary(board: DecisionBoard, id: string) { const value = choice(board); choices.value = { ...choices.value, [board.id]: { ...value, primary: id, backups: value.backups.filter(item => item !== id) } }; }
function chooseBackup(board: DecisionBoard, id: string) { const value = choice(board); choices.value = { ...choices.value, [board.id]: { ...value, primary: value.primary === id ? null : value.primary, backups: value.backups.includes(id) ? value.backups.filter(item => item !== id) : [...value.backups, id].slice(-2) } }; }
function updateReason(board: DecisionBoard, event: any) { choices.value = { ...choices.value, [board.id]: { ...choice(board), reason: event.detail.value } }; }
async function save(board: DecisionBoard) { const value = choice(board); if (await changePreparation({ type: "decision.select", id: board.id, primary_job_id: value.primary, backup_job_ids: value.backups, reason: value.reason })) { delete choices.value[board.id]; uni.showToast({ title: "选择已保存", icon: "success" }); } }
function reconsider(board: DecisionBoard) { openCareerChat(`请重新核实「${board.title}」的岗位比较，重点讨论：${board.next_question}。读取最新资料和证据后更新比较草稿，不替我决定。`, source.value); }
function learn() { uni.navigateTo({ url: "/pages/learning/index" }); }
function explore() { uni.navigateTo({ url: "/pages/directions/index" }); }
</script>
<style lang="scss">
.compare-check { padding:14rpx 0; }
.compare-option { padding-bottom:6rpx; }
</style>
