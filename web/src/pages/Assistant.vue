<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Clock3,
  History,
  MessageCirclePlus,
  Pencil,
  Send,
  Trash2
} from 'lucide-vue-next'
import AssistantAvatar from '@/components/AssistantAvatar.vue'
import {
  assistantChatApi,
  assistantSessionApi,
  assistantSessionsApi,
  deleteAssistantSessionApi,
  renameAssistantSessionApi,
  type AssistantChatResponse,
  type AssistantSessionDetail,
  type AssistantSessionMessage,
  type AssistantSessionSummary
} from '@/api/assistant'
import {
  M3Button,
  M3Card,
  M3CircularProgress,
  M3EmptyState,
  M3ErrorState,
  M3IconButton,
  M3TextArea,
  M3TextField
} from '@/design-system/components'
import {
  M3ConfirmCancelledError,
  m3Confirm,
  m3Message
} from '@/design-system/services/feedback'
import {
  preloadAssistantAvatarAssets,
  type AssistantVisualState
} from '@/assets/brand'
import { visualStateForAssistantResponse } from '@/utils/assistantPresentation'

type DisplayMessage = AssistantSessionMessage & { pending?: boolean; failed?: boolean }

const route = useRoute()
const router = useRouter()
const sessions = ref<AssistantSessionSummary[]>([])
const messages = ref<DisplayMessage[]>([])
const activeSessionId = ref<number | null>(null)
const activeTitle = ref('新会话')
const input = ref('')
const listLoading = ref(true)
const listRefreshing = ref(false)
const listError = ref('')
const conversationLoading = ref(false)
const conversationLoadFailure = ref<{ sessionId: number; message: string } | null>(null)
const sending = ref(false)
const sessionMutationPending = ref(false)
const renaming = ref(false)
const renameValue = ref('')
const bodyRef = ref<HTMLElement | null>(null)

const quickQuestions = [
  '我现在最应该验证什么？',
  '帮我比较两个职业方向',
  '如何判断岗位是否适合我？',
  '把下一步拆成一个小任务'
]

const failedMessage = computed(() => messages.value.find((message) => message.role === 'user' && message.failed) ?? null)
const activeVisualState = computed<AssistantVisualState>(() => {
  if (sending.value) return 'thinking'
  const latest = [...messages.value].reverse().find((message) => message.role === 'assistant')
  if (!latest?.response) return 'default'
  return visualStateForAssistantResponse(latest.response)
})

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const scrollToBottom = async () => {
  await nextTick()
  if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
}

const normalizeAssistantResponse = (response: AssistantChatResponse | null) => {
  if (!response || typeof response !== 'object') return null
  return {
    ...response,
    evidenceBasis: Array.isArray(response.evidenceBasis) ? response.evidenceBasis : [],
    uncertainties: Array.isArray(response.uncertainties) ? response.uncertainties : [],
    actions: Array.isArray(response.actions) ? response.actions : []
  }
}

const replaceQuerySession = async (sessionId: number | null) => {
  const query = { ...route.query }
  if (sessionId == null) delete query.session
  else query.session = String(sessionId)
  await router.replace({ path: route.path, query })
}

const refreshSessions = async (showProgress = false) => {
  if (showProgress) listRefreshing.value = true
  try {
    sessions.value = await assistantSessionsApi()
    listError.value = ''
  } catch (error) {
    listError.value = errorMessage(error, '会话历史加载失败')
    throw error
  } finally {
    if (showProgress) listRefreshing.value = false
  }
}

