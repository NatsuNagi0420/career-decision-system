/** 青穗集 · 小程序真实对话页：连接 8110 Agent，展示会话、流式快照与受限文本资料。 */
<template>
  <view class="qs-page chat-page">
    <view class="chat-intro qs-stagger">
      <view class="chat-title-wrap">
        <text class="qs-eyebrow">SUINAI / COMPANION</text>
        <text class="qs-title">我们先聊聊。</text>
        <text class="chat-presence"><text class="presence-dot" :class="sending ? 'presence-dot--busy' : ''">●</text> {{ activityText }}</text>
        <button class="conversation-trigger qs-ripple" :disabled="booting" @click="toggleConversationPicker">
          <text class="conversation-trigger-title">{{ conversationTitle }}</text>
          <text class="conversation-trigger-icon" :class="conversationPickerOpen ? 'conversation-trigger-icon--open' : ''">⌄</text>
        </button>
      </view>
      <image class="chat-avatar qs-avatar-float" :src="assets.characters.suinaiThink" mode="aspectFit" />
    </view>

    <view v-if="conversationPickerOpen" class="conversation-layer" @click="closeConversationPicker">
      <view class="conversation-panel qs-card qs-panel-enter" @click.stop>
        <view class="conversation-panel-head">
          <text class="conversation-panel-title">对话</text>
          <button class="new-conversation-button qs-ripple" :disabled="conversationBusy || sending" aria-label="新对话" @click="createNewConversation">
            <image :src="assets.icons.newItem" mode="aspectFit" />
            <text>新对话</text>
          </button>
        </view>
        <view v-if="renamingConversation" class="rename-row qs-panel-enter">
          <input v-model="renameDraft" class="rename-input" maxlength="80" focus placeholder="给这段对话起个名字" @confirm="saveConversationRename" />
          <button class="rename-action rename-action--quiet qs-ripple" @click="cancelConversationRename">取消</button>
          <button class="rename-action qs-ripple" :disabled="conversationBusy" @click="saveConversationRename">保存</button>
        </view>
        <scroll-view class="conversation-list" scroll-y>
          <view v-if="!conversations.length" class="conversation-empty"><text>还没有历史对话</text></view>
          <view
            v-for="item in conversations"
            :key="item.id"
            class="conversation-item"
            :class="[
              item.id === conversation?.id ? 'conversation-item--active' : '',
              item.archived ? 'conversation-item--archived' : '',
            ]"
            @click="selectConversation(item)"
          >
            <view class="conversation-item-main">
              <text class="conversation-item-title">{{ item.title || '新的对话' }}</text>
              <text class="conversation-item-time">{{ formatConversationTime(item.updated_at) }}</text>
            </view>
            <text v-if="item.archived" class="conversation-item-state">已归档</text>
            <text v-else-if="item.id === conversation?.id" class="conversation-item-state conversation-item-state--active">当前</text>
            <button class="conversation-item-more qs-ripple" aria-label="更多操作" @click.stop="openConversationActions(item)">
              <image :src="assets.icons.more" mode="aspectFit" />
            </button>
          </view>
        </scroll-view>
      </view>
    </view>

    <view class="connection-strip qs-card" :class="sending ? 'connection-strip--busy' : ''">
      <view class="connection-icon"><image :src="assets.icons.connection" mode="aspectFit" /></view>
      <view class="connection-copy"><text class="connection-name">{{ modelLabel }}</text><text class="connection-state">{{ modelState }}</text></view>
      <button v-if="user && !user.external_ai_consent" class="connection-action qs-ripple" @click="grantConsent">允许调用</button>
    </view>

    <scroll-view class="message-list" scroll-y :scroll-into-view="lastMessageId" scroll-with-animation>
      <view v-if="booting || conversationBusy" class="loading-card"><image class="qs-spin" :src="assets.icons.sync" mode="aspectFit" /><text>{{ conversationBusy ? '正在打开对话…' : '正在接通穗奈…' }}</text></view>
      <view v-for="message in messages" :id="message.id" :key="message.id" class="message-row" :class="message.role === 'user' ? 'message-row--user' : 'message-row--assistant'">
        <image v-if="message.role === 'assistant'" class="message-avatar qs-avatar-float" :src="assets.characters.suinaiWave" mode="aspectFit" />
        <view class="message-bubble" :class="[message.role === 'user' ? 'message-bubble--user' : '', message.streaming ? 'message-bubble--streaming' : '']"><text>{{ message.content }}</text><text v-if="message.streaming" class="stream-cursor">▌</text></view>
      </view>
      <view v-if="sending" class="typing-card"><image :src="assets.icons.aiInsight" mode="aspectFit" /><text>{{ testingModel ? '正在测试模型连接' : '穗奈正在整理你的话' }}</text><text class="typing-dots">· · ·</text></view>
      <view v-if="errorMessage" class="error-card"><image :src="assets.icons.pendingWarning" mode="aspectFit" /><text>{{ errorMessage }}</text></view>
    </scroll-view>

    <scroll-view class="quick-row" scroll-x>
      <button v-for="quick in quickPrompts" :key="quick.text" class="quick-button qs-ripple" :disabled="sending || booting || conversationBusy || conversation?.archived" @click="send(quick.text)"><image :src="quick.icon" mode="aspectFit" /><text>{{ quick.text }}</text></button>
    </scroll-view>

    <view class="composer qs-card" :class="[conversation?.archived ? 'composer--archived' : '', composerFocused ? 'qs-focus' : '']">
      <view v-if="inputArtifacts.length" class="attachment-list">
        <view v-for="artifact in inputArtifacts" :key="artifact.id" class="attachment-chip"><image :src="assets.icons.file" mode="aspectFit" /><text class="attachment-name">{{ artifact.name }}</text><text class="attachment-size">{{ formatBytes(artifact.bytes) }}</text></view>
      </view>
      <textarea v-model="draft" class="composer-input" maxlength="2000" auto-height cursor-spacing="20" :disabled="Boolean(conversation?.archived)" placeholder="说说你最近在想什么…" @focus="composerFocused = true" @blur="composerFocused = false" @confirm="sendDraft" />
      <view class="composer-footer">
        <view class="composer-tools">
          <button class="tool-button qs-ripple" :disabled="sending || booting || conversationBusy || uploadingFile || conversation?.archived" aria-label="导入资料" @click="chooseFile"><image :src="assets.icons.file" mode="aspectFit" /></button>
          <text v-if="uploadingFile" class="composer-hint composer-hint--active">资料读取中…</text>
          <text v-else-if="conversation?.archived" class="composer-hint">这段对话已归档</text>
        </view>
        <button class="send-button qs-ripple" :disabled="!draft.trim() || sending || booting || conversationBusy || uploadingFile || conversation?.archived" aria-label="发送" @click="sendDraft"><image :src="assets.icons.send" mode="aspectFit" /></button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onHide, onShow } from "@dcloudio/uni-app";
