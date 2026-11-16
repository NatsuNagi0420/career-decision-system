<!-- 青穗集 · 状态首页：统一像素字形、卡片入场与背景点阵位移，保留原业务和同步边界。 -->
<template>
  <view @touchstart="startSurfaceRipple($event)" @click="startSurfaceRipple($event)" :class="pageMotionClass" class="qs-page qs-page--tab session-page">
    <DotBackground :ripples="surfaceRipples" />
    <!-- #ifdef MP-WEIXIN -->
    <view
      class="qs-page-frame"
      :style="pageFrameReady ? 'display: none;' : ''"
      aria-hidden="true"
    >
      <text class="qs-page-frame-title">青穗集</text>
      <view class="qs-page-frame-card" />
      <view class="qs-page-frame-line" />
      <view class="qs-page-frame-line qs-page-frame-line--short" />
    </view>
    <!-- #endif -->
    <AppHeader title="青穗集" brand>
      <button
        :id="buttonRippleId(1)"
        :style="buttonRippleStyle(1)"
        @touchstart="startButtonRipple($event, 1)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-icon-button qs-tap-target"
        aria-label="搜索对话"
        @click="startButtonRipple($event, 1); toggleSearch()"
      >
        <image :src="assets.search" />
      </button>
      <button
        :id="buttonRippleId(2)"
        :style="buttonRippleStyle(2)"
        @touchstart="startButtonRipple($event, 2)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-icon-button qs-tap-target"
        aria-label="首页更多选项"
        @click="startButtonRipple($event, 2); listMenu()"
      >
        <image :src="assets.more" />
      </button>
    </AppHeader>
    <HomeCareerOverview
      v-if="!historyMode"
      :career="career"
      :summary="summary"
      :date-label="dateLabel"
      :loading="careerLoading"
      :error="careerError"
      @retry="loadCareer"
      @goal="openGoal"
      @next="openNext"
      @detail="openAction"
      @progress="openGrowth"
      @profile="navigate('/pages/profile/index')"
      @directions="navigate('/pages/directions/index')"
    >
      <template #source>
        <picker :range="sourceOptions.map((item) => item.name)" :value="sourceIndex" @change="changeSource">
          <view hover-class="qs-pressed" :hover-start-time="0" :hover-stay-time="110" class="home-source-select qs-press">{{ sourceOptions[sourceIndex].name }}<text>⌄</text></view>
        </picker>
      </template>
    </HomeCareerOverview>
    <CareerJourney v-if="!historyMode && career" :career="career" :source="source" />
    <view v-if="!historyMode" class="home-conversation-bridge qs-motion-block qs-motion-step-3">
      <button :id="buttonRippleId(3)" :style="buttonRippleStyle(3)" @touchstart="startButtonRipple($event, 3, undefined, overview.busy && !overview.ready)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="home-continue-button qs-tap-target" :disabled="overview.busy && !overview.ready" @click="startButtonRipple($event, 3, undefined, overview.busy && !overview.ready); continueConversation()">
        <view class="home-continue-icon qs-action-icon"><image :src="assets.navChat" /></view>
        <view class="home-continue-copy"><text class="home-continue-label">{{ companionSession ? '继续上次对话' : '和穗奈聊聊' }}</text><text class="home-continue-title">{{ companionSession?.title || '想到什么，都可以说说' }}</text></view>
        <text class="home-continue-arrow qs-action-arrow">›</text>
      </button>
      <button :id="buttonRippleId(4)" :style="buttonRippleStyle(4)" @touchstart="startButtonRipple($event, 4)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-icon-button home-history-button qs-tap-target" aria-label="新建对话" @click="startButtonRipple($event, 4); start()"><image :src="assets.plus" /></button>
    </view>
    <view v-if="!historyMode && (recentFiles.length || summary?.result)" class="home-recent-results qs-motion-block qs-motion-step-3">
      <view class="home-section-heading"><text>最近成果</text></view>
      <FileRow v-for="file in recentFiles" :key="file.id" :file="file" />
      <button :id="buttonRippleId(5)" :style="buttonRippleStyle(5)" @touchstart="startButtonRipple($event, 5)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" v-if="summary?.result" class="home-action-result qs-tap-target" @click="startButtonRipple($event, 5); openAction(summary.result.id)"><image :src="assets.checkCircle" /><view><text class="home-result-title">{{ summary.result.title }}</text><text class="home-result-copy">{{ summary.result.result }}</text></view><text class="home-continue-arrow qs-action-arrow">›</text></button>
    </view>
    <view v-if="!historyMode" class="mobile-brief qs-motion-block qs-motion-later">
      <button :id="buttonRippleId(6)" :style="buttonRippleStyle(6)" @touchstart="startButtonRipple($event, 6)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="brief-attention qs-tap-target" @click="startButtonRipple($event, 6); openTaskList('attention')">
        <view
          class="brief-symbol"
          :class="attention.length ? 'brief-symbol--attention' : ''"
        >
          <image :src="assets.star" />
        </view>
        <view>
          <text>{{ attentionTitle }}</text>
        </view>
        <text class="qs-chevron">›</text>
      </button>
      <button :id="buttonRippleId(7)" :style="buttonRippleStyle(7)" @touchstart="startButtonRipple($event, 7)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="brief-devices qs-tap-target" @click="startButtonRipple($event, 7); openDevices()">
        <view class="brief-symbol"><image :src="assets.computer" /></view>
        <view>
          <text>
            {{
              overview.devicesReady
                ? onlineDevices.length
                  ? onlineDevices.length + " 台电脑在线"
                  : devices.length
                    ? "电脑暂时离线"
                    : "连接我的电脑"
                : "设备状态待同步"
            }}
          </text>
        </view>
        <view
          class="connection-dot"
          :class="
            overview.devicesReady && onlineDevices.length
              ? 'connection-dot--online'
              : ''
          "
        />
      </button>
    </view>
    <view v-if="!historyMode" class="home-bottom-actions"><button :id="buttonRippleId(8)" :style="buttonRippleStyle(8)" @touchstart="startButtonRipple($event, 8)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 8); historyOpen = true">全部对话 <text>›</text></button></view>
    <view v-if="overview.error" class="qs-error">{{ overview.error }}<button :id="buttonRippleId(9)" :style="buttonRippleStyle(9)" @touchstart="startButtonRipple($event, 9)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 9); refresh(true)">重试</button></view>
    <view v-if="overview.partialError" class="qs-error">{{ overview.partialError }}<button :id="buttonRippleId(10)" :style="buttonRippleStyle(10)" @touchstart="startButtonRipple($event, 10)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 10); refresh(true)">重试同步</button></view>
    <view v-if="historyMode" class="home-history">
    <view class="home-history-heading"><button :id="buttonRippleId(11)" :style="buttonRippleStyle(11)" @touchstart="startButtonRipple($event, 11)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="home-history-back qs-tap-target" @click="startButtonRipple($event, 11); closeHistory()">‹ 首页</button><text>{{ archived ? '已归档对话' : '全部对话' }}</text><button :id="buttonRippleId(12)" :style="buttonRippleStyle(12)" @touchstart="startButtonRipple($event, 12)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-icon-button qs-tap-target" aria-label="新建对话" @click="startButtonRipple($event, 12); start()"><image :src="assets.plus" /></button></view>
    <view v-if="searchOpen" class="search-field qs-reveal">
      <image :src="assets.search" />
      <input v-model="query" placeholder="搜索对话名称" focus />
      <button :id="buttonRippleId(13)" :style="buttonRippleStyle(13)" @touchstart="startButtonRipple($event, 13)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" v-if="query" @click="startButtonRipple($event, 13); query = ''" aria-label="清空搜索">×</button>
    </view>
    <view v-if="archived" class="archive-bar">
      <text>已归档对话</text>
      <button :id="buttonRippleId(14)" :style="buttonRippleStyle(14)" @touchstart="startButtonRipple($event, 14)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 14); archived = false">返回最近对话</button>
    </view>
    <view class="home-section-heading"
      ><text>{{ archived ? "归档对话" : "最近对话" }}</text
      ><text class="home-session-count">{{ filtered.length }}</text></view
    >
    <MotionTabs v-model="filter" :options="filters" label="对话来源" />
    <picker
      v-if="filter === 'pc' && devices.length > 1"
      :range="['所有电脑', ...devices.map((d) => d.name)]"
      @change="deviceIndex = Number(($event as any).detail.value)"
    >
      <view hover-class="qs-pressed" :hover-start-time="0" :hover-stay-time="110" class="qs-chip qs-press">
        {{ deviceIndex ? devices[deviceIndex - 1]?.name : "所有电脑" }} ⌄
      </view>
    </picker>
    <view
      v-if="overview.busy && !overview.ready"
      class="overview-sync"
      role="status"
    >
      <view class="overview-sync-dot" />
      <text>
        {{
          overview.total
            ? "正在检查待办 " + overview.scanned + " / " + overview.total
            : "正在同步…"
        }}
      </text>
    </view>
    <LoadingSkeleton v-if="overview.busy && !overview.ready" />
    <view v-else-if="!filtered.length" class="qs-state qs-reveal">
      <image :src="assets.navChat" mode="aspectFit" />
      <text>
        {{
          query
            ? "没有找到这段对话"
            : archived
              ? "还没有归档的对话"
              : "想到什么，都可以和穗奈聊聊。"
        }}
      </text>
      <view v-if="!query && !archived" class="empty-starters">
        <button :id="buttonRippleId(15, [text])" :style="buttonRippleStyle(15, [text])" @touchstart="startButtonRipple($event, 15, [text])" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" v-for="text in starters" :key="text" @click="startButtonRipple($event, 15, [text]); start(text)">
          {{ text }} ↗
        </button>
      </view>
    </view>
    <view class="session-list">
      <view
        :hover-start-time="0"
        v-for="(item, index) in filtered"
        :key="item.id"
        class="session-row qs-press"
        :class="index < 6 ? 'qs-motion-block' : ''"
        :style="{ '--qs-enter-delay': Math.min(index, 3) * 28 + 'ms' }"
        hover-class="qs-pressed"
        :hover-stay-time="120"
        @click="openConversation(item.id)"
        @longpress="menu(item)"
      >
        <view
          class="session-icon qs-action-icon"
          :class="item.target === 'pc' ? 'session-icon--pc' : ''"
        >
          <image
            :src="item.target === 'pc' ? assets.computer : assets.navChat"
            mode="aspectFit"
          />
        </view>
        <view class="session-main">
          <view class="session-heading">
            <text class="session-title">{{ item.title }}</text>
            <text class="session-time">{{ formatTime(item.updated_at) }}</text>
          </view>
          <text class="session-preview">{{ preview(item) }}</text>
          <view class="session-meta">
            <text>{{ sourceLabel(item, overview.devices) }}</text>
            <text v-if="latest(item)" class="session-task-state">
              {{ taskLabels[latest(item)!.status] }}
            </text>
          </view>
        </view>
        <button
          :id="buttonRippleId(16, [item.id])"
          :style="buttonRippleStyle(16, [item.id])"
          @touchstart="startButtonRipple($event, 16, [item.id])"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="session-more qs-icon-button qs-tap-target"
          aria-label="会话操作"
          @click.stop="startButtonRipple($event, 16, [item.id]); menu(item)"
        >
          <image :src="assets.more" />
        </button>
      </view>
    </view>

    <view class="qs-dock">
      <button
        :id="buttonRippleId(17)"
        :style="buttonRippleStyle(17)"
        @touchstart="startButtonRipple($event, 17)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-button qs-button--primary qs-bottom-action qs-tap-target"
        @click="startButtonRipple($event, 17); start()"
      >
        <image :src="assets.navChat" />
        开始对话
      </button>
    </view>
    </view>
    <RemoteDevices
      v-if="sourceOpen"
      @close="sourceOpen = false"
      @created="created"
    />
  </view>
