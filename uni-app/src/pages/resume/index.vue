<!-- 青穗集 · 简历查看：读取真实简历和同步成果，改写与导出请求带入对话确认。 -->
<template>
  <view :class="pageMotionClass" class="qs-page">
    <CareerSource @change="changeSource" />
    <button
      :id="buttonRippleId(1)"
      :style="buttonRippleStyle(1)"
      @touchstart="startButtonRipple($event, 1, undefined, importing)"
      hover-class="button-hover"
      hover-stop-propagation
      :hover-start-time="0"
      :hover-stay-time="110"
      class="resume-import qs-card qs-motion-block qs-tap-target"
      :disabled="importing"
      @click="startButtonRipple($event, 1, undefined, importing); importResume()"
    >
      <image :src="assets.attachment" />
      <text>{{ importing ? "正在读取…" : "导入已有简历" }}</text>
      <text>PDF / DOCX</text>
    </button>
    <view v-if="overview.partialError" class="qs-error">
      {{ overview.partialError }}
      <button :id="buttonRippleId(2)" :style="buttonRippleStyle(2)" @touchstart="startButtonRipple($event, 2)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 2); load()">重试</button>
    </view>
    <view v-if="error" class="qs-error">
      {{ error }}
      <button :id="buttonRippleId(3)" :style="buttonRippleStyle(3)" @touchstart="startButtonRipple($event, 3)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 3); load()">重试</button>
    </view>
    <view v-if="loading" class="qs-state">正在读取简历…</view>
    <template v-if="document?.body">
      <view class="resume-info">
        <text>当前简历</text>
        <text class="qs-row-note">
          {{ document.target?.title || document.header.headline }}
          <text v-if="document.updated_at">
            · {{ formatTime(document.updated_at) }}
          </text>
        </text>
      </view>
      <view class="resume-paper">
        <text class="resume-name">
          {{ document.header.name || "姓名待补充" }}
        </text>
        <text class="resume-headline">{{ document.header.headline }}</text>
        <text class="resume-contact">{{ document.header.contact }}</text>
        <text v-if="document.body.summary.text" class="resume-summary">
          {{ document.body.summary.text }}
        </text>
        <view
          v-for="section in document.body.sections"
          :key="section.kind"
          class="resume-section"
        >
          <text class="resume-section-title">
            {{ sectionLabel(section.kind) }}
          </text>
          <view
            v-for="(entry, index) in section.entries"
            :key="index"
            class="resume-entry"
          >
            <view>
              <text>{{ entry.title }}</text>
              <text>{{ entry.period }}</text>
            </view>
            <text class="resume-subtitle">{{ entry.subtitle }}</text>
            <text
              v-for="(bullet, i) in entry.bullets"
              :key="i"
              class="resume-bullet"
            >
              • {{ bullet }}
            </text>
          </view>
        </view>
      </view>
      <view v-if="document.questions?.length" class="resume-questions qs-card qs-motion-block">
        <text>还需要你补充</text>
        <text v-for="question in document.questions" :key="question">
          {{ question }}
        </text>
      </view>
    </template>
    <view v-else-if="!loading" class="qs-state">
      <image :src="assets.resume" />
      <text>把真实经历，整理成适合你的简历。</text>
    </view>
    <text v-if="files.length" class="qs-section-title">简历成果文件</text>
    <FileRow v-for="file in files" :key="file.id" :file="file" />
    <button :id="buttonRippleId(4)" :style="buttonRippleStyle(4)" @touchstart="startButtonRipple($event, 4)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-button qs-button--primary qs-bottom-action qs-tap-target" @click="startButtonRipple($event, 4); edit()">
      {{ document?.body ? "继续和穗奈优化" : "和穗奈整理第一份简历" }}
    </button>
    <button
      :id="buttonRippleId(5)"
      :style="buttonRippleStyle(5)"
      @touchstart="startButtonRipple($event, 5)"
      hover-class="button-hover"
      hover-stop-propagation
      :hover-start-time="0"
      :hover-stay-time="110"
      v-if="document?.body"
      class="qs-button qs-bottom-action qs-tap-target"
      @click="startButtonRipple($event, 5); exportResume()"
    >
      请穗奈排版并导出
    </button>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  request,
  hasToken,
  goToAuth,
  type ResumeDocument,
  type Artifact,
} from "../../services/api";
import {
  careerSource,
  setCareerSource,
  openCareerChat,
} from "../../services/career-context";
import { formatTime, errorText } from "../../services/workspace";
import { assetPaths } from "../../static/assets";
import CareerSource from "../../components/CareerSource.vue";
import FileRow from "../../components/FileRow.vue";
import { overview, loadOverview } from "../../services/overview";
import { chooseAttachment } from "../../services/files";
const pageMotionClass = usePageMotion();
const assets = assetPaths.prototype,
  source = ref(careerSource()),
  document = ref<ResumeDocument | null>(null),
  files = ref<Artifact[]>([]),
  error = ref(""),
  loading = ref(false),
  importing = ref(false);