import { computed, nextTick, ref } from "vue";
import {
  AgentApiError,
  agentApi,
  authApi,
  getToken,
  goToAuth,
  hasToken,
  isActiveRun,
  modelIsReady,
  newRequestId,
  type AgentMessage,
  type AgentSnapshot,
  type Conversation,
  type ModelProfile,
  type SessionUser,
} from "../../services/api";
import { chooseTextFile } from "../../services/files";
import { assetPaths } from "../../static/assets";

interface UiMessage extends AgentMessage { streaming?: boolean }
const assets = assetPaths;
const welcomeMessage: UiMessage = { id: "welcome", role: "assistant", content: "不用先填表。你可以从最近的一件事开始说：是想找实习、换方向，还是只是想先理清自己？" };
const messages = ref<UiMessage[]>([welcomeMessage]);
const draft = ref("");
const user = ref<SessionUser | null>(null);
const models = ref<ModelProfile[]>([]);
const selectedProfile = ref<ModelProfile | null>(null);
const conversation = ref<Conversation | null>(null);
const conversations = ref<Conversation[]>([]);
const snapshot = ref<AgentSnapshot | null>(null);
const booting = ref(false);
const sending = ref(false);
const testingModel = ref(false);
const uploadingFile = ref(false);
const composerFocused = ref(false);
const conversationBusy = ref(false);
const conversationPickerOpen = ref(false);
const renamingConversation = ref<Conversation | null>(null);
const renameDraft = ref("");
const errorMessage = ref("");
const initialized = ref(false);
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollGeneration = 0;