</template>
<script setup lang="ts">
import DotBackground from "../../components/DotBackground.vue";
import { useSurfaceRipple } from "../../services/surface-ripple";
const { surfaceRipples, startSurfaceRipple } = useSurfaceRipple();
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { useTabPageFrame } from "../../services/tab-page-frame";
import { computed, ref, shallowRef } from "vue";
import {
  onShow,
  onHide,
  onPullDownRefresh,
  onShareAppMessage,
} from "@dcloudio/uni-app";
import { careerApi, getToken, goToAuth, hasToken, type CareerView, type Conversation } from "../../services/api";
import { careerSource, setCareerSource, openCareerChat } from "../../services/career-context";
import { growthSummary } from "../../services/growth-summary";
import {
  overview,
  loadOverview,
  ensureOverviewAccount,
} from "../../services/overview";
import {
  conversationMenu,
  openConversation,
} from "../../services/conversations";
import {
  sourceLabel,
  formatTime,
  tasksFromSnapshot,
  taskLabels,
  attentionStatus,
  activeStatus,
  errorText,
} from "../../services/workspace";
import { syncTabBarHighlight } from "../../services/tabbar";
import { assetPaths } from "../../static/assets";
import RemoteDevices from "../../components/RemoteDevices.vue";
import AppHeader from "../../components/AppHeader.vue";
import HomeCareerOverview from "../../components/HomeCareerOverview.vue";
import CareerJourney from "../../components/CareerJourney.vue";
import MotionTabs from "../../components/MotionTabs.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
import FileRow from "../../components/FileRow.vue";
import { openTaskList } from "../../services/task-navigation";
const pageMotionClass = usePageMotion();
const pageFrameReady = useTabPageFrame();
const assets = assetPaths.prototype;
const filter = ref("all"),
  deviceIndex = ref(0),
  query = ref(""),
  searchOpen = ref(false),
  historyOpen = ref(false),
  archived = ref(false),
  sourceOpen = ref(false),
  starter = ref("");
