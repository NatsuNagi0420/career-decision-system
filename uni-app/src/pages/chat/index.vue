<!-- 青穗集 · 独立会话详情：保持跨端上下文、真实任务状态、文件交付和安全消息排版。 -->
<template>
  <view :class="pageMotionClass" class="chat-screen" :style="{ '--qs-chat-size': textSize }">
    <AppHeader
      :title="conversation?.title || '和穗奈聊聊'"
      :subtitle="
        conversation ? sourceLabel(conversation, devices) : '选择执行位置'
      "
      back
      compact
      @context="showContext"
    >
      <button
        :id="buttonRippleId(1)"
        :style="buttonRippleStyle(1)"
        @touchstart="startButtonRipple($event, 1, undefined, !conversation || submitting)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="qs-icon-button qs-tap-target"
        aria-label="会话操作"
        :disabled="!conversation || submitting"
        @click="startButtonRipple($event, 1, undefined, !conversation || submitting); menu()"
      >
        <image :src="assets.more" />
      </button>
    </AppHeader>
    <view v-if="conversation?.archived" class="chat-notice">
      这段对话已归档
      <button :id="buttonRippleId(2)" :style="buttonRippleStyle(2)" @touchstart="startButtonRipple($event, 2)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 2); restore()">恢复对话</button>
    </view>
    <scroll-view
      class="chat-messages qs-motion-block"
      scroll-y
      :scroll-into-view="scrollTarget"
      :scroll-with-animation="false"
      @scroll="onScroll"
      @scrolltolower="follow = true"
    >
      <LoadingSkeleton v-if="booting" :rows="2" />
      <view v-if="!booting && !messages.length" class="chat-welcome qs-reveal">
        <image :src="assetPaths.characters.suinaiWave" mode="aspectFit" />
        <text>我在这里。</text>
        <text class="qs-row-note">聊聊你的困惑，或者交代一件要做的事。</text>
      </view>
      <view
        v-for="message in messages"
        :id="'msg-' + message.id"
        :key="message.id"
        class="chat-message"
        :class="message.role === 'user' ? 'chat-message--user' : ''"
      >
        <image
          v-if="message.role === 'assistant'"
          class="chat-message-avatar"
          :src="assetPaths.characters.suinaiAvatar"
          mode="aspectFit"
        />
        <view class="chat-bubble" @longpress="copyMessage(message.content)">
          <RichMessage :content="message.content" />
          <text v-if="message.streaming" class="stream-cursor">▌</text>
        </view>
      </view>
      <view
        :hover-start-time="0"
        v-if="
          latest &&
          (activeStatus(latest.status) || attentionStatus(latest.status))
        "
        class="chat-execution qs-card qs-press"
        hover-class="qs-pressed"
        :hover-stay-time="120"
        @click="openTask"
      >
        <TaskStatus :status="latest.status" />
        <text class="chat-execution-label">
          {{
            latest.status === "waiting_pc"
              ? "电脑上线后会继续处理"
              : latest.cancel_requested
                ? "停止请求已发送"
                : latest.title
          }}
        </text>
        <text class="qs-chevron">›</text>
      </view>
      <view v-if="events.length" class="chat-tools">
        <button :id="buttonRippleId(3)" :style="buttonRippleStyle(3)" @touchstart="startButtonRipple($event, 3)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="chat-tools-toggle qs-tap-target" @click="startButtonRipple($event, 3); toolsOpen = !toolsOpen">
          {{ toolsOpen ? "收起" : "查看" }}执行记录 · {{ events.length }}
          <text
            class="qs-disclosure-chevron"
            :class="toolsOpen ? 'qs-disclosure-chevron--open' : ''"
          >
            ⌄
          </text>
        </button>
        <view v-if="toolsOpen" class="chat-tools-lines qs-reveal">
          <text v-for="(event, index) in events" :key="index">
            {{ eventLabel(event) }}
          </text>
        </view>
      </view>
      <view
        v-for="approval in approvals"
        :key="approval.id"
        class="chat-approval qs-reveal"
      >
        <text>{{ approval.reason || "这一步需要你的确认" }}</text>
        <view v-if="latest?.controllable">
          <button :id="buttonRippleId(4, [approval.id])" :style="buttonRippleStyle(4, [approval.id])" @touchstart="startButtonRipple($event, 4, [approval.id], deciding)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" :disabled="deciding" @click="startButtonRipple($event, 4, [approval.id], deciding); decide(approval.id, false)">
            拒绝
          </button>
          <button
            :id="buttonRippleId(5, [approval.id])"
            :style="buttonRippleStyle(5, [approval.id])"
            @touchstart="startButtonRipple($event, 5, [approval.id], deciding)"
            hover-class="button-hover"
            hover-stop-propagation
            :hover-start-time="0"
            :hover-stay-time="110"
            class="approval-allow qs-tap-target"
            :disabled="deciding"
            @click="startButtonRipple($event, 5, [approval.id], deciding); decide(approval.id, true)"
          >
            允许
          </button>
        </view>
        <text v-else class="qs-row-note">请回到电脑端确认这一步。</text>
      </view>
      <FileRow v-for="file in outputFiles" :key="file.id" :file="file" />
      <view v-if="error" class="qs-error chat-error">
        <text>{{ error }}</text>
        <button :id="buttonRippleId(6)" :style="buttonRippleStyle(6)" @touchstart="startButtonRipple($event, 6)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 6); retryRead()">重新读取</button>
      </view>
      <view id="chat-bottom" class="chat-bottom-anchor"></view>
    </scroll-view>
    <button :id="buttonRippleId(7)" :style="buttonRippleStyle(7)" @touchstart="startButtonRipple($event, 7)" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" v-if="!follow && active" class="chat-follow qs-tap-target" @click="startButtonRipple($event, 7); jumpToBottom()">
      回到最新消息 ↓
    </button>
    <view class="chat-composer-area">
      <CareerBridge
        v-if="conversation"
        ref="careerBridge"
        :source="
          conversation.target === 'pc'
            ? conversation.device_id || 'missing-pc'
            : 'cloud'
        "
        :source-label="sourceLabel(conversation, devices)"
        @draft="setCareerDraft"
      />
      <view v-if="pendingFiles.length" class="pending-files qs-reveal">
        <view v-for="(file, index) in pendingFiles" :key="file.name">
          <view>
            <text>{{ file.name }}</text>
            <text
              class="attachment-state"
              :class="file.state === 'failed' ? 'attachment-state--failed' : ''"
            >
              {{
                file.uploaded
                  ? "已上传，执行时解析"
                  : file.state === "uploading"
                    ? "上传中…"
                    : file.state === "failed"
                      ? "上传失败，发送时重试"
                      : formatBytes(file.bytes) + " · 待发送"
              }}
            </text>
          </view>
          <button
            :id="buttonRippleId(8, [file.name])"
            :style="buttonRippleStyle(8, [file.name])"
            @touchstart="startButtonRipple($event, 8, [file.name], submitting || Boolean(file.uploaded))"
            hover-class="button-hover"
            hover-stop-propagation
            :hover-start-time="0"
            :hover-stay-time="110"
            class="qs-tap-target"
            v-if="!file.uploaded"
            aria-label="移除待发送附件"
            :disabled="submitting || Boolean(file.uploaded)"
            @click="startButtonRipple($event, 8, [file.name], submitting || Boolean(file.uploaded)); pendingFiles.splice(index, 1)"
          >
            ×
          </button>
        </view>
      </view>
      <view
        v-if="!messages.length && !draft && !pendingFiles.length"
        class="chat-starters qs-reveal"
      >
        <button :id="buttonRippleId(9, [text])" :style="buttonRippleStyle(9, [text])" @touchstart="startButtonRipple($event, 9, [text])" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" v-for="text in starters" :key="text" @click="startButtonRipple($event, 9, [text]); draft = text">
          {{ text }}
        </button>
      </view>
      <view
        class="chat-composer"
        :class="[
          focused ? 'chat-composer--focused' : '',
          submitting ? 'chat-composer--sending' : '',
        ]"
      >
        <button
          :id="buttonRippleId(10)"
          :style="buttonRippleStyle(10)"
          @touchstart="startButtonRipple($event, 10, undefined, active || submitting || conversation?.archived)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="qs-icon-button qs-tap-target"
          aria-label="导入文件"
          :disabled="active || submitting || conversation?.archived"
          @click="startButtonRipple($event, 10, undefined, active || submitting || conversation?.archived); chooseFile()"
        >
          <image :src="assets.attachment" />
        </button>
        <textarea
          v-model="draft"
          class="chat-input"
          auto-height
          maxlength="20000"
          cursor-spacing="16"
          :disabled="Boolean(conversation?.archived)"
          placeholder="发送消息…"
          @focus="focused = true"
          @blur="focused = false"
        />
        <button
          :id="buttonRippleId(11)"
          :style="buttonRippleStyle(11)"
          @touchstart="startButtonRipple($event, 11, undefined,
            !latest?.controllable || submitting || latest?.cancel_requested
          )"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          v-if="active"
          class="qs-icon-button chat-send qs-tap-target"
          aria-label="停止任务"
          :disabled="
            !latest?.controllable || submitting || latest?.cancel_requested
          "
          @click="startButtonRipple($event, 11, undefined,
            !latest?.controllable || submitting || latest?.cancel_requested
          ); stop()"
        >
          <image :src="assets.stop" />
        </button>
        <button
          :id="buttonRippleId(12)"
          :style="buttonRippleStyle(12)"
          @touchstart="startButtonRipple($event, 12, undefined,
            submitting ||
            booting ||
            (!draft.trim() && !pendingFiles.length) ||
            conversation?.archived
          )"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          v-else
          class="qs-icon-button chat-send qs-tap-target"
          :class="
            (draft.trim() || pendingFiles.length) && !booting
              ? 'chat-send--ready'
              : ''
          "
          aria-label="发送消息"
          :disabled="
            submitting ||
            booting ||
            (!draft.trim() && !pendingFiles.length) ||
            conversation?.archived
          "
          @click="startButtonRipple($event, 12, undefined,
            submitting ||
            booting ||
            (!draft.trim() && !pendingFiles.length) ||
            conversation?.archived
          ); send()"
        >
          <ActivityDots v-if="submitting" label="正在发送" />
          <image v-else :src="assets.send" />
        </button>
      </view>
      <text v-if="active && !latest?.controllable" class="chat-footnote">
        电脑端发起的任务，请在电脑端停止。
      </text>
    </view>
    <RemoteDevices
      v-if="sourceOpen"
      :preferred="preferredSource"
      @close="sourceClosed"
      @created="created"
    />
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { computed, nextTick, ref } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import {
  agentApi,
  authApi,
  hubApi,
  hasToken,
  goToAuth,
  newRequestId,
  type AgentMessage,
  type AgentSnapshot,
  type Conversation,
  type HubDevice,
  type SessionUser,
} from "../../services/api";
import {
  sourceLabel,
  tasksFromSnapshot,
  taskLabels,
  taskEvents,
  eventLabel,
  activeStatus,
  attentionStatus,
  errorText,
  formatBytes,
} from "../../services/workspace";
import { conversationMenu } from "../../services/conversations";
import { invalidateOverview } from "../../services/overview";
import {
  consumeCareerDraft,
  consumeCareerAttachment,
  rememberCareerConversation,
} from "../../services/career-context";
import { chooseAttachment } from "../../services/files";
import { assetPaths } from "../../static/assets";
import RemoteDevices from "../../components/RemoteDevices.vue";
import TaskStatus from "../../components/TaskStatus.vue";
import FileRow from "../../components/FileRow.vue";
import RichMessage from "../../components/RichMessage.vue";
interface UiMessage extends AgentMessage {
  streaming?: boolean;
}
import AppHeader from "../../components/AppHeader.vue";
import CareerBridge from "../../components/CareerBridge.vue";
import ActivityDots from "../../components/ActivityDots.vue";
import LoadingSkeleton from "../../components/LoadingSkeleton.vue";
const pageMotionClass = usePageMotion();
const assets = assetPaths.prototype,
  conversation = ref<Conversation | null>(null),
  snapshot = ref<AgentSnapshot | null>(null),
  messages = ref<UiMessage[]>([]),
  devices = ref<HubDevice[]>([]),
  user = ref<SessionUser | null>(null);