const quickPrompts = [
  { text: "我想找实习", icon: assets.icons.target },
  { text: "我不知道适合什么", icon: assets.icons.aiInsight },
  { text: "我有一份旧简历", icon: assets.icons.file },
];
const lastMessageId = computed(() => messages.value.at(-1)?.id ?? "welcome");
const conversationTitle = computed(() => conversation.value?.title || "新的对话");
const modelLabel = computed(() => selectedProfile.value?.display_name || selectedProfile.value?.name || "尚未选择模型");
const modelState = computed(() => {
  if (booting.value) return "正在连接 Agent";
  if (testingModel.value) return "正在测试连接";
  if (!user.value?.external_ai_consent) return "等待允许模型调用";
  if (!selectedProfile.value) return "请先在 Agent 中配置模型";
  if (!modelIsReady(selectedProfile.value)) return "模型尚未测试";
  return selectedProfile.value.capabilities.stream ? "流式连接已就绪" : "连接已就绪";
});
const activityText = computed(() => {
  if (testingModel.value) return "正在测试模型";
  if (uploadingFile.value) return "正在读取资料";
  if (sending.value) return "穗奈正在工作";
  return "穗奈正在听";
});
const inputArtifacts = computed(() => (snapshot.value?.artifacts ?? []).filter(artifact => artifact.kind === "input"));

onShow(() => {
  if (!hasToken()) {
    goToAuth();
    return;
  }
  if (!initialized.value) void initialize();
  else if (conversation.value) void refreshSnapshot();
});

onHide(() => {
  conversationPickerOpen.value = false;
  cancelConversationRename();
  stopPolling();
});

async function initialize() {
  if (booting.value) return;
  booting.value = true;
  errorMessage.value = "";
  try {
    user.value = await authApi.me();
    models.value = await agentApi.models();
    const list = await agentApi.conversations();
    conversations.value = list;
    const current = list.find(item => !item.archived) ?? null;
    if (current) {
      await activateConversation(current, false);
    } else {
      selectedProfile.value = chooseModel(models.value);
      const created = await agentApi.createConversation(selectedProfile.value?.id ?? null);
      rememberConversation(created);
      conversation.value = created;
      await refreshSnapshot();
    }
    initialized.value = true;
  } catch (error) {
    showError(error);
  } finally {
    booting.value = false;
  }
}

function chooseModel(values: ModelProfile[]): ModelProfile | null {
  return values.find(model => modelIsReady(model)) ?? values[0] ?? null;
}