let generation = 0;
onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  source.value = careerSource();
  void load();
});
async function load() {
  const current = ++generation;
  const requestedSource = source.value;
  loading.value = true;
  error.value = "";
  try {
    await loadOverview();
    if (current !== generation) return;
    if (overview.error) throw new Error(overview.error);
    const snapshots = Object.values(overview.snapshots).filter((s) =>
      requestedSource === "cloud"
        ? s.conversation.target !== "pc"
        : s.conversation.device_id === requestedSource,
    );
    files.value = snapshots
      .flatMap((s) =>
        (s.files ?? []).map((f) => ({ ...f, session_id: s.conversation.id })),
      )
      .filter((f) => f.kind === "output" && /简历|resume/i.test(f.name))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (requestedSource === "cloud") {
      const next = await request<ResumeDocument>("/api/v1/agent/resume");
      if (current !== generation) return;
      document.value = next;
    } else
      document.value =
        snapshots
          .filter((s) => s?.resume?.body)
          .map((s) => s!.resume!)
          .sort((a, b) =>
            (b.updated_at || "").localeCompare(a.updated_at || ""),
          )[0] ?? null;
  } catch (e) {
    if (current === generation) error.value = errorText(e);
  } finally {
    if (current === generation) loading.value = false;
  }
}
function changeSource(value: string) {
  source.value = value;
  setCareerSource(value);
  document.value = null;
  files.value = [];
  void load();
}
function edit() {
  openCareerChat(
    document.value?.body
      ? `我想继续优化已有简历，目标是：${document.value.target?.title || document.value.header.headline || "一起核对"}。请先问我最值得补充的一项信息，保持经历真实。`
      : "我想从真实经历开始制作简历。请通过对话逐步引导我，不要一次要求我填写所有信息。",
    source.value,
  );
}
function exportResume() {
  openCareerChat(
    `请基于已确认的简历内容进行排版和导出。目标岗位：${document.value?.target?.title || document.value?.header.headline || "待确认"}。先和我确认适合的版式，再输出可下载的文件，不添加未经确认的经历。`,
    source.value,
  );
}
async function importResume() {
  if (importing.value) return;
  importing.value = true;
  try {
    const file = await chooseAttachment();
    openCareerChat(
      "请先阅读这份简历，整理我的真实经历与技能，列出需要核对的信息，再结合目标岗位一起改进。不要虚构经历或数字。",
      source.value,
      file,
    );
  } catch (e) {
    const text = errorText(e);
    if (!/cancel|取消/i.test(text)) error.value = text;
  } finally {
    importing.value = false;
  }
}
function sectionLabel(kind: string) {
  return (
    {
      education: "教育背景",
      experience: "工作与实习",
      projects: "项目经历",
      skills: "专业技能",
    }[kind] || kind
  );
}
</script>
<style lang="scss">
.resume-import {
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 100%;
  padding: 24rpx;
  margin: 24rpx 0;
  background: var(--qs-paper);
  text-align: left;
  color: var(--qs-ink);
  font-size: 27rpx;
  line-height: 1.5;
}
.resume-import image {
  width: 40rpx;
  height: 40rpx;
}
.resume-import > text:first-of-type {
  flex: 1;
}
.resume-import > text:last-child {
  font-size: 23rpx;
  color: var(--qs-muted);
}

.resume-info {
  margin-bottom: 25rpx;
  font-size: 30rpx;
}
.resume-paper {
  padding: 40rpx 30rpx;
  background: #fffefa;
  color: #322d50;
  border: 1rpx solid #dfd9e8;
  box-shadow: 0 8rpx 28rpx rgba(58, 42, 82, 0.07);
  border-radius: 6rpx;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.resume-name {
  display: block;
  font-size: 43rpx;
  font-weight: 600;
}
.resume-headline {
  display: block;
  font-size: 28rpx;
  margin-top: 10rpx;
}
.resume-contact {
  display: block;
  font-size: 22rpx;
  color: #817b91;
  margin: 12rpx 0 28rpx;
  word-break: break-all;
}
.resume-summary {
  display: block;
  font-size: 25rpx;
  line-height: 1.8;
  margin-bottom: 25rpx;
}
.resume-section {
  margin-top: 28rpx;
}
.resume-section-title {
  display: block;
  border-bottom: 2rpx solid #d6cce3;
  padding-bottom: 10rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.resume-entry {
  margin-top: 22rpx;
}
.resume-entry > view {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  font-size: 25rpx;
  font-weight: 500;
  line-height: 1.6;
}
.resume-entry > view > text:last-child {
  font-size: 21rpx;
  flex: none;
  font-weight: 400;
}
.resume-subtitle {
  display: block;
  font-size: 23rpx;
  color: #817b91;
  margin: 8rpx 0;
}
.resume-bullet {
  display: block;
  font-size: 24rpx;
  line-height: 1.85;
  margin-top: 7rpx;
}
.resume-questions {
  padding: 25rpx;
  margin-top: 24rpx;
}
.resume-questions > text {
  display: block;
  font-size: 25rpx;
  line-height: 1.8;
  margin-top: 10rpx;
}
</style>