const openSession = async (sessionId: number, updateUrl = true) => {
  if (conversationLoading.value || sending.value || sessionMutationPending.value) return
  conversationLoading.value = true
  conversationLoadFailure.value = null
  renaming.value = false
  try {
    let detail: AssistantSessionDetail
    try {
      detail = await assistantSessionApi(sessionId)
    } catch (error) {
      if (isSessionNotFound(error)) {
        sessions.value = sessions.value.filter((item) => item.id !== sessionId)
        if (activeSessionId.value === sessionId || Number(route.query.session) === sessionId) {
          await clearActiveSession('这段会话已经删除，已为你开始新会话')
        }
        return
      }
      conversationLoadFailure.value = {
        sessionId,
        message: errorMessage(error, '会话加载失败')
      }
      return
    }
    activeSessionId.value = detail.id
    activeTitle.value = detail.title
    messages.value = detail.messages.map((message) => ({
      ...message,
      response: normalizeAssistantResponse(message.response)
    }))
    if (updateUrl) {
      try {
        await replaceQuerySession(detail.id)
      } catch {
        m3Message.error('会话已恢复，但会话地址更新失败')
      }
    }
    await scrollToBottom()
  } finally {
    conversationLoading.value = false
  }
}

const startNewSession = async () => {
  if (conversationLoading.value || sending.value || sessionMutationPending.value) return
  activeSessionId.value = null
  activeTitle.value = '新会话'
  messages.value = []
  input.value = ''
  conversationLoadFailure.value = null
  renaming.value = false
  try {
    await replaceQuerySession(null)
  } catch {
    m3Message.error('新会话已开始，但会话地址更新失败')
  }
}

const context = computed(() => ({
  routePath: '/assistant',
  sourcePage: typeof route.query.from === 'string' ? route.query.from : null
}))

const send = async (suggested?: string, retryMessage?: DisplayMessage) => {
  const text = (suggested ?? input.value).trim()
  if (!text || sending.value) return
  if (failedMessage.value && failedMessage.value !== retryMessage) return
  const startedNewSession = activeSessionId.value == null
  const requestId = retryMessage?.requestId || `chat-${crypto.randomUUID()}`
  const optimisticUser: DisplayMessage = retryMessage ?? {
      id: -Date.now(),
      requestId,
      role: 'user',
      content: text,
      response: null,
      createdAt: new Date().toISOString()
    }
  if (retryMessage) retryMessage.failed = false
  else messages.value.push(optimisticUser)
  input.value = ''
  conversationLoadFailure.value = null
  sending.value = true
  await scrollToBottom()
  try {
    let response: AssistantChatResponse
    try {
      const rawResponse = await assistantChatApi({
        requestId,
        sessionId: activeSessionId.value,
        page: '/assistant',
        message: text,
        context: context.value
      })
      response = normalizeAssistantResponse(rawResponse) ?? rawResponse
    } catch (error) {
      if (isSessionNotFound(error)) {
        await clearActiveSession('这段会话已经删除，请重新发送消息开始新会话')
        input.value = text
        return
      }
      optimisticUser.failed = true
      input.value = text
      m3Message.error(errorMessage(error, '消息发送失败，请稍后重试'))
      return
    }

    activeSessionId.value = response.sessionId
    if (startedNewSession) activeTitle.value = text.slice(0, 80)
    messages.value.push({
      id: Date.now(),
      requestId,
      role: 'assistant',
      content: response.reply,
      response,
      createdAt: new Date().toISOString()
    })

    try {
      await refreshSessions()
      activeTitle.value = sessions.value.find((item) => item.id === response.sessionId)?.title ?? activeTitle.value
    } catch {
      // The message is already persisted. Keep it successful and offer a
      // separate session-list retry instead of resending the same prompt.
    }
    try {
      await replaceQuerySession(response.sessionId)
    } catch {
      m3Message.error('消息已发送，但会话地址更新失败')
    }
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

const beginRename = () => {
  if (activeSessionId.value == null) return
  renameValue.value = activeTitle.value
  renaming.value = true
  void nextTick(() => document.querySelector<HTMLElement>('.assistant-title-field')?.focus())
}

const saveRename = async () => {
  const title = renameValue.value.trim()
  if (!activeSessionId.value || !title) return
  sessionMutationPending.value = true
  try {
    const updated = await renameAssistantSessionApi(activeSessionId.value, title)
    const index = sessions.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) sessions.value[index] = updated
    else sessions.value.unshift(updated)
    activeTitle.value = updated.title
    renaming.value = false
  } catch (error) {
    m3Message.error(error instanceof Error ? error.message : '会话重命名失败')
  } finally {
    sessionMutationPending.value = false
  }
}

const isSessionNotFound = (error: unknown) => {
  const code = (error as { code?: unknown })?.code
  return code === 40490 || code === 404
}

const clearActiveSession = async (message?: string) => {
  activeSessionId.value = null
  activeTitle.value = '新会话'
  messages.value = []
  input.value = ''
  conversationLoadFailure.value = null
  renaming.value = false
  try {
    await replaceQuerySession(null)
  } catch {
    m3Message.error('会话状态已更新，但会话地址更新失败')
  }
  if (message) m3Message.info(message)
}

const deleteSession = async (sessionId: number, title: string) => {
  if (conversationLoading.value || sending.value || sessionMutationPending.value) return
  sessionMutationPending.value = true
  try {
    await m3Confirm(`删除后，“${title}”及其中的消息将无法恢复。不会删除你的个人档案、决策项目或行动计划。`, '删除会话', {
      confirmButtonText: '删除会话',
      cancelButtonText: '取消',
      type: 'error'
    })
    try {
      await deleteAssistantSessionApi(sessionId)
    } catch (error) {
      if (!isSessionNotFound(error)) throw error
    }
    sessions.value = sessions.value.filter((item) => item.id !== sessionId)
    if (activeSessionId.value === sessionId) await clearActiveSession()
    m3Message.success('会话已删除')
  } catch (error) {
    if (error instanceof M3ConfirmCancelledError) return
    m3Message.error(error instanceof Error ? error.message : '会话删除失败')
  } finally {
    sessionMutationPending.value = false
  }
}

const deleteActiveSession = async () => {
  if (activeSessionId.value == null) return
  await deleteSession(activeSessionId.value, activeTitle.value)
}
const handleInputKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void send()
}