const textSize = ref("28rpx");
const draft = ref(""),
  error = ref(""),
  booting = ref(true),
  submitting = ref(false),
  deciding = ref(false),
  focused = ref(false),
  sourceOpen = ref(false),
  preferredSource = ref(""),
  toolsOpen = ref(false),
  follow = ref(true),
  scrollTarget = ref("");
const pendingFiles = ref<
  Array<{
    name: string;
    base64: string;
    bytes: number;
    uploaded?: boolean;
    state?: "ready" | "uploading" | "failed";
  }>
>([]);
const careerBridge = ref<{ refresh: () => Promise<void> } | null>(null);
let careerRunState = "";
const starters = ["我不知道适合什么", "帮我优化简历"];
let id = "",
  loaded = false,
  visible = false,
  generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
let requestAttempt: { content: string; id: string; session: string } | null =
  null;
const tasks = computed(() =>
  snapshot.value ? tasksFromSnapshot(snapshot.value) : [],
);
const latest = computed(() => tasks.value.at(-1));
const active = computed(() =>
  Boolean(latest.value && activeStatus(latest.value.status)),
);
const approvals = computed(
  () =>
    snapshot.value?.approvals?.filter(
      (a) => a.status === "pending" && a.run_id === latest.value?.local_run_id,
    ) ?? [],
);
const outputFiles = computed(
  () => snapshot.value?.files?.filter((f) => f.kind === "output") ?? [],
);
const events = computed(() =>
  snapshot.value ? taskEvents(snapshot.value, latest.value) : [],
);
onLoad((options) => {
  id = options?.id || "";
  preferredSource.value = options?.source || "";
  draft.value = consumeCareerDraft();
  const file = consumeCareerAttachment();
  if (file) pendingFiles.value.push({ ...file, state: "ready" });
  const starter = uni.getStorageSync("qingsui.chat.starter");
  if (typeof starter === "string" && starter) {
    draft.value = starter;
    uni.removeStorageSync("qingsui.chat.starter");
  }
});
onShow(() => {
  textSize.value =
    ({ large: "32rpx", largest: "36rpx" } as Record<string, string>)[
      uni.getStorageSync("qingsui.chat.text-size")
    ] || "28rpx";
  visible = true;
  if (!hasToken()) {
    goToAuth();
    return;
  }
  if (!loaded) void initialize();
  else if (id) {
    void refresh();
    void careerBridge.value?.refresh();
  }
});
onHide(() => {
  visible = false;
  stopPolling();
});
onUnload(() => {
  visible = false;
  generation++;
  stopPolling();
});
async function initialize() {
  if (loaded) return;
  loaded = true;
  booting.value = true;
  try {
    const [me, list] = await Promise.all([authApi.me(), hubApi.devices()]);
    user.value = me;
    devices.value = list;
    if (id) await refresh();
    else sourceOpen.value = true;
  } catch (e) {
    loaded = false;
    error.value = errorText(e);
  } finally {
    booting.value = false;
  }
}
function retryRead() {
  if (!loaded) void initialize();
  else void refresh();
}
function sync(next: AgentSnapshot) {
  invalidateOverview(next.conversation.id);
  snapshot.value = next;
  conversation.value = next.conversation;
  rememberCareerConversation(
    next.conversation.id,
    next.conversation.target === "pc"
      ? next.conversation.device_id || "missing-pc"
      : "cloud",
  );
  const persisted: UiMessage[] = next.messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );
  const task = tasksFromSnapshot(next).at(-1);
  const state = task ? task.id + ":" + task.status : "";
  if (state !== careerRunState) {
    careerRunState = state;
    if (task && !activeStatus(task.status))
      void nextTick(() => careerBridge.value?.refresh());
  }
  const text = Object.values(next.drafts ?? {}).join("");
  if (
    text &&
    task &&
    activeStatus(task.status) &&
    !persisted.some(
      (m) =>
        m.role === "assistant" &&
        m.run_id === task.local_run_id &&
        m.content === text,
    )
  )
    persisted.push({
      id: "stream-" + task.id,
      role: "assistant",
      content: text,
      streaming: true,
    });
  messages.value = persisted;
  if (follow.value) void jumpToBottom();
}
async function refresh() {
  if (!id) return;
  const current = ++generation;
  stopPolling();
  try {
    const next = await agentApi.snapshot(id);
    if (current !== generation) return;
    sync(next);
    error.value = "";
    if (visible && tasksFromSnapshot(next).some((t) => activeStatus(t.status)))
      timer = setTimeout(refresh, 1400);
  } catch (e) {
    if (current === generation) {
      error.value = errorText(e);
      if (visible) timer = setTimeout(refresh, 5000);
    }
  }
}
function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
async function created(item: Conversation) {
  sourceOpen.value = false;
  id = item.id;
  conversation.value = item;
  hubApi.setExecution(
    item.target || "cloud",
    item.device_id || null,
    item.workspace_id || null,
  );
  await refresh();
}
function sourceClosed() {
  sourceOpen.value = false;
  if (!id)
    uni.navigateBack({
      fail: () => uni.switchTab({ url: "/pages/home/index" }),
    });
}
async function send() {
  if (
    submitting.value ||
    active.value ||
    !conversation.value ||
    conversation.value.archived
  )
    return;
  const content =
    draft.value.trim() ||
    (pendingFiles.value.length ? "请阅读我提供的资料，帮我整理重要信息。" : "");
  if (!content) return;
  submitting.value = true;
  error.value = "";
  try {
    if (!user.value?.external_ai_consent) {
      const confirmed = await new Promise<boolean>((resolve) =>
        uni.showModal({
          title: "允许模型调用",
          content: "你的消息与资料将发送给这段会话所使用的模型服务。",
          confirmText: "允许",
          success: (r) => resolve(r.confirm),
          fail: () => resolve(false),
        }),
      );
      if (!confirmed) return;
      await authApi.consent(true);
      if (user.value) user.value.external_ai_consent = true;
    }
    for (const file of pendingFiles.value) {
      if (!file.uploaded) {
        file.state = "uploading";
        try {
          await agentApi.importFile(id, file.name, file.base64);
          file.uploaded = true;
        } catch (e) {
          file.state = "failed";
          throw e;
        }
      }
    }
    const requestId =
      requestAttempt?.content === content && requestAttempt.session === id
        ? requestAttempt.id
        : newRequestId();
    requestAttempt = { content, id: requestId, session: id };
    const run = await agentApi.run(id, content, "", requestId);
    requestAttempt = null;
    draft.value = "";
    pendingFiles.value = [];
    follow.value = true;
    messages.value.push({
      id: "task-" + run.id,
      role: "user",
      content,
      created_at: run.created_at,
    });
    await refresh();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    submitting.value = false;
  }
}
async function chooseFile() {
  try {
    const file = await chooseAttachment();
    if (
      pendingFiles.value.some(
        (f) => f.name === file.name && f.base64 === file.base64,
      )
    ) {
      uni.showToast({ title: "这份文件已添加", icon: "none" });
      return;
    }
    pendingFiles.value.push({ ...file, state: "ready" });
  } catch (e) {
    const text = errorText(e);
    if (!/cancel|取消/i.test(text)) error.value = text;
  }
}
async function menu() {
  if (!conversation.value) return;
  try {
    if (await conversationMenu(conversation.value)) {
      const list = await agentApi.conversations();
      if (!list.some((item) => item.id === id)) {
        uni.navigateBack({
          fail: () => uni.switchTab({ url: "/pages/home/index" }),
        });
        return;
      }
      await refresh();
    }
  } catch (e) {
    error.value = errorText(e);
  }
}
async function restore() {
  if (conversation.value) {
    try {
      await agentApi.updateConversation(id, { archived: false });
      await refresh();
    } catch (e) {
      error.value = errorText(e);
    }
  }
}
async function decide(approvalId: string, approved: boolean) {
  if (!latest.value?.controllable || deciding.value) return;
  deciding.value = true;
  try {
    await hubApi.approve(latest.value.id, approvalId, approved);
    await refresh();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    deciding.value = false;
  }
}
async function stop() {
  if (!latest.value?.controllable) return;
  submitting.value = true;
  try {
    await hubApi.cancel(latest.value.id);
    await refresh();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    submitting.value = false;
  }
}
function setCareerDraft(text: string) {
  if (draft.value.trim() && draft.value !== text) {
    uni.showModal({
      title: "替换当前草稿？",
      content: "输入框里还有未发送的文字。",
      confirmText: "替换",
      success: (r) => {
        if (r.confirm) {
          draft.value = text;
          focused.value = true;
        }
      },
    });
    return;
  }
  draft.value = text;
  focused.value = true;
}
function copyMessage(content: string) {
  uni.showActionSheet({
    itemList: ["复制全文"],
    success: () => uni.setClipboardData({ data: content }),
  });
}
function openTask() {
  if (latest.value)
    uni.navigateTo({
      url: `/pages/task/index?session=${id}&id=${latest.value.id}`,
    });
}
function showContext() {
  if (!conversation.value) {
    sourceOpen.value = true;
    return;
  }
  uni.showModal({
    title: "当前执行位置",
    content: `${sourceLabel(conversation.value, devices.value)}\n已有对话沿用原来的项目、模型与权限。切换位置请新建对话。`,
    showCancel: false,
  });
}
let lastScroll = 0;
function onScroll(event: unknown) {
  const d = (event as { detail: { scrollTop: number } }).detail;
  if (d.scrollTop < lastScroll - 12) follow.value = false;
  lastScroll = d.scrollTop;
}
async function jumpToBottom() {
  follow.value = true;
  scrollTarget.value = "";
  await nextTick();
  scrollTarget.value = "chat-bottom";
}
</script>
<style lang="scss">
.chat-screen {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--qs-bg);
  background-image: radial-gradient(circle at 1rpx 1rpx, rgba(114, 93, 140, 0.07) 1rpx, transparent 1.5rpx);
  background-size: 32rpx 32rpx;
  overflow: hidden;
}
.chat-messages {
  flex: 1;
  min-height: 0;
  height: 0;
  padding: 26rpx 26rpx 0;
  box-sizing: border-box;
}
.chat-message {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  margin-bottom: 30rpx;
  animation: qs-soft-in 0.18s ease-out backwards;
}
.chat-message--user {
  justify-content: flex-end;
}
.chat-message-avatar {
  flex: none;
  width: 68rpx;
  height: 68rpx;
}
.chat-bubble {
  position: relative;
  max-width: calc(100% - 84rpx);
  padding: 22rpx 25rpx;
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-card $qs-radius-card $qs-radius-card 4rpx;
  background: var(--qs-paper);
  font-family: $qingsui-font;
  font-size: $qs-type-body;
  line-height: 1.8;
}
.chat-message--user .chat-bubble {
  background: var(--qs-primary-soft);
  border-radius: $qs-radius-card $qs-radius-card 4rpx $qs-radius-card;
  max-width: 88%;
}
.chat-welcome {
  text-align: center;
  padding: 75rpx 20rpx;
}
.chat-welcome > image {
  width: 180rpx;
  height: 180rpx;
  margin: 0 auto 24rpx;
}
.chat-welcome > text:first-of-type {
  display: block;
  @include qs-ui-type($qs-type-section);
}
.chat-execution {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 24rpx;
  margin: 12rpx 0 24rpx;
}
.chat-execution-label {
  flex: 1;
  min-width: 0;
  font-size: 25rpx;
  color: var(--qs-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-tools-toggle {
  display: flex;
  justify-content: space-between;
  margin: 10rpx 0;
  padding: 14rpx 0;
  background: transparent;
  color: var(--qs-muted);
  font-size: 23rpx;
}
.chat-tools-lines {
  padding: 18rpx;
  background: var(--qs-paper-soft);
  border-radius: 12rpx;
}
.chat-tools-lines text {
  display: block;
  font-size: 24rpx;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  margin-bottom: 12rpx;
}
.chat-approval {
  padding: 24rpx;
  margin: 20rpx 0;
  background: var(--qs-warn-soft);
  border: 1rpx solid #e6d2ad;
  border-radius: $qs-radius-control;
  font-size: 26rpx;
  line-height: 1.7;
}
.chat-approval > view {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
}
.chat-approval button {
  flex: 1;
  font-size: 25rpx;
  background: var(--qs-paper);
  color: var(--qs-ink);
}
.chat-approval .approval-allow {
  background: #8970bc;
  color: white;
}
.chat-composer-area {
  flex: none;
  padding: 18rpx 22rpx calc(18rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid var(--qs-lilac);
  background: var(--qs-paper);
}
.chat-composer {
  display: flex;
  gap: 8rpx;
  align-items: flex-end;
  border: 1rpx solid var(--qs-lilac);
  border-radius: $qs-radius-card;
  padding: 8rpx;
  background: var(--qs-paper);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.chat-composer--focused {
  border-color: #a28ac6;
  box-shadow: 0 0 0 4rpx rgba(137, 112, 188, 0.08);
}
.chat-input {
  flex: 1;
  min-width: 0;
  min-height: 72rpx;
  max-height: 220rpx;
  padding: 16rpx 8rpx;
  font-size: 28rpx;
  line-height: 1.5;
  box-sizing: border-box;
}
.chat-composer .qs-icon-button {
  width: 66rpx;
  height: 72rpx;
  padding: 12rpx;
}
.chat-send {
  border-radius: $qs-radius-control;
  transition:
    background-color 0.2s,
    transform 0.16s,
    opacity 0.18s;
}
.chat-send--ready {
  background: var(--qs-primary-soft);
}
.chat-composer--sending {
  border-color: #ad97cc;
}
.chat-send[disabled] {
  opacity: 0.35;
}
.chat-starters {
  display: flex;
  gap: 14rpx;
  margin-bottom: 16rpx;
}
.chat-starters button {
  padding: 10rpx 18rpx;
  margin: 0;
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--qs-muted);
  background: var(--qs-paper-soft);
  border-radius: 12rpx;
}
.pending-files {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
}
.pending-files > view {
  display: flex;
  gap: 12rpx;
  align-items: center;
  padding: 10rpx 14rpx;
  background: var(--qs-primary-soft);
  border-radius: 12rpx;
  max-width: 100%;
  font-size: 22rpx;
}
.pending-files text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pending-files > view > view {
  min-width: 0;
}
.pending-files .attachment-state {
  display: block;
  margin-top: 5rpx;
  color: var(--qs-muted);
  font-size: 22rpx;
}
.pending-files .attachment-state--failed {
  color: #a4495e;
}
.pending-files button {
  padding: 0 5rpx;
  margin: 0;
  background: transparent;
  line-height: 1.4;
  font-size: 28rpx;
}
.chat-bottom-anchor {
  height: 28rpx;
}
.stream-cursor {
  animation: qs-pulse 1s ease infinite;
  color: #8970bc;
}
.chat-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 28rpx;
  background: var(--qs-warn-soft);
  font-size: 24rpx;
}
.chat-notice button {
  font-size: 24rpx;
  margin: 0;
  padding: 8rpx;
  background: transparent;
  color: #8064af;
  line-height: 1.5;
}
.chat-footnote {
  font-size: 24rpx;
  display: block;
  margin-top: 12rpx;
  color: var(--qs-muted);
}
.chat-follow {
  position: fixed;
  bottom: 180rpx;
  left: 32%;
  z-index: 4;
  font-size: 23rpx;
  border-radius: 20rpx;
  background: var(--qs-primary-soft);
  color: var(--qs-ink);
  box-shadow: 0 4rpx 16rpx rgba(60, 40, 90, 0.1);
}
</style>