const source = ref(careerSource()),
  careerSnapshot = shallowRef<{ career: CareerView; summary: ReturnType<typeof growthSummary> } | null>(null),
  careerLoading = ref(true),
  careerError = ref(""),
  dateLabel = ref("");
const career = computed(() => careerSnapshot.value?.career ?? null);
const summary = computed(() => careerSnapshot.value?.summary ?? null);
const historyMode = computed(() => historyOpen.value || searchOpen.value || archived.value);
let careerOwner: string | null = null,
  careerGeneration = 0,
  careerLoadedAt = 0,
  careerInFlight: Promise<void> | null = null;
let visible = false,
  refreshGeneration = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
const filters = [
  { key: "all", text: "全部" },
  { key: "cloud", text: "云端" },
  { key: "pc", text: "我的电脑" },
];
const starters = ["我不知道适合什么", "帮我梳理一段经历"];
const devices = computed(() =>
  overview.devices.filter((d) => d.status === "active"),
);
const sourceOptions = computed(() => {
  const options = [{ id: "cloud", name: "云端资料" }, ...devices.value.map(device => ({ id: device.id, name: device.name + " · 已同步资料" }))];
  if (!options.some(item => item.id === source.value)) options.push({ id: source.value, name: "电脑资料 · 已同步" });
  return options;
});
const sourceIndex = computed(() => Math.max(0, sourceOptions.value.findIndex(item => item.id === source.value)));
const onlineDevices = computed(() => devices.value.filter((d) => d.online));
const attentionTitle = computed(() =>
  attention.value.length
    ? (overview.complete ? "" : "至少 ") + attention.value.length + " 项待确认"
    : overview.complete
      ? "暂无待确认"
      : overview.busy
        ? "正在查待办…"
        : "待办尚未同步",
);
const recentFiles = computed(() =>
  Object.values(overview.snapshots)
    .flatMap((s) =>
      (s.files ?? [])
        .filter((f) => f.kind === "output")
        .map((f) => ({ ...f, session_id: s.conversation.id })),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 2),
);
const filtered = computed(() =>
  overview.sessions.filter(
    (s) =>
      Boolean(s.archived) === archived.value &&
      (filter.value === "all" || s.target === filter.value) &&
      (filter.value !== "pc" ||
        !deviceIndex.value ||
        s.device_id === devices.value[deviceIndex.value - 1]?.id) &&
      s.title.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
const attention = computed(() =>
  Object.values(overview.snapshots)
    .flatMap(tasksFromSnapshot)
    .filter((t) => attentionStatus(t.status)),
);
const companionSession = computed(
  () =>
    overview.sessions.filter(item => !item.archived).sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    )[0],
);
function continueConversation() {
  if (companionSession.value) openConversation(companionSession.value.id);
  else start();
}
onShow(() => {
  visible = true;
  syncTabBarHighlight();
  ensureOverviewAccount();
  const nextOwner = getToken(), nextSource = careerSource();
  if (nextOwner !== careerOwner || nextSource !== source.value) {
    careerSnapshot.value = null;
    careerError.value = "";
    careerLoadedAt = 0;
    careerGeneration++;
    careerInFlight = null;
  }
  careerOwner = nextOwner;
  source.value = nextSource;
  const date = new Date();
  dateLabel.value = `${date.getMonth() + 1}月${date.getDate()}日 · 周${"日一二三四五六"[date.getDay()]}`;
  if (!hasToken()) {
    goToAuth();
    return;
  }
  void refresh(false, true);
});
onHide(() => {
  visible = false;
  refreshGeneration++;
  if (timer) clearTimeout(timer);
  sourceOpen.value = false;
});
onPullDownRefresh(async () => {
  try {
    await refresh(true);
  } finally {
    uni.stopPullDownRefresh();
  }
});
onShareAppMessage(() => ({
  title: "青穗集 · 今天，向目标靠近一点",
  path: "/pages/home/index",
}));
async function refresh(force = false, careerForce = false) {
  const current = ++refreshGeneration;
  if (timer) clearTimeout(timer);
  await Promise.all([loadOverview(true, force), loadCareer(force || careerForce)]);
  if (visible && current === refreshGeneration)
    timer = setTimeout(
      () => refresh(),
      Object.values(overview.snapshots).some((s) =>
        tasksFromSnapshot(s).some((t) => activeStatus(t.status)),
      )
        ? 6000
        : 30000,
    );
}
async function loadCareer(force = true): Promise<void> {
  if (!getToken()) return;
  if (careerInFlight && !force) return careerInFlight;
  if (!force && careerSnapshot.value && Date.now() - careerLoadedAt < 20000) return;
  const current = ++careerGeneration, requestOwner = getToken(), requestSource = source.value;
  const valid = () => current === careerGeneration && requestOwner === getToken() && requestSource === source.value;
  careerLoading.value = true;
  careerError.value = "";
  const job = (async () => {
    try {
      const value = await careerApi.view(requestSource);
      if (typeof value?.profile?.goal !== "string") throw new Error("职业资料暂时无法显示，请重试。");
      const nextSummary = growthSummary(value);
      if (nextSummary.next && typeof nextSummary.next.deliverable !== "string") throw new Error("职业资料暂时无法显示，请重试。");
      if (valid()) {
        careerSnapshot.value = { career: value, summary: nextSummary };
        careerLoadedAt = Date.now();
      }
    } catch (error) {
      if (valid()) careerError.value = errorText(error);
    } finally {
      if (current === careerGeneration) {
        careerLoading.value = false;
        careerInFlight = null;
      }
    }
  })();
  careerInFlight = job;
  return job;
}
function changeSource(event: unknown) {
  const selected = sourceOptions.value[Number((event as { detail: { value: string } }).detail.value)];
  if (!selected || selected.id === source.value) return;
  source.value = selected.id;
  setCareerSource(selected.id);
  careerSnapshot.value = null;
  careerLoadedAt = 0;
  void loadCareer();
}
function navigate(url: string) { uni.navigateTo({ url }); }
function openGrowth() { uni.switchTab({ url: "/pages/growth/index" }); }
function openAction(id: string) { navigate("/pages/action/index?id=" + encodeURIComponent(id)); }
function openGoal() {
  const goal = career.value?.profile.goal.trim();
  openCareerChat(goal ? `我目前的目标是：${goal}。请结合我的已确认资料，与我核对方向和下一步，一次只问一件重要的事。` : "我还没有确定职业方向。请从我做过的事情和偏好开始，一次只引导我补充一件重要的信息，帮我发现适合自己的方向。", source.value);
}
function openNext() {
  if (!career.value || !summary.value) return;
  const action = summary.value.next;
  if (action) {
    openCareerChat(`我想继续这项行动：${action.title}\n当前目标：${career.value.profile.goal || "尚在探索"}\n${summary.value.relatedJob ? "关联岗位：" + summary.value.relatedJob.title + "\n" : ""}原因：${action.why}\n要学什么：${action.learn}\n交付物：${action.deliverable}\n目前进展：${action.result || "尚未补充"}\n请结合我已确认的经历，先带我完成一个具体步骤，不要虚构成果。`, source.value);
  } else if (summary.value.allDone) {
    openCareerChat("我已完成现有行动。请结合我记录的实际成果，和我一起回顾，再确定下一步；不把行动完成比例当作能力评分。", source.value);
  } else if (career.value.profile.goal.trim()) {
    openCareerChat(`我的目标是：${career.value.profile.goal}。请结合已确认的经历和岗位要求，和我一起确定下一项能动手完成的行动；先问最必要的一个问题。`, source.value);
  } else {
    openCareerChat("我想先梳理一段真实经历，慢慢探索适合的职业方向。请一次只问一个问题，先问我做过什么，再引导我讲清楚职责和结果，不要编造经历。", source.value);
  }
}
function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) historyOpen.value = true;
}
function closeHistory() {
  historyOpen.value = false;
  searchOpen.value = false;
  archived.value = false;
  query.value = "";
}
function openDevices() {
  uni.navigateTo({ url: "/pages/devices/index" });
}

