<!-- 青穗集 · 移动训练：一题一答、真实反馈、暂停续练，试卷交卷前不显示答案。 -->
<template>
  <view class="qs-page" :class="pageMotionClass">
    <CareerSource @change="switchSource" />
    <view v-if="notice || errors.career || errors.preparation" class="qs-error career-error"><text>{{ notice || errors.career || errors.preparation }}</text><CareerButton @click="reload">刷新记录</CareerButton></view>
    <view v-if="attempt" class="career-section qs-card"><text class="career-body">正在核对刚才的提交，保留原请求编号以避免重复作答。</text><CareerButton :disabled="submitting" @click="retryPending">{{ submitting ? '确认中…' : '重试确认提交' }}</CareerButton></view>
    <LoadingSkeleton v-if="loading && !career" :rows="2" />
    <view v-if="source !== 'cloud'" class="qs-card career-section qs-motion-block"><text class="career-body">电脑来源的练习请继续原会话。云端训练会单独保存题目和复盘。</text><view class="career-actions"><CareerButton @click="openCareerChat('我想针对当前目标岗位做一轮文字模拟面试，请一次问一题，结合我的真实经历追问。', source)">在电脑会话练习</CareerButton></view></view>
    <template v-else>
      <template v-if="!session && !launching">
        <view class="career-chip-list"><button v-for="item in modes" :key="item.key" class="career-chip qs-press" :class="mode === item.key ? 'career-chip--active' : ''" hover-class="qs-pressed" @click="mode = item.key">{{ item.title }}</button></view>
        <view class="qs-card career-section qs-motion-block">
          <text class="career-title">{{ preparationLabels[mode] }}</text><text class="career-muted">{{ modeHelp[mode] }}</text>
          <picker v-if="career?.jobs.length" :range="career.jobs.map(job => job.title)" :value="jobIndex" @change="jobIndex = Number($event.detail.value)"><view class="career-picker">{{ job?.title }} ⌄</view></picker>
          <view v-else class="career-actions"><CareerButton @click="openDirections">先保存目标岗位</CareerButton></view>
          <view class="career-chip-list"><button v-for="count in [3, 5, 8]" :key="count" class="career-chip qs-press" :class="total === count ? 'career-chip--active' : ''" hover-class="qs-pressed" @click="total = count">{{ count }} 题</button></view>
          <view v-if="mode === 'practice'" class="career-actions"><CareerButton @click="loadBank">{{ bankOpen ? '收起整理题库' : '从整理题库选题' }}</CareerButton></view>
          <SizeReveal :open="bankOpen && mode === 'practice'" :change-key="[bank.length, bankBusy, bankError].join(':')">
            <text v-if="bankError || bankBusy" class="career-muted">{{ bankError || '正在读取题库…' }}</text>
            <view class="career-picker"><input v-model="query" placeholder="筛选知识点" aria-label="筛选整理题" /></view>
            <button v-for="question in shownBank" :key="question.id" class="preparation-bank-item qs-press" hover-class="qs-pressed" :aria-pressed="bankIds.includes(question.id)" @click="toggleBank(question.id)"><text>{{ bankIds.includes(question.id) ? '✓ ' : '○ ' }}{{ question.topic }}</text><text class="career-muted">{{ question.prompt }}</text></button>
            <text class="career-muted">原创整理题，非企业真题；已选 {{ bankIds.length }} / 8 题</text>
          </SizeReveal>
          <view class="career-actions"><CareerButton primary :disabled="!job || submitting || loading || !!attempt" @click="start">开始{{ preparationLabels[mode] }}</CareerButton></view>
        </view>
      </template>
      <view v-if="launching || working" class="qs-card career-section qs-motion-block"><ActivityDots label="穗奈正在准备" /><text class="career-muted">{{ launching ? '正在准备本轮题目…' : '正在记录回答并准备下一步…' }}</text><view class="career-actions"><CareerButton @click="openChat">查看对话与执行进度</CareerButton></view></view>
      <template v-if="session">
        <view class="qs-card career-section qs-motion-block">
          <view class="career-heading"><text class="career-title">{{ session.job_title }}</text><text class="career-muted">{{ preparationLabels[session.mode] }}</text></view>
          <text class="career-body">{{ session.answers.length }} / {{ session.total }} 题 · {{ session.status === 'completed' ? '已结束' : session.status === 'paused' ? '已暂停' : '进行中' }}</text>
          <view class="career-progress"><view class="career-progress-fill" :style="{ width: Math.min(100, Math.round(session.answers.length / session.total * 100)) + '%' }" /></view>
          <text v-if="session.stale" class="career-muted">岗位资料已有更新，本轮保留开始时的背景。</text>
          <view v-if="session.status !== 'completed'" class="career-actions"><view><CareerButton :disabled="working || saving || submitting" @click="setStatus(session.status === 'paused' ? 'active' : 'paused')">{{ session.status === 'paused' ? '继续练习' : '暂停' }}</CareerButton></view><view><CareerButton :disabled="working || saving || submitting" @click="finish">{{ session.mode === 'exam' ? '交卷' : '结束本轮' }}</CareerButton></view></view>
        </view>
        <view v-if="question && session.status !== 'completed'" class="qs-card career-section qs-motion-block">
          <text class="career-muted">第 {{ session.answers.length + 1 }} 题 · {{ question.topic }}</text><text class="career-title">{{ question.prompt }}</text><text class="career-muted">{{ question.origin === 'curated' ? '原创整理题' : 'AI生成题' }}</text>
          <textarea v-model="answer" class="career-input preparation-answer" maxlength="16000" :disabled="working || submitting || !!attempt || session.status !== 'active'" placeholder="写下你的理解，穗奈会根据真实回答继续" aria-label="本题回答" />
          <CareerButton primary :disabled="!answer.trim() || working || submitting || saving || !!attempt || session.status !== 'active'" @click="submit">{{ submitting ? '提交中…' : '提交回答' }}</CareerButton>
        </view>
        <view v-for="(entry, index) in session.answers" :key="entry.question_id" class="qs-card career-section qs-motion-block">
          <text class="career-title">第 {{ index + 1 }} 题{{ feedbackVisible ? '复盘' : ' · 已作答' }}</text><text class="career-body">{{ session.questions.find(item => item.id === entry.question_id)?.prompt }}</text><text class="career-quote">{{ entry.text }}</text>
          <template v-if="feedbackVisible"><text v-if="entry.verdict" class="career-body">{{ verdictLabels[entry.verdict] }}</text><text v-for="strength in entry.strengths || []" :key="strength" class="career-muted">做得好：{{ strength }}</text><text v-for="gap in entry.gaps || []" :key="gap" class="career-muted">可改进：{{ gap }}</text><text v-if="entry.next_exercise" class="career-body">下一步：{{ entry.next_exercise }}</text>
            <SizeReveal :open="expandedAnswer === entry.question_id"><text class="career-quote">{{ session.questions.find(item => item.id === entry.question_id)?.reference_answer || '这道题暂无参考答案。' }}</text></SizeReveal>
            <view class="career-actions"><CareerButton @click="expandedAnswer = expandedAnswer === entry.question_id ? '' : entry.question_id">{{ expandedAnswer === entry.question_id ? '收起参考' : '查看参考答案' }}</CareerButton></view>
          </template><text v-else class="career-muted">交卷后查看反馈与解析。</text>
        </view>
        <text class="career-muted">训练反馈只用于练习，不代表录用概率或能力认证。</text>
        <view class="career-actions"><view><CareerButton @click="openChat">打开本轮对话</CareerButton></view><view><CareerButton :disabled="working || submitting || !!attempt" @click="backToLaunch">{{ session.status === 'completed' ? '再来一轮' : '返回训练列表' }}</CareerButton></view></view>
      </template>
      <view v-if="!session && preparation?.sessions.length" class="career-section qs-card qs-motion-block"><text class="career-title">最近训练</text><button v-for="item in preparation.sessions" :key="item.id" class="preparation-history qs-press" hover-class="qs-pressed" @click="chooseSession(item.id)"><text>{{ item.job_title }} · {{ preparationLabels[item.mode] }}</text><text class="career-muted">{{ item.answers.length }} / {{ item.total }} 题 · {{ item.status === 'completed' ? '已结束' : item.status === 'paused' ? '已暂停' : '继续' }} ›</text></button></view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import CareerSource from "../../components/CareerSource.vue";