const retrySessionList = async () => {
  try {
    await refreshSessions(true)
  } catch {
    // The inline error remains visible and retryable.
  }
}

onMounted(async () => {
  preloadAssistantAvatarAssets()
  try {
    await refreshSessions()
  } catch {
    // The history error is rendered in the sidebar instead of as an empty list.
  } finally {
    listLoading.value = false
  }

  const requestedId = Number(route.query.session)
  if (Number.isSafeInteger(requestedId) && requestedId > 0) await openSession(requestedId, false)
})
</script>

<template>
  <div class="assistant-page product-shell">
    <aside class="session-sidebar" aria-label="AI 助手会话历史">
      <div class="sidebar-header">
        <div><span class="eyebrow"><History :size="16" />会话历史</span><strong>与穗奈的讨论</strong></div>
        <M3IconButton label="开始新会话" variant="tonal" :disabled="conversationLoading || sending || sessionMutationPending" @click="startNewSession"><MessageCirclePlus :size="20" /></M3IconButton>
      </div>
      <M3CircularProgress v-if="listLoading" class="history-loading" indeterminate label="正在加载会话历史" />
      <template v-else>
        <M3ErrorState v-if="listError" class="sidebar-error" title="会话历史暂时不可用" :description="listError">
          <template #actions><M3Button variant="text" :disabled="listRefreshing" @click="retrySessionList">{{ listRefreshing ? '正在重试' : '重试' }}</M3Button></template>
        </M3ErrorState>
        <M3EmptyState v-if="!sessions.length && !listError" title="还没有历史会话" description="提出第一个问题后，会话会自动保存在这里。" />
        <div v-else-if="sessions.length" class="session-list">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="session-item"
            :class="{ active: session.id === activeSessionId }"
          >
            <M3Card
              tag="button"
              interactive
              variant="filled"
              class="session-open"
              :aria-current="session.id === activeSessionId ? 'true' : undefined"
              :disabled="conversationLoading || sending || sessionMutationPending"
              @click="openSession(session.id)"
            >
              <strong>{{ session.title }}</strong>
              <span>{{ session.lastMessage || '会话已创建' }}</span>
              <small><Clock3 :size="13" />{{ formatTime(session.updatedAt) }} · {{ session.messageCount }} 条消息</small>
            </M3Card>
            <M3IconButton
              class="session-delete"
              :label="`删除会话：${session.title}`"
              :disabled="conversationLoading || sending || sessionMutationPending"
              @click.stop="deleteSession(session.id, session.title)"
            >
              <Trash2 :size="17" />
            </M3IconButton>
          </div>
        </div>
      </template>
    </aside>

    <main class="conversation-panel" aria-label="穗奈助手对话">
      <header class="conversation-header">
        <div class="assistant-heading"><AssistantAvatar :state="activeVisualState" size="large" /><div><span class="eyebrow">青穗集职业决策助手</span><strong v-if="!renaming">{{ activeTitle }}</strong><M3TextField v-else v-model="renameValue" class="assistant-title-field" label="会话名称" maxlength="80" @keydown.enter.prevent="saveRename" @keydown.esc.prevent="renaming = false" /></div></div>
        <div class="conversation-actions">
          <template v-if="renaming"><M3Button variant="text" :disabled="sessionMutationPending" @click="renaming = false">取消</M3Button><M3Button variant="tonal" :disabled="!renameValue.trim() || sessionMutationPending" @click="saveRename">保存</M3Button></template>
          <template v-else-if="activeSessionId != null"><M3IconButton label="重命名会话" :disabled="conversationLoading || sending || sessionMutationPending" @click="beginRename"><Pencil :size="19" /></M3IconButton><M3IconButton label="删除会话" :disabled="conversationLoading || sending || sessionMutationPending" @click="deleteActiveSession"><Trash2 :size="19" /></M3IconButton></template>
        </div>
      </header>

      <div ref="bodyRef" class="conversation-body" aria-live="polite">
        <M3ErrorState v-if="conversationLoadFailure" class="conversation-error" title="无法恢复这段会话" :description="conversationLoadFailure.message">
          <template #actions><M3Button variant="text" :disabled="conversationLoading" @click="openSession(conversationLoadFailure.sessionId)">重试加载</M3Button></template>
        </M3ErrorState>
        <M3CircularProgress v-if="conversationLoading" class="conversation-loading" indeterminate label="正在恢复会话" />
        <div v-else-if="!messages.length" class="conversation-welcome">
          <AssistantAvatar state="default" size="large" />
          <div><h1>你好，我是穗奈</h1><p>我可以陪你探索职业方向、理解真实岗位，并把你的经历和岗位要求放在一起比较。</p></div>
          <div class="starter-questions"><M3Button v-for="question in quickQuestions" :key="question" variant="outlined" @click="send(question)">{{ question }}</M3Button></div>
        </div>
        <template v-else>
          <div v-for="message in messages" :key="`${message.id}-${message.role}`" :class="['conversation-message-row', message.role]">
            <AssistantAvatar v-if="message.role === 'assistant'" :state="message.response ? visualStateForAssistantResponse(message.response) : 'default'" size="small" />
            <M3Card tag="article" :variant="message.role === 'user' ? 'filled' : 'outlined'" :class="['conversation-message', message.role, { failed: message.failed }]">
              <p>{{ message.content }}</p>
              <template v-if="message.response">
                <div class="message-meta"><span>{{ message.response.generationMode === 'llm' ? '模型生成' : '规则建议' }}</span><span v-if="message.response.usedPersonalContext != null">{{ message.response.usedPersonalContext ? '已结合个人上下文' : '未使用个人上下文' }}</span></div>
                <details v-if="message.response.evidenceBasis.length || message.response.uncertainties.length"><summary>为什么这样回答</summary><section v-if="message.response.evidenceBasis.length"><strong>主要依据</strong><ul><li v-for="(item, index) in message.response.evidenceBasis" :key="index">{{ item.statement }}</li></ul></section><section v-if="message.response.uncertainties.length"><strong>仍需确认</strong><ul><li v-for="(item, index) in message.response.uncertainties" :key="index">{{ item }}</li></ul></section></details>
                <section v-if="message.response.nextStep" class="next-step"><strong>建议下一步</strong><p>{{ message.response.nextStep }}</p></section>
              </template>
              <div v-if="message.failed" class="send-failed"><small>发送失败，请重试后再继续会话</small><M3Button variant="text" :disabled="sending" @click="send(message.content, message)">重试</M3Button></div>
            </M3Card>
          </div>
          <div v-if="sending" class="conversation-message-row assistant"><AssistantAvatar state="thinking" size="small" /><M3Card tag="div" class="conversation-message pending" variant="outlined"><M3CircularProgress indeterminate label="穗奈正在回答" /><span>穗奈正在思考…</span></M3Card></div>
        </template>
      </div>

      <footer class="conversation-composer">
        <M3TextArea v-model="input" :rows="2" maxlength="4000" label="向穗奈提问" :disabled="sending || conversationLoading || sessionMutationPending || Boolean(failedMessage)" @keydown="handleInputKeydown" />
        <M3IconButton label="发送消息" variant="filled" :disabled="!input.trim() || sending || conversationLoading || sessionMutationPending || Boolean(failedMessage)" @click="send()"><Send :size="20" /></M3IconButton>
        <small>{{ failedMessage ? '请先重试未完成的消息，或开始新会话' : 'Enter 发送，Shift + Enter 换行' }}</small>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.assistant-page { display: grid; max-width: 1440px; min-height: calc(100vh - 64px); grid-template-columns: 300px minmax(0, 1fr); gap: var(--career-spacing-5); padding: var(--career-spacing-5); }