function rememberConversation(item: Conversation) {
  const next = conversations.value.filter(value => value.id !== item.id);
  conversations.value = [item, ...next].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function refreshConversationList() {
  try {
    conversations.value = await agentApi.conversations();
  } catch (error) {
    showError(error);
  }
}

async function toggleConversationPicker() {
  if (conversationPickerOpen.value) {
    closeConversationPicker();
    return;
  }
  await refreshConversationList();
  conversationPickerOpen.value = true;
}

function closeConversationPicker() {
  conversationPickerOpen.value = false;
  cancelConversationRename();
}

function openConversationActions(item: Conversation) {
  if (conversationBusy.value) return;
  const itemList = item.archived
    ? ["恢复对话", "重命名", "永久删除"]
    : ["重命名", "归档对话", "永久删除"];
  uni.showActionSheet({
    itemList,
    success: result => {
      if (item.archived) {
        if (result.tapIndex === 0) void setConversationArchived(item, false);
        else if (result.tapIndex === 1) beginConversationRename(item);
        else if (result.tapIndex === 2) void confirmDeleteConversation(item);
      } else if (result.tapIndex === 0) {
        beginConversationRename(item);
      } else if (result.tapIndex === 1) {
        void setConversationArchived(item, true);
      } else if (result.tapIndex === 2) {
        void confirmDeleteConversation(item);
      }
    },
  });
}

function beginConversationRename(item: Conversation) {
  renamingConversation.value = item;
  renameDraft.value = item.title || "新的对话";
}

function cancelConversationRename() {
  renamingConversation.value = null;
  renameDraft.value = "";
}

async function saveConversationRename() {
  const item = renamingConversation.value;
  const title = renameDraft.value.trim();
  if (!item) return;
  if (!title) {
    uni.showToast({ title: "请输入对话名称", icon: "none" });
    return;
  }
  conversationBusy.value = true;
  try {
    const updated = await agentApi.updateConversation(item.id, { title });
    rememberConversation(updated);
    if (conversation.value?.id === updated.id) conversation.value = updated;
    cancelConversationRename();
    uni.showToast({ title: "已重命名", icon: "none" });
  } catch (error) {
    showError(error);
  } finally {
    conversationBusy.value = false;
  }
}

async function setConversationArchived(item: Conversation, archived: boolean) {
  conversationBusy.value = true;
  try {
    const updated = await agentApi.updateConversation(item.id, { archived });
    rememberConversation(updated);
    if (conversation.value?.id === updated.id) conversation.value = updated;
    uni.showToast({ title: archived ? "已归档" : "已恢复", icon: "none" });
  } catch (error) {
    showError(error);
  } finally {
    conversationBusy.value = false;
  }
}

async function confirmDeleteConversation(item: Conversation) {
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: "永久删除这段对话？",
      content: "消息、运行记录和对话文件都会删除，之后无法恢复。",
      confirmText: "永久删除",
      confirmColor: "#ba5b64",
      cancelText: "取消",
      success: result => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  closeConversationPicker();
  conversationBusy.value = true;
  stopPolling();
  try {
    await agentApi.deleteConversation(item.id);
    conversations.value = conversations.value.filter(value => value.id !== item.id);
    cancelConversationRename();
    if (conversation.value?.id === item.id) {
      conversation.value = null;
      snapshot.value = null;
      messages.value = [welcomeMessage];
      const next = conversations.value.find(value => !value.archived);
      if (next) {
        await activateConversation(next, false);
      } else {
        const created = await agentApi.createConversation(chooseModel(models.value)?.id ?? null);
        rememberConversation(created);
        conversation.value = created;
        selectedProfile.value = chooseModel(models.value);
        await refreshSnapshot();
      }
    }
    uni.showToast({ title: "对话已删除", icon: "none" });
  } catch (error) {
    showError(error);
  } finally {
    conversationBusy.value = false;
  }
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes >= 1024 * 100 ? 0 : 1)} KB`;
}

async function selectConversation(item: Conversation) {
  if (conversationBusy.value || item.id === conversation.value?.id) {
    closeConversationPicker();
    return;
  }
  if (sending.value) {
    uni.showToast({ title: "当前对话仍在运行", icon: "none" });
    return;
  }
  await activateConversation(item, true);
}

async function activateConversation(item: Conversation, closePicker = true) {
  conversationBusy.value = true;
  errorMessage.value = "";
  stopPolling();
  if (closePicker) closeConversationPicker();
  conversation.value = item;
  selectedProfile.value = models.value.find(model => model.id === item.profile_id) ?? chooseModel(models.value);
  snapshot.value = null;
  messages.value = [welcomeMessage];
  try {
    await refreshSnapshot();
  } finally {
    conversationBusy.value = false;
  }
}

async function createNewConversation() {
  if (conversationBusy.value || sending.value) {
    uni.showToast({ title: "当前任务完成后再新建", icon: "none" });
    return;
  }
  conversationBusy.value = true;
  errorMessage.value = "";
  stopPolling();
  try {
    const profile = chooseModel(models.value);
    const created = await agentApi.createConversation(profile?.id ?? null);
    rememberConversation(created);
    conversation.value = created;
    selectedProfile.value = profile;
    snapshot.value = null;
    messages.value = [welcomeMessage];
    draft.value = "";
    closeConversationPicker();
  } catch (error) {
    showError(error);
  } finally {
    conversationBusy.value = false;
  }
}

function syncSnapshot(next: AgentSnapshot) {
  snapshot.value = next;
  conversation.value = next.conversation;
  rememberConversation(next.conversation);
  const persisted = next.messages
    .filter(message => message.role === "user" || message.role === "assistant")
    .map(message => ({ ...message, streaming: false }));
  const currentPending = messages.value.find(message => message.id.startsWith("pending-"));
  const merged: UiMessage[] = persisted.length ? [...persisted] : [];
  if (currentPending && !merged.some(message => message.role === "user" && message.content === currentPending.content)) merged.push(currentPending);
  const active = next.runs.at(-1);
  const draftText = Object.values(next.drafts ?? {}).join("");
  if (draftText && active && isActiveRun(active)) merged.push({ id: `stream-${active.id}`, role: "assistant", content: draftText, run_id: active.id, streaming: true });
  messages.value = merged.length ? merged : [welcomeMessage];
  const activeNow = isActiveRun(active);
  sending.value = activeNow;
  if (!activeNow && active?.status === "failed" && active.error) errorMessage.value = active.error;
}

async function refreshSnapshot() {
  if (!conversation.value) return;
  try {
    const next = await agentApi.snapshot(conversation.value.id);
    syncSnapshot(next);
    if (isActiveRun(next.runs.at(-1))) startPolling();
  } catch (error) {
    showError(error);
  }
}

function stopPolling() {
  pollGeneration += 1;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function startPolling() {
  if (!conversation.value) return;
  stopPolling();
  const generation = pollGeneration;
  const tick = async () => {
    if (generation !== pollGeneration || !conversation.value) return;
    try {
      const next = await agentApi.snapshot(conversation.value.id);
      if (generation !== pollGeneration) return;
      syncSnapshot(next);
      if (isActiveRun(next.runs.at(-1))) pollTimer = setTimeout(tick, 420);
      else pollTimer = null;
    } catch (error) {
      if (generation === pollGeneration) {
        sending.value = false;
        showError(error);
      }
    }
  };
  void tick();
}

async function sendDraft() {
  const value = draft.value.trim();
  if (value) await send(value);
}

async function send(content: string) {
  if (sending.value || booting.value || conversationBusy.value || uploadingFile.value || !content.trim()) return;
  if (conversation.value?.archived) {
    errorMessage.value = "这段对话已归档，请先在桌面端恢复后再继续。";
    return;
  }
  errorMessage.value = "";
  const value = content.trim();
  draft.value = "";
  messages.value = [...messages.value.filter(message => !message.id.startsWith("pending-")), { id: `pending-${Date.now()}`, role: "user", content: value }];
  sending.value = true;
  await nextTick();
  try {
    if (!conversation.value) {
      selectedProfile.value = chooseModel(models.value);
      conversation.value = await agentApi.createConversation(selectedProfile.value?.id ?? null);
      rememberConversation(conversation.value);
    }
    if (!(await ensureConsent())) return;
    if (!(await ensureModelReady())) return;
    await agentApi.run(conversation.value.id, value, selectedProfile.value!.id, newRequestId());
    startPolling();
  } catch (error) {
    sending.value = false;
    messages.value = messages.value.filter(message => !message.id.startsWith("pending-"));
    showError(error);
  }
}

async function ensureConsent(): Promise<boolean> {
  if (user.value?.external_ai_consent) return true;
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: "允许模型调用",
      content: "你的消息需要发送给已选择的模型服务，穗奈才能开始工作。",
      confirmText: "允许",
      cancelText: "暂不",
      success: result => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) {
    sending.value = false;
    messages.value = messages.value.filter(message => !message.id.startsWith("pending-"));
    return false;
  }
  const result = await authApi.consent(true);
  if (user.value) user.value = { ...user.value, external_ai_consent: result.external_ai_consent };
  return true;
}

async function ensureModelReady(): Promise<boolean> {
  if (!selectedProfile.value) {
    sending.value = false;
    errorMessage.value = "8110 还没有可用的模型配置，请先在桌面端添加模型。";
    return false;
  }
  if (modelIsReady(selectedProfile.value)) return true;
  if (!user.value?.external_ai_consent) return false;
  testingModel.value = true;
  try {
    const tested = await agentApi.testModel(selectedProfile.value.id);
    models.value = models.value.map(item => item.id === tested.id ? tested : item);
    selectedProfile.value = tested;
    if (!modelIsReady(tested)) {
      errorMessage.value = tested.capabilities.note || "模型连接测试没有通过。";
      sending.value = false;
      return false;
    }
    return true;
  } catch (error) {
    showError(error);
    sending.value = false;
    return false;
  } finally {
    testingModel.value = false;
  }
}

async function grantConsent() {
  try {
    const result = await authApi.consent(true);
    if (user.value) user.value = { ...user.value, external_ai_consent: result.external_ai_consent };
  } catch (error) {
    showError(error);
  }
}

function showError(error: unknown) {
  if (error instanceof AgentApiError && error.status === 0) errorMessage.value = "无法连接 8110，请确认 Agent 服务正在运行。";
  else errorMessage.value = error instanceof Error ? error.message : "这次请求没有完成。";
}

async function chooseFile() {
  if (!conversation.value) return;
  uploadingFile.value = true;
  errorMessage.value = "";
  try {
    const file = await chooseTextFile();
    await agentApi.importFile(conversation.value.id, file.name, file.base64);
    await refreshSnapshot();
    uni.showToast({ title: "资料已加入", icon: "none" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资料没有导入";
    if (!/取消选择|cancel/i.test(message)) showError(error);
  } finally {
    uploadingFile.value = false;
  }
}
</script>

<style lang="scss">
.chat-page { display: flex; flex-direction: column; height: calc(100vh - 100rpx); padding-bottom: 24rpx; }
.chat-intro { display: flex; align-items: center; justify-content: space-between; min-height: 148rpx; }
.chat-title-wrap { position: relative; z-index: 1; min-width: 0; }
.chat-intro .qs-title { display: block; font-size: 43rpx; }
.chat-presence { display: block; margin-top: 12rpx; color: $qingsui-muted; font-size: 20rpx; }
.presence-dot { color: $qingsui-mint; }
.chat-avatar { width: 185rpx; height: 185rpx; margin-right: -22rpx; }
.conversation-trigger { display: flex; align-items: center; max-width: 410rpx; height: 52rpx; margin: 12rpx 0 0; padding: 0 14rpx; border: 1rpx solid $qingsui-lilac; border-radius: 14rpx; color: $qingsui-primary; background: rgba(255, 250, 255, .76); }
.conversation-trigger-title { max-width: 350rpx; overflow: hidden; font-size: 20rpx; text-overflow: ellipsis; white-space: nowrap; }
.conversation-trigger-icon { margin-left: 10rpx; color: $qingsui-muted; font-size: 22rpx; }
.conversation-layer { position: fixed; z-index: 20; inset: 0; padding: 170rpx 30rpx 120rpx; background: rgba(53, 45, 74, .18); }
.conversation-panel { max-height: 70vh; padding: 22rpx 18rpx 16rpx; overflow: hidden; box-shadow: 0 24rpx 70rpx rgba(53, 45, 74, .2); }
.conversation-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 0 8rpx 16rpx; }
.conversation-panel-title { color: $qingsui-ink; font-size: 28rpx; }
.rename-row { display: flex; align-items: center; gap: 8rpx; margin: 0 6rpx 12rpx; padding: 8rpx; border: 1rpx solid $qingsui-lilac; border-radius: 14rpx; background: $qingsui-primary-soft; }
.rename-input { min-width: 0; flex: 1; height: 58rpx; padding: 0 12rpx; border-radius: 10rpx; color: $qingsui-ink; background: $qingsui-paper; font-size: 20rpx; }
.rename-action { flex: none; height: 54rpx; margin: 0; padding: 0 12rpx; border: 1rpx solid $qingsui-primary; border-radius: 11rpx; color: $qingsui-primary; background: $qingsui-paper; font-size: 19rpx; }
.rename-action--quiet { border-color: transparent; color: $qingsui-muted; background: transparent; }
.new-conversation-button { display: flex; align-items: center; gap: 5rpx; height: 54rpx; margin: 0; padding: 0 12rpx; border: 1rpx solid $qingsui-lilac; border-radius: 13rpx; color: $qingsui-primary; background: $qingsui-primary-soft; font-size: 19rpx; }
.new-conversation-button image { width: 26rpx; height: 26rpx; }
.new-conversation-button[disabled] { opacity: .45; }
.conversation-list { height: 52vh; }
.conversation-empty { display: flex; align-items: center; justify-content: center; height: 180rpx; color: $qingsui-faint; font-size: 21rpx; }
.conversation-item { display: flex; align-items: center; min-height: 82rpx; margin: 4rpx 0; padding: 12rpx 14rpx; border: 1rpx solid transparent; border-radius: 15rpx; }
.conversation-item:active { background: $qingsui-primary-soft; }
.conversation-item--active { border-color: $qingsui-lilac; background: $qingsui-primary-soft; }
.conversation-item--archived { opacity: .62; }
.conversation-item-main { min-width: 0; flex: 1; }
.conversation-item-title, .conversation-item-time { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversation-item-title { color: $qingsui-ink; font-size: 22rpx; }
.conversation-item-time { margin-top: 5rpx; color: $qingsui-faint; font-size: 17rpx; }
.conversation-item-state { flex: none; margin-left: 12rpx; color: $qingsui-faint; font-size: 17rpx; }
.conversation-item-state--active { color: $qingsui-primary; }
.conversation-item-more { display: flex; align-items: center; justify-content: center; width: 52rpx; height: 52rpx; flex: none; margin: 0 0 0 6rpx; padding: 0; border: 0; border-radius: 12rpx; background: transparent; }
.conversation-item-more:active { background: $qingsui-primary-soft; }
.conversation-item-more image { width: 30rpx; height: 30rpx; }
.connection-strip { display: flex; align-items: center; min-height: 76rpx; margin-bottom: 10rpx; padding: 12rpx 16rpx; }
.connection-icon { display: flex; align-items: center; justify-content: center; width: 48rpx; height: 48rpx; border-radius: 14rpx; background: $qingsui-primary-soft; }
.connection-icon image { width: 30rpx; height: 30rpx; }
.connection-copy { min-width: 0; margin-left: 12rpx; }
.connection-name, .connection-state { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.connection-name { max-width: 380rpx; color: $qingsui-ink; font-size: 21rpx; }
.connection-state { margin-top: 4rpx; color: $qingsui-muted; font-size: 18rpx; }
.connection-action { min-width: 112rpx; height: 52rpx; margin-left: auto; padding: 0 12rpx; border: 1rpx solid $qingsui-primary; border-radius: 14rpx; color: $qingsui-primary; background: transparent; font-size: 19rpx; }
.message-list { flex: 1; min-height: 0; margin: 10rpx -4rpx 18rpx; padding: 10rpx 4rpx; }
.message-row { display: flex; align-items: flex-end; gap: 14rpx; margin: 26rpx 0; }
.message-row--user { justify-content: flex-end; }
.message-avatar { flex: none; width: 62rpx; height: 62rpx; border-radius: 50%; background: $qingsui-primary-soft; }
.message-bubble { max-width: 78%; padding: 22rpx 24rpx; border: 1rpx solid $qingsui-lilac; border-radius: 22rpx 22rpx 22rpx 6rpx; color: $qingsui-ink; background: $qingsui-paper; font-size: 26rpx; line-height: 1.7; }
.message-bubble--user { border-color: #c7e4d8; border-radius: 22rpx 22rpx 6rpx 22rpx; background: #edf8f3; }
.message-bubble--streaming { border-color: #cbb8e6; box-shadow: 0 0 0 4rpx rgba(118, 86, 165, .06); }
.stream-cursor { color: $qingsui-primary; animation: blink 1s infinite; }
.typing-card, .loading-card, .error-card { display: flex; align-items: center; gap: 12rpx; margin: 20rpx 6rpx 0 76rpx; color: $qingsui-muted; font-size: 20rpx; }
.typing-card image, .loading-card image, .error-card image { flex: none; width: 34rpx; height: 34rpx; }
.typing-dots { color: $qingsui-primary; letter-spacing: 5rpx; animation: blink 1s infinite; }
.loading-card { justify-content: center; margin: 60rpx 0; }
.loading-card image { animation: spin 1.2s linear infinite; }
.error-card { align-items: flex-start; color: #ba5b64; line-height: 1.55; }
.error-card image { margin-top: 2rpx; }
@keyframes blink { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }
.quick-row { flex: none; margin-bottom: 16rpx; white-space: nowrap; }
.quick-button { display: inline-flex; align-items: center; gap: 8rpx; height: 58rpx; margin-right: 12rpx; padding: 0 18rpx; border: 1rpx solid $qingsui-lilac; border-radius: 30rpx; color: $qingsui-primary; background: $qingsui-paper; font-size: 20rpx; }
.quick-button image { width: 30rpx; height: 30rpx; }
.quick-button[disabled], .tool-button[disabled] { opacity: .45; }
.composer { padding: 18rpx 20rpx 14rpx; }
.composer--archived { opacity: .74; }
.composer-input { width: 100%; min-height: 66rpx; color: $qingsui-ink; font-size: 26rpx; line-height: 1.6; }
.composer-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12rpx; }
.composer-tools { display: flex; align-items: center; min-width: 0; }
.tool-button { display: flex; align-items: center; justify-content: center; width: 52rpx; height: 52rpx; margin: 0 4rpx 0 0; padding: 0; }
.tool-button image { width: 34rpx; height: 34rpx; }
.composer-hint { max-width: 280rpx; margin-left: 8rpx; overflow: hidden; color: $qingsui-faint; font-size: 18rpx; text-overflow: ellipsis; white-space: nowrap; }
.send-button { display: flex; align-items: center; justify-content: center; width: 66rpx; height: 66rpx; padding: 0; border-radius: 50%; background: $qingsui-primary; }
.send-button image { width: 34rpx; height: 34rpx; filter: brightness(0) invert(1); }
.send-button[disabled] { opacity: .35; }

.presence-dot { transition: color .25s ease; }
.presence-dot--busy { color: $qingsui-primary; animation: chat-presence-pulse 1.15s ease-in-out infinite; }
.conversation-trigger-icon { transition: transform .2s ease; }
.conversation-trigger-icon--open { transform: rotate(180deg); }
.connection-strip--busy { border-color: #cbb8e6; box-shadow: 0 0 0 5rpx rgba(118, 86, 165, .06), 0 14rpx 40rpx rgba(109, 79, 139, .1); }
.message-row { animation: message-enter .38s cubic-bezier(.2, .75, .25, 1) both; }
.message-row--user { animation-name: message-enter-user; }
.message-bubble { transition: border-color .22s ease, box-shadow .22s ease; }
.message-bubble--streaming { animation: streaming-breathe 1.55s ease-in-out infinite; }
.typing-card, .loading-card, .error-card { animation: message-enter .32s ease both; }
.composer-hint--active { color: $qingsui-primary; animation: blink 1.1s ease-in-out infinite; }
.attachment-list { display: flex; flex-wrap: wrap; gap: 8rpx; margin: 0 0 12rpx; }
.attachment-chip { display: flex; align-items: center; max-width: 100%; gap: 7rpx; min-height: 46rpx; padding: 0 12rpx; border: 1rpx solid $qingsui-lilac; border-radius: 13rpx; color: $qingsui-primary; background: $qingsui-primary-soft; animation: attachment-enter .3s ease both; }
.attachment-chip image { width: 25rpx; height: 25rpx; flex: none; }
.attachment-name { max-width: 300rpx; overflow: hidden; font-size: 18rpx; text-overflow: ellipsis; white-space: nowrap; }
.attachment-size { color: $qingsui-muted; font-size: 16rpx; }
@keyframes message-enter { from { opacity: 0; transform: translateY(12rpx); } to { opacity: 1; transform: translateY(0); } }
@keyframes message-enter-user { from { opacity: 0; transform: translate(12rpx, 12rpx); } to { opacity: 1; transform: translate(0, 0); } }
@keyframes streaming-breathe { 0%, 100% { box-shadow: 0 0 0 4rpx rgba(118, 86, 165, .05); } 50% { box-shadow: 0 0 0 8rpx rgba(118, 86, 165, .09); } }
@keyframes chat-presence-pulse { 50% { opacity: .35; } }
@keyframes attachment-enter { from { opacity: 0; transform: scale(.92) translateY(5rpx); } to { opacity: 1; transform: scale(1) translateY(0); } }
</style>