function preview(item: Conversation) {
  const message = [...(overview.snapshots[item.id]?.messages ?? [])]
    .reverse()
    .find((m) => m.role === "user" || m.role === "assistant");
  return message
    ? `${message.role === "assistant" ? "穗奈" : "我"}：${message.content.replace(/[#*`]/g, "").replace(/\s+/g, " ").slice(0, 70)}`
    : "打开继续对话";
}
function latest(item: Conversation) {
  const snapshot = overview.snapshots[item.id];
  if (!snapshot) return null;
  const task = tasksFromSnapshot(snapshot).at(-1);
  return task &&
    [
      "running",
      "queued",
      "waiting_pc",
      "awaiting_approval",
      "waiting_input",
      "paused",
    ].includes(task.status)
    ? task
    : null;
}
async function menu(item: Conversation) {
  try {
    if (await conversationMenu(item)) await refresh(true);
  } catch (e) {
    uni.showToast({ title: errorText(e), icon: "none" });
  }
}
function listMenu() {
  uni.showActionSheet({
    itemList: ["全部对话", "已归档对话", "设备与同步"],
    success: (r) => {
      if (r.tapIndex < 2) {
        historyOpen.value = true;
        archived.value = r.tapIndex === 1;
        searchOpen.value = false;
        query.value = "";
      }
      else uni.navigateTo({ url: "/pages/devices/index" });
    },
  });
}
function start(text = "") {
  starter.value = text;
  sourceOpen.value = true;
}
function created(item: Conversation) {
  sourceOpen.value = false;
  if (starter.value) uni.setStorageSync("qingsui.chat.starter", starter.value);
  starter.value = "";
  openConversation(item.id);
}
</script>
<style lang="scss">
.session-page {
  padding-top: 0;
}
.mobile-brief {
  display: flex;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.mobile-brief > button {
  display: flex;
  align-items: center;
  gap: 12rpx;
  width: calc(50% - 6rpx);
  min-width: 0;
  margin: 0;
  padding: 18rpx 15rpx;
  border: 1rpx solid #e8e1ee;
  border-radius: $qs-radius-control;
  background: #fffdfa;
  text-align: left;
  line-height: 1.4;
  color: #665a72;
  font-size: 23rpx;
}
.mobile-brief > button > view:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.brief-symbol {
  width: 43rpx;
  height: 43rpx;
  flex: none;
}
.brief-symbol image {
  width: 100%;
  height: 100%;
}
.brief-symbol--attention {
  background: #fcf0d6;
  border-radius: 12rpx;
}
.mobile-brief .qs-chevron {
  font-size: 27rpx;
}
.connection-dot {
  width: 10rpx;
  height: 10rpx;
  flex: none;
  background: #b8b1be;
  border-radius: 50%;
}
.connection-dot--online {
  background: #6c9d83;
  box-shadow: 0 0 0 5rpx #edf4ef;
}
.home-source-select { display:flex; align-items:center; gap:10rpx; max-width:450rpx; min-height:44rpx; color:var(--qs-muted); @include qs-ui-type($qs-type-label); line-height:1.5; word-break:break-word; }
.home-source-select text { flex:none; }
.home-conversation-bridge { display:flex; align-items:center; gap:14rpx; margin:30rpx 0; }
.home-continue-button { display:flex; align-items:center; gap:18rpx; flex:1; min-width:0; margin:0; padding:0; background:transparent; text-align:left; line-height:1.5; }
.home-continue-icon { display:flex; align-items:center; justify-content:center; flex:none; width:76rpx; height:76rpx; border-radius:$qs-radius-control; background:#eee8f5; }
.home-continue-icon image { width:44rpx; height:44rpx; }
.home-continue-copy { flex:1; min-width:0; }
.home-continue-label { display:block; color:var(--qs-muted); @include qs-ui-type($qs-type-label); }
.home-continue-title { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:4rpx; color:var(--qs-ink); font-family:$qingsui-font; font-size:$qs-type-body; font-weight:400; }
.home-continue-arrow { flex:none; color:var(--qs-muted); font-size:35rpx; }
.home-history-button { width:66rpx; height:70rpx; padding:17rpx; border-left:1rpx solid var(--qs-lilac); border-radius:0; }
.home-recent-results { margin:30rpx 0; }
.home-action-result { display:flex; align-items:center; gap:18rpx; width:100%; margin:16rpx 0 0; padding:22rpx; border:1rpx solid var(--qs-lilac); border-radius:$qs-radius-card; box-shadow:$qs-shadow-card; background:var(--qs-paper); text-align:left; line-height:1.5; }
.home-action-result image { flex:none; width:43rpx; height:43rpx; }
.home-action-result > view { flex:1; min-width:0; }
.home-result-title { font-family:$qingsui-font; display:block; color:var(--qs-ink); font-size:26rpx; word-break:break-word; }
.home-result-copy { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:7rpx; color:var(--qs-muted); font-size:24rpx; }
.home-bottom-actions { display:flex; justify-content:space-between; align-items:center; margin:18rpx 0 0; }
.home-bottom-actions button { display:flex; align-items:center; gap:7rpx; min-height:64rpx; margin:0; padding:6rpx 4rpx; color:#7b668c; background:transparent; font-size:25rpx; line-height:1.5; }
.home-bottom-actions image { width:27rpx; height:27rpx; }
.home-history-heading { display:flex; align-items:center; justify-content:space-between; gap:16rpx; margin-bottom:20rpx; color:var(--qs-ink); @include qs-ui-type($qs-type-section); }
.home-history-back { margin:0; padding:12rpx 0; background:transparent; color:#7b668c; font-size:25rpx; font-weight:400; line-height:1.4; }
.home-section-heading {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin: 6rpx 0 16rpx;
  color: var(--qs-ink);
  @include qs-ui-type($qs-type-section);
}
.home-session-count {
  font-size: 21rpx;
  font-weight: 400;
  color: #a395ae;
}
.session-list {
  margin-top: 8rpx;
}
.session-row {
  display: flex;
  align-items: center;
  gap: 22rpx;
  padding: 25rpx 0;
  border-bottom: 1rpx solid #ede9f0;
  transition: background-color 0.18s, transform 0.34s cubic-bezier(0.18, 0.9, 0.3, 1.45);
}
.session-row.qs-pressed,
.session-row:active {
  background-color: var(--qs-paper-soft);
}
.session-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 78rpx;
  height: 78rpx;
  border: 1rpx solid #e1d9ef;
  border-radius: $qs-radius-control;
  background: linear-gradient(135deg, #f0e8fa, #e6ddef);
}
.session-icon--pc {
  background: linear-gradient(135deg, #f4f3f8, #eae6f1);
  border-color: #e2ddea;
}
.session-icon image {
  width: 47rpx;
  height: 47rpx;
}
.session-main {
  flex: 1;
  min-width: 0;
}
.session-heading {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: center;
}
.session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: $qingsui-font;
  font-size: $qs-type-body;
  font-weight:400;
  color: #40374f;
}
.session-time {
  flex: none;
  font-size: 24rpx;
  color: var(--qs-muted);
  font-variant-numeric: tabular-nums;
}
.session-preview {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 25rpx;
  color: var(--qs-muted);
  margin-top: 10rpx;
  line-height: 1.5;
}
.session-meta {
  display: flex;
  gap: 16rpx;
  justify-content: space-between;
  margin-top: 9rpx;
  font-size: 24rpx;
  color: var(--qs-muted);
  line-height: 1.4;
}
.session-meta > text:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-task-state {
  flex: none;
  color: #947c4b;
}
.session-more {
  width: 32rpx;
  height: 62rpx;
  padding: 10rpx 4rpx;
  opacity: 0.55;
}
.search-field {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 20rpx 22rpx;
  margin-bottom: 24rpx;
  border: 1rpx solid #e5deee;
  border-radius: $qs-radius-control;
  background: #fffefc;
}
.search-field image {
  width: 30rpx;
  height: 30rpx;
}
.search-field input {
  flex: 1;
  min-width: 0;
  font-size: 27rpx;
}
.search-field button {
  margin: 0;
  padding: 0 10rpx;
  background: transparent;
  font-size: 28rpx;
}
.archive-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
  font-size: 28rpx;
}
.archive-bar button {
  margin: 0;
  padding: 8rpx;
  background: transparent;
  color: #8064af;
  font-size: 24rpx;
}
.empty-starters {
  margin-top: 25rpx;
}
.empty-starters button {
  padding: 16rpx;
  color: var(--qs-muted);
  background: transparent;
  font-size: 25rpx;
}
</style>