.session-sidebar, .conversation-panel { min-width: 0; overflow: hidden; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-surface-container-low); }
.session-sidebar { display: flex; min-height: 640px; flex-direction: column; }
.sidebar-header, .conversation-header { display: flex; align-items: center; justify-content: space-between; gap: var(--career-spacing-3); border-bottom: 1px solid var(--md-sys-color-outline-variant); padding: var(--career-spacing-4); }
.sidebar-header > div, .assistant-heading > div { display: grid; min-width: 0; gap: var(--career-spacing-1); }
.sidebar-header strong, .assistant-heading strong { overflow: hidden; font: 500 var(--md-sys-typescale-title-medium-size) / var(--md-sys-typescale-title-medium-line-height) var(--md-ref-typeface-brand); text-overflow: ellipsis; white-space: nowrap; }
.eyebrow { display: inline-flex; align-items: center; gap: var(--career-spacing-1); color: var(--md-sys-color-primary); font: 500 var(--md-sys-typescale-label-medium-size) / var(--md-sys-typescale-label-medium-line-height) var(--md-ref-typeface-plain); }
.history-loading, .conversation-loading { margin: auto; }
.sidebar-error { margin: var(--career-spacing-2); }
.session-list { min-height: 0; overflow-y: auto; padding: var(--career-spacing-2); }
.session-item { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: var(--career-spacing-1); border: 0; border-radius: var(--md-sys-shape-corner-medium); padding: var(--career-spacing-1); background: transparent; color: var(--md-sys-color-on-surface); transition: background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard); }
.session-item:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.session-item.active { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.session-open { display: grid; min-width: 0; gap: var(--career-spacing-1); border: 0; border-radius: var(--md-sys-shape-corner-small); padding: var(--career-spacing-2); background: transparent; color: inherit; cursor: pointer; text-align: left; }
.session-open:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 6%, transparent); }
.session-open:focus-visible, .session-delete:focus-visible { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }
.session-delete { align-self: center; }
.session-item strong, .session-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-item span { color: var(--md-sys-color-on-surface-variant); font: 400 var(--md-sys-typescale-body-small-size) / var(--md-sys-typescale-body-small-line-height) var(--md-ref-typeface-plain); }
.session-item small { display: flex; align-items: center; gap: var(--career-spacing-1); color: var(--md-sys-color-on-surface-variant); font: 400 var(--md-sys-typescale-label-small-size) / var(--md-sys-typescale-label-small-line-height) var(--md-ref-typeface-plain); }
.conversation-panel { display: grid; min-height: 640px; grid-template-rows: auto minmax(0, 1fr) auto; background: var(--md-sys-color-surface); }
.assistant-heading { display: flex; min-width: 0; align-items: center; gap: var(--career-spacing-3); }
.assistant-heading > div { width: min(520px, 50vw); }
.assistant-title-field { width: min(420px, 45vw); }
.conversation-actions { display: flex; align-items: center; gap: var(--career-spacing-1); }
.conversation-body { min-height: 0; overflow-y: auto; padding: clamp(20px, 4vw, 48px); }
.conversation-error { width: min(820px, 100%); margin: 0 auto var(--career-spacing-4); }
.conversation-welcome { display: grid; max-width: 700px; min-height: 100%; align-content: center; justify-items: center; gap: var(--career-spacing-4); margin: auto; text-align: center; }
.conversation-welcome h1 { margin: 0; font: 500 var(--md-sys-typescale-headline-medium-size) / var(--md-sys-typescale-headline-medium-line-height) var(--md-ref-typeface-brand); }
.conversation-welcome p { max-width: 600px; margin: var(--career-spacing-2) 0 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.7; }
.starter-questions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--career-spacing-2); }
.conversation-message-row { display: flex; width: min(820px, 100%); align-items: flex-start; gap: var(--career-spacing-2); margin: 0 auto var(--career-spacing-4); }
.conversation-message-row.user { justify-content: flex-end; }
.conversation-message { max-width: min(680px, calc(100% - 40px)); padding: var(--career-spacing-3) var(--career-spacing-4); }
.conversation-message.user { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.conversation-message.failed { outline: 2px solid var(--md-sys-color-error); }
.conversation-message > p { margin: 0; white-space: pre-wrap; }
.message-meta { display: flex; flex-wrap: wrap; gap: var(--career-spacing-3); margin-top: var(--career-spacing-3); border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: var(--career-spacing-2); color: var(--md-sys-color-on-surface-variant); font: 500 var(--md-sys-typescale-label-small-size) / var(--md-sys-typescale-label-small-line-height) var(--md-ref-typeface-plain); }
.conversation-message details { margin-top: var(--career-spacing-3); border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: var(--career-spacing-2); }
.conversation-message summary { color: var(--md-sys-color-primary); cursor: pointer; font-weight: 500; }
.conversation-message section { margin-top: var(--career-spacing-2); color: var(--md-sys-color-on-surface-variant); }
.conversation-message ul { margin: var(--career-spacing-1) 0 0; padding-left: var(--career-spacing-5); }
.next-step > p { margin-top: var(--career-spacing-1); }
.send-failed { display: flex; align-items: center; justify-content: space-between; gap: var(--career-spacing-2); margin-top: var(--career-spacing-2); color: var(--md-sys-color-error); }
.pending { display: flex; align-items: center; gap: var(--career-spacing-3); }
.pending :deep(md-circular-progress) { --md-circular-progress-size: 24px; }
.conversation-composer { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 48px; align-items: end; gap: var(--career-spacing-2); border-top: 1px solid var(--md-sys-color-outline-variant); padding: var(--career-spacing-4); background: var(--md-sys-color-surface-container-low); }
.conversation-composer small { grid-column: 1 / -1; color: var(--md-sys-color-on-surface-variant); text-align: right; }
@media (max-width: 959px) { .assistant-page { grid-template-columns: 240px minmax(0, 1fr); gap: var(--career-spacing-3); padding: var(--career-spacing-3); } .conversation-body { padding: var(--career-spacing-4); } }
@media (max-width: 719px) { .assistant-page { display: block; padding: var(--career-spacing-2); } .session-sidebar { min-height: 0; max-height: 240px; margin-bottom: var(--career-spacing-2); } .session-list { display: flex; overflow-x: auto; overflow-y: hidden; } .session-item { min-width: 230px; } .conversation-panel { min-height: calc(100vh - 390px); } .assistant-heading > div { width: min(52vw, 360px); } .conversation-header { padding: var(--career-spacing-3); } .conversation-body { min-height: 360px; padding: var(--career-spacing-3); } }
@media (prefers-reduced-motion: reduce) { .session-item { transition: none; } }
</style>
