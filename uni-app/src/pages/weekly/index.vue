<!-- 青穗集 · 成长周报：本地汇总和绘制，默认不含个人文本，不创建公开个人档案。 -->
<template>
  <view class="qs-page" :class="pageMotionClass">
    <CareerSource @change="switchSource" />
    <view v-if="errors.career || errors.learning || errors.preparation || fileError || notice" class="qs-error career-error"><text>{{ notice || errors.career || errors.learning || errors.preparation || fileError }}</text><CareerButton @click="reload">刷新记录</CareerButton></view>
    <LoadingSkeleton v-if="loading && !career" :rows="2" />
    <view class="qs-card career-section weekly-heading qs-motion-block"><image class="weekly-suinai" :src="assetPaths.characters.suinaiSuccess" mode="aspectFit" /><view><text class="career-muted">{{ report.period }}</text><text class="career-title">这一周留下的积累</text></view></view>
    <view class="weekly-stats qs-motion-block"><view v-for="stat in stats" :key="stat.title" class="weekly-stat qs-card"><text class="weekly-number">{{ stat.value }}</text><text class="career-muted">{{ stat.title }}</text></view></view>
    <text v-if="source !== 'cloud'" class="career-muted">电脑来源仅回顾已同步行动和文件，云端的学习与训练不并入统计。</text>
    <text class="career-muted">行动与学习按本周更新且已完成的记录统计，不等于能力评分。文件仅含已同步且有时间戳的成果。</text>
    <view v-for="section in sections" :key="section.title" class="qs-card career-section qs-motion-block"><text class="career-title">{{ section.title }}</text><text v-for="(title, index) in section.items" :key="index" class="career-body">· {{ title }}</text></view>
    <view class="qs-card career-section qs-motion-block"><text class="career-muted">接下来</text><text class="career-title">{{ report.next }}</text><view class="career-actions"><CareerButton @click="reviewWithSuinai">和穗奈回顾</CareerButton></view></view>
    <view class="qs-card career-section qs-motion-block">
      <view class="weekly-privacy"><text class="career-body">海报包含条目名称</text><switch :checked="includeTitles" color="#9271b8" aria-label="海报包含条目名称" @change="toggleTitles" /></view>
      <text class="career-muted">默认只显示数量。打开后请核对经历、文件名等是否适合分享。</text>
      <view class="career-actions"><CareerButton primary :disabled="drawing || !ready" @click="generatePoster">{{ drawing ? '生成中…' : '预览成长海报' }}</CareerButton></view>
      <image v-if="poster" class="weekly-poster" :src="poster" mode="widthFix" aria-label="待保存的成长海报" @click="previewPoster" />
      <view v-if="poster" class="career-actions"><CareerButton @click="savePoster">保存海报</CareerButton></view>
      <!-- #ifdef MP-WEIXIN -->
      <button class="qs-button weekly-share" open-type="share">邀请朋友一起探索</button>
      <!-- #endif -->
      <text class="career-muted">邀请只打开体验入口，不公开你的会话、简历或成长档案。</text>
    </view>
    <canvas canvas-id="weekly-share" id="weekly-share" class="weekly-canvas" :style="{ width: '600px', height: posterHeight + 'px' }" />
  </view>