import CareerButton from "../../components/CareerButton.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
import ActivityDots from "../../components/ActivityDots.vue";
import SizeReveal from "../../components/SizeReveal.vue";
import { useCareerWorkspace } from "../../services/career-workspace";
import { usePageMotion } from "../../services/page-motion";
import { developmentApi, preparationLabels, type PreparationMode, type PreparationQuestion, type PreparationSession } from "../../services/career-development";
import { preparationPrompt } from "../../services/career-flow";
import { ensureCareerConsent, resolveCloudSession } from "../../services/career-execution";
import { agentApi, getToken, newRequestId } from "../../services/api";
import { tasksFromSnapshot, activeStatus, errorText } from "../../services/workspace";
import { openCareerChat } from "../../services/career-context";
const pageMotionClass = usePageMotion();
const { source, career, preparation, loading, saving, errors, refresh, changeSource, changePreparation } = useCareerWorkspace(["preparation"]);
const mode = ref<PreparationMode>("practice"), jobIndex = ref(0), total = ref(3), selectedId = ref("");
const answer = ref(""), submitting = ref(false), working = ref(false), launching = ref(false), notice = ref(""), hubId = ref("");
const bank = ref<PreparationQuestion[]>([]), bankIds = ref<string[]>([]), bankOpen = ref(false), bankBusy = ref(false), bankError = ref(""), query = ref(""), expandedAnswer = ref("");
const modes: Array<{ key: PreparationMode; title: string }> = [{ key: "practice", title: "练习" }, { key: "exam", title: "试卷" }, { key: "interview", title: "面试" }];
const modeHelp = { practice: "答完再讲解，围绕岗位补知识。", exam: "先作答，交卷后一起看反馈。", interview: "穗奈担任考官，根据你的回答追问。" };
const verdictLabels = { solid: "回答较完整", partial: "还可补充", needs_practice: "建议继续练习" };
const job = computed(() => career.value?.jobs[jobIndex.value]);
const session = computed(() => preparation.value?.sessions.find(item => item.id === selectedId.value));
const question = computed(() => session.value?.questions[session.value.answers.length]);
const feedbackVisible = computed(() => session.value?.mode !== "exam" || session.value?.status === "completed");
const shownBank = computed(() => bank.value.filter(item => (item.topic + item.prompt).toLowerCase().includes(query.value.toLowerCase())));
let visible = false, generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
const attempt = ref<{ session: string; text: string; request: string; question: string | null } | null>(null);
let owner = getToken();
onLoad(options => { selectedId.value = options?.id || ""; if (["practice", "exam", "interview"].includes(options?.mode || "")) mode.value = options!.mode as PreparationMode; });
onShow(() => { if (owner !== getToken()) { clearSelection(); bank.value = []; bankIds.value = []; bankOpen.value = false; query.value = ""; bankBusy.value = false; } owner = getToken(); visible = true; if (hubId.value) void poll(); });
function stop() { visible = false; generation++; if (timer) clearTimeout(timer); }
onHide(stop); onUnload(stop);
watch(() => session.value?.id, async id => {
  if (!id || hubId.value || !session.value) return;
  const token = getToken(), current = generation;
  try { const linked = await resolveCloudSession(session.value.conversation_id); if (visible && token === getToken() && current === generation) { hubId.value = linked.id; void poll(); } }
  catch (error) { if (visible && token === getToken() && current === generation) notice.value = errorText(error); }
});
function clearSelection() { generation++; if (timer) clearTimeout(timer); selectedId.value = ""; hubId.value = ""; answer.value = ""; attempt.value = null; working.value = false; launching.value = false; notice.value = ""; expandedAnswer.value = ""; }
function switchSource(value: string) { clearSelection(); changeSource(value); }
function backToLaunch() { clearSelection(); }
function chooseSession(id: string) { clearSelection(); selectedId.value = id; }
async function reload() { notice.value = ""; await refresh(); if (hubId.value) await poll(); else if (session.value) { try { hubId.value = (await resolveCloudSession(session.value.conversation_id)).id; await poll(); } catch (error) { notice.value = errorText(error); } } }
function openDirections() { uni.navigateTo({ url: "/pages/directions/index" }); }
function openChat() { if (hubId.value) uni.navigateTo({ url: "/pages/chat/index?id=" + encodeURIComponent(hubId.value) }); }
async function loadBank() {
  bankOpen.value = !bankOpen.value; if (!bankOpen.value || bank.value.length) return;
  const token = getToken(); bankBusy.value = true; bankError.value = "";
  try { const result = await developmentApi.questions(); if (token === getToken()) bank.value = result.questions; }
  catch (error) { if (token === getToken()) bankError.value = errorText(error); }
  finally { if (token === getToken()) bankBusy.value = false; }
}
function toggleBank(id: string) { if (bankIds.value.includes(id)) bankIds.value = bankIds.value.filter(value => value !== id); else if (bankIds.value.length < 8) bankIds.value = [...bankIds.value, id]; else uni.showToast({ title: "每轮最多选 8 题", icon: "none" }); }
async function sendRun(text: string, conversationId: string, questionId: string | null = null) {
  if (!attempt.value) attempt.value = { text, session: conversationId, request: newRequestId(), question: questionId };
  const pending = attempt.value;
  await agentApi.run(pending.session, pending.text, "", pending.request);
  if (attempt.value?.request === pending.request) attempt.value = null;
}
async function retryPending() {
  if (!attempt.value || submitting.value) return;
  const pending = attempt.value, token = getToken(), current = generation;
  submitting.value = true; notice.value = "";
  try {
    await sendRun(pending.text, pending.session, pending.question);
    if (token !== getToken() || current !== generation) return;
    if (pending.question) answer.value = "";
    else launching.value = true;
    working.value = true; void poll();
  } catch (error) { if (token === getToken() && current === generation) notice.value = errorText(error); }
  finally { submitting.value = false; }
}
async function start() {
  if (!job.value || submitting.value || attempt.value) return;
  const token = getToken(), current = generation;
  submitting.value = true; notice.value = "";
  try {
    if (!await ensureCareerConsent() || token !== getToken() || current !== generation) return;
    if (!hubId.value) { const created = await agentApi.createConversation(null, { target: "cloud", device_id: null, workspace_id: null }); if (token !== getToken() || current !== generation) return; hubId.value = created.id; }
    await sendRun(preparationPrompt(mode.value, job.value, total.value, mode.value === "practice" ? bankIds.value : []), hubId.value);
    if (token !== getToken() || current !== generation) return;
    launching.value = true; working.value = true; void poll();
  } catch (error) { if (token === getToken() && current === generation) notice.value = errorText(error); }
  finally { submitting.value = false; }
}
async function poll() {
  if (!visible || !hubId.value || source.value !== "cloud") return;
  const current = ++generation, token = getToken(), id = hubId.value;
  if (timer) clearTimeout(timer);
  try {
    const snapshot = await agentApi.snapshot(id);
    const state = await developmentApi.preparation();
    if (!visible || current !== generation || token !== getToken() || id !== hubId.value) return;
    preparation.value = state;
    const nativeId = snapshot.conversation.local_id || snapshot.conversation.id;
    const found = state.sessions.find(item => item.conversation_id === nativeId);
    if (attempt.value && found && (!attempt.value.question || found.answers.some(answer => answer.question_id === attempt.value?.question))) { attempt.value = null; answer.value = ""; }
    if (!selectedId.value && found) selectedId.value = found.id;
    const latest = tasksFromSnapshot(snapshot).at(-1);
    working.value = Boolean(latest && activeStatus(latest.status));
    if (!working.value) {
      launching.value = false;
      if (latest?.error) notice.value = latest.error;
      else if (!found) notice.value = "本轮尚未建立训练记录，请打开对话查看穗奈需要补充的信息。";
      else if (latest?.status === "waiting_input") notice.value = "穗奈需要补充信息，请打开本轮对话。";
    }
    if (working.value) timer = setTimeout(poll, 2000);
  } catch (error) { if (current === generation && token === getToken()) { notice.value = errorText(error); timer = setTimeout(poll, 5000); } }
}
async function submit() {
  if (!session.value || !question.value || !answer.value.trim() || submitting.value || working.value || attempt.value) return;
  const text = answer.value.trim(), token = getToken(), current = generation;
  submitting.value = true; notice.value = "";
  try {
    if (!await ensureCareerConsent() || token !== getToken() || current !== generation) return;
    if (!hubId.value) hubId.value = (await resolveCloudSession(session.value.conversation_id)).id;
    if (token !== getToken() || current !== generation) return;
    await sendRun(text, hubId.value, question.value!.id);
    if (token !== getToken() || current !== generation) return;
    answer.value = ""; working.value = true; void poll();
  } catch (error) { if (token === getToken() && current === generation) notice.value = errorText(error); }
  finally { submitting.value = false; }
}
async function setStatus(status: PreparationSession["status"]) { if (session.value) await changePreparation({ type: "session.status", id: session.value.id, status }); }
async function finish() {
  if (!session.value) return;
  const confirmed = await new Promise<boolean>(resolve => uni.showModal({ title: session.value?.mode === "exam" ? "确认交卷？" : "结束本轮训练？", content: "已提交的回答会保留，结束后可查看复盘。", success: result => resolve(result.confirm), fail: () => resolve(false) }));
  if (confirmed) await setStatus("completed");
}
</script>
<style lang="scss">
.preparation-answer { min-height:260rpx; }
.preparation-bank-item,.preparation-history { display:block; width:100%; padding:22rpx 0; margin:0; text-align:left; background:transparent; color:var(--qs-ink); font-size:26rpx; line-height:1.7; border-bottom:1rpx solid var(--qs-lilac); }
</style>