</template>
<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from "vue";
import { onShow, onHide, onShareAppMessage } from "@dcloudio/uni-app";
import CareerSource from "../../components/CareerSource.vue";
import CareerButton from "../../components/CareerButton.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
import { useCareerWorkspace } from "../../services/career-workspace";
import { usePageMotion } from "../../services/page-motion";
import { weeklyReport, weeklyPosterLines } from "../../services/career-weekly";
import { getToken, type Artifact } from "../../services/api";
import { loadOverview, overview } from "../../services/overview";
import { openCareerChat } from "../../services/career-context";
import { errorText } from "../../services/workspace";
import { assetPaths } from "../../static/assets";
const pageMotionClass = usePageMotion();
const { source, career, learning, preparation, loading, errors, refresh, changeSource } = useCareerWorkspace();
const instance = getCurrentInstance();
function toggleTitles(event: any) { includeTitles.value = Boolean(event.detail.value); }
const files = ref<Artifact[]>([]), fileError = ref(""), fileLoading = ref(false), notice = ref(""), includeTitles = ref(false), poster = ref(""), drawing = ref(false), posterHeight = ref(880), now = ref(new Date());
let generation = 0, posterGeneration = 0, owner = getToken();
const report = computed(() => weeklyReport(career.value, learning.value, preparation.value, files.value, now.value));
const ready = computed(() => !loading.value && !fileLoading.value && !!career.value && !errors.value.career && !errors.value.learning && !errors.value.preparation && !fileError.value);
const stats = computed(() => [
  { title: "学习记录", value: source.value !== 'cloud' || errors.value.learning || (!learning.value && loading.value) ? '—' : report.value.lessons.length },
  { title: "结束训练", value: source.value !== 'cloud' || errors.value.preparation || (!preparation.value && loading.value) ? '—' : report.value.sessions.length },
  { title: "完成行动记录", value: errors.value.career || !career.value ? '—' : report.value.actions.length },
  { title: "生成文件", value: fileError.value || fileLoading.value ? '—' : report.value.files.length },
]);
const sections = computed(() => [{ title: "学过与练过", items: [...report.value.lessons, ...report.value.sessions] }, { title: "完成的记录", items: report.value.actions }, { title: "留下的文件", items: report.value.files }].filter(section => section.items.length));
watch([includeTitles, report, ready], () => { posterGeneration++; poster.value = ""; });
onShow(() => { if (owner !== getToken()) { generation++; posterGeneration++; files.value = []; poster.value = ""; includeTitles.value = false; notice.value = ""; } owner = getToken(); now.value = new Date(); void loadFiles(); });
onHide(() => { generation++; posterGeneration++; poster.value = ""; });
onShareAppMessage(() => ({ title: "和穗奈一起，把迷茫变成下一步", path: "/pages/home/index", imageUrl: assetPaths.characters.growthRouteIllustration }));
function switchSource(value: string) { generation++; posterGeneration++; files.value = []; poster.value = ""; includeTitles.value = false; changeSource(value); void loadFiles(); }
async function loadFiles() {
  const current = ++generation, token = getToken(), selected = source.value; fileError.value = ""; fileLoading.value = true;
  await loadOverview(true);
  if (current !== generation || token !== getToken() || selected !== source.value) return;
  files.value = Object.values(overview.snapshots).filter(snapshot => selected === "cloud" ? snapshot.conversation.target !== "pc" : snapshot.conversation.device_id === selected).flatMap(snapshot => snapshot.files || []).filter(file => file.kind === "output");
  if (overview.error || overview.partialError || !overview.complete) fileError.value = "部分会话尚未同步，文件统计可能不完整。";
  fileLoading.value = false;
}
async function reload() { notice.value = ""; await Promise.all([refresh(), loadFiles()]); }
function reviewWithSuinai() {
  const value = report.value;
  openCareerChat(`请结合我的真实记录回顾本周：学习记录 ${value.lessons.length} 节，结束训练 ${value.sessions.length} 轮，本周更新的已完成行动 ${value.actions.length} 项，已同步生成文件 ${value.files.length} 份。请读取原始记录后和我核对实际成果，再确定下一步，不把计划、打卡或数量当作能力证明。`, source.value);
}
async function generatePoster() {
  if (drawing.value || !ready.value) return; drawing.value = true; notice.value = "";
  const current = posterGeneration, token = getToken(), privateTitles = includeTitles.value;
  try {
    const lines = weeklyPosterLines(report.value, privateTitles, source.value !== 'cloud').flatMap(line => line.length > 24 ? [line.slice(0, 24), line.slice(24, 47) + (line.length > 47 ? '…' : '')] : [line]);
    posterHeight.value = Math.max(800, 170 + lines.length * 48); await nextTick();
    const ctx = uni.createCanvasContext("weekly-share", instance?.proxy);
    ctx.setFillStyle("#faf9f6"); ctx.fillRect(0, 0, 600, posterHeight.value);
    ctx.setFillStyle("#e6ddeb"); for (let x = 16; x < 600; x += 24) for (let y = 16; y < posterHeight.value; y += 24) ctx.fillRect(x, y, 2, 2);
    ctx.setFillStyle("#fffefc"); ctx.fillRect(28, 28, 544, posterHeight.value - 56); ctx.setStrokeStyle("#ded3e7"); ctx.strokeRect(28, 28, 544, posterHeight.value - 56);
    lines.forEach((line, index) => { ctx.setFillStyle(index === 0 ? "#806298" : "#393249"); ctx.setFontSize(index === 0 ? 30 : 20); ctx.fillText(line, 60, 96 + index * 48, 480); });
    await new Promise<void>(resolve => ctx.draw(false, () => resolve()));
    const path = await new Promise<string>((resolve, reject) => uni.canvasToTempFilePath({ canvasId: "weekly-share", width: 600, height: posterHeight.value, destWidth: 900, destHeight: Math.round(posterHeight.value * 1.5), fileType: "png", success: result => resolve(result.tempFilePath), fail: reject }, instance?.proxy));
    if (token === getToken() && current === posterGeneration && privateTitles === includeTitles.value && ready.value) poster.value = path;
  } catch (error) { if (token === getToken() && current === posterGeneration) notice.value = "海报生成失败，请重试：" + errorText(error); }
  finally { drawing.value = false; }
}
function previewPoster() { if (poster.value) uni.previewImage({ urls: [poster.value] }); }
function savePoster() {
  if (!poster.value) return;
  // #ifdef H5
  const link = document.createElement("a"); link.href = poster.value; link.download = "青穗集-成长周报.png"; link.click(); return;
  // #endif
  // #ifndef H5
  uni.saveImageToPhotosAlbum({ filePath: poster.value, success: () => uni.showToast({ title: "已保存到相册", icon: "success" }), fail: () => { notice.value = "尚未保存，可检查相册权限后重试，或打开预览长按保存。"; } });
  // #endif
}
</script>
<style lang="scss">
.weekly-heading { display:flex; align-items:center; gap:22rpx; }
.weekly-suinai { width:108rpx; height:128rpx; flex-shrink:0; }
.weekly-stats { display:grid; grid-template-columns:1fr 1fr; gap:18rpx; }
.weekly-stat { padding:25rpx; }
.weekly-number { font-size:46rpx; color:$qingsui-primary; }
.weekly-privacy { display:flex; justify-content:space-between; align-items:center; gap:16rpx; }
.weekly-poster { width:100%; margin-top:24rpx; border-radius:12rpx; }
.weekly-share { margin-top:20rpx; font-size:25rpx; }
.weekly-canvas { position:fixed; left:-3000px; top:0; pointer-events:none; }
</style>
