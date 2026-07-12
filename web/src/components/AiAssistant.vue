<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, MessageCircle, Send, X } from 'lucide-vue-next'
import {
  assistantChatApi,
  type AssistantChatResponse,
  type AssistantResponseMode
} from '@/api/assistant'

type MentorMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  response?: AssistantChatResponse
  retryText?: string
  retryRequestId?: string
}

const route = useRoute()
const router = useRouter()
const isOpen = ref(false)
const input = ref('')
const sending = ref(false)
const bodyRef = ref<HTMLElement | null>(null)
const quickQuestionsRef = ref<HTMLElement | null>(null)
const sessionId = ref<number | null>(null)
const messages = ref<MentorMessage[]>([
  {
    id: 'mentor-welcome',
    role: 'assistant',
    text: '我会先直接回答你的问题；需要职业判断时，再提供可展开的依据和下一步。'
  }
])

const pageLabel = computed(() => {
  const path = route.path
  if (path === '/') return '工作台'
  if (path.startsWith('/explore')) return '职业探索'
  if (path.startsWith('/decision-projects')) return '决策项目'
  if (path.startsWith('/action-plans')) return '行动计划'
  if (path.startsWith('/weekly-reviews')) return '每周复盘'
  if (path.startsWith('/profile')) return '个人档案'
  if (path.startsWith('/history')) return '历史记录'
  return '当前页面'
})

const quickQuestions = computed(() => {
  const path = route.path
  if (path.startsWith('/decision-projects/')) return ['现在最缺哪类证据？', '如何看待反对因素？', '下一步验证什么？']
  if (path.startsWith('/action-plans/')) return ['本周任务是否太多？', '验收标准够具体吗？', '下一步做什么？']
  if (path.startsWith('/weekly-reviews')) return ['这周结果说明什么？', '哪些任务应该调整？', '目标需要复查吗？']
  if (path.startsWith('/explore')) return ['如何判断职业方向？', '岗位样本怎么看？', '先比较哪些信息？']
  if (path.startsWith('/profile')) return ['档案还缺什么？', '什么算个人证据？', '下一步做什么？']
  return ['我现在应该做什么？', '如何开始职业决策？', '怎样避免盲目选择？']
})

const context = computed(() => ({
  routePath: route.path,
  projectId: route.path.startsWith('/decision-projects/') ? Number(route.params.id) || null : null,
  planId: route.path.startsWith('/action-plans/') ? Number(route.params.id) || null : Number(route.query.planId) || null,
  reviewId: route.path.startsWith('/weekly-reviews/') ? Number(route.params.id) || null : null,
  candidateId: Number(route.query.candidateId) || null,
  targetId: Number(route.query.targetId) || null,
  jobId: Number(route.query.jobId) || null,
  tab: typeof route.query.tab === 'string' ? route.query.tab : null
}))

const actionRoutes: Record<string, string> = {
  'go:dashboard': '/',
  'go:profile': '/profile',
  'go:jobs': '/explore?tab=jobs',
  'go:explore': '/explore',
  'go:decision-projects': '/decision-projects',
  'go:path-planning': '/action-plans',
  'go:action-plans': '/action-plans',
  'go:career-report': '/history',
  'go:history': '/history',
  'go:resume': '/profile'
}

const DIRECT_INTENTS = new Set(['model_identity', 'product_help', 'general_chat'])

const responseMode = (response: AssistantChatResponse): AssistantResponseMode => {
  const explicitMode = response.responseMode ?? response.mode
  if (explicitMode === 'coaching' || explicitMode === 'direct') return explicitMode
  return response.intent && DIRECT_INTENTS.has(response.intent) ? 'direct' : 'coaching'
}

const generationLabel = (generationMode: AssistantChatResponse['generationMode']) =>
  generationMode === 'llm' ? '模型生成' : '规则建议'

const hasPersonalContextFlag = (response: AssistantChatResponse) =>
  typeof response.usedPersonalContext === 'boolean'

const personalContextLabel = (response: AssistantChatResponse) =>
  response.usedPersonalContext ? '已结合个人上下文' : '未使用个人上下文'

const explanationSummary = (response: AssistantChatResponse) => {
  const parts: string[] = []
  if (response.evidenceBasis.length) parts.push(`依据 ${response.evidenceBasis.length} 项`)
  if (response.uncertainties.length) parts.push(`待确认 ${response.uncertainties.length} 项`)
  return parts.join(' · ')
}

const scrollToBottom = async () => {
  await nextTick()
  if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
}

const send = async (suggested?: string, retryMessageId?: string) => {
  const text = (suggested ?? input.value).trim()
  if (!text || sending.value) return
  const retryMessage = retryMessageId
    ? messages.value.find((message) => message.id === retryMessageId)
    : undefined
  const requestId = retryMessage?.retryRequestId || `chat-${crypto.randomUUID()}`
  if (retryMessageId) {
    messages.value = messages.value.filter((message) => message.id !== retryMessageId)
  } else {
    messages.value.push({ id: `user-${crypto.randomUUID()}`, role: 'user', text })
    input.value = ''
  }
  sending.value = true
  await scrollToBottom()
  try {
    const response = await assistantChatApi({
      requestId,
      sessionId: sessionId.value,
      page: route.path,
      message: text,
      context: context.value
    })
    sessionId.value = response.sessionId
    messages.value.push({
      id: `assistant-${crypto.randomUUID()}`,
      role: 'assistant',
      text: response.reply,
      response
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : '网络或服务异常'
    messages.value.push({
      id: `assistant-error-${crypto.randomUUID()}`,
      role: 'assistant',
      text: `导师暂时无法回答：${reason}。页面中的档案、决策和行动功能仍可正常使用。`,
      retryText: text,
      retryRequestId: requestId
    })
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

const navigate = async (action: string) => {
  const path = actionRoutes[action]
  if (!path) return
  isOpen.value = false
  await router.push(path)
}

const handleInputKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void send()
}

const handleQuickQuestionsWheel = (event: WheelEvent) => {
  const container = quickQuestionsRef.value
  if (!container || container.scrollWidth <= container.clientWidth + 1) return

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  const maxScrollLeft = container.scrollWidth - container.clientWidth
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + delta))
  if (nextScrollLeft === container.scrollLeft) return

  event.preventDefault()
  container.scrollLeft = nextScrollLeft
}

watch(() => route.fullPath, () => {
  if (quickQuestionsRef.value) quickQuestionsRef.value.scrollLeft = 0
  if (isOpen.value) void scrollToBottom()
})
</script>

<template>
  <Teleport to="body">
    <M3Fab class="mentor-fab" :class="{ 'panel-open': isOpen }" :label="isOpen ? '关闭 AI 导师' : '打开 AI 导师'" size="small" :aria-expanded="isOpen" @click="isOpen = !isOpen">
      <X v-if="isOpen" :size="22" />
      <MessageCircle v-else :size="23" />
    </M3Fab>

    <Transition name="mentor-panel">
      <section v-if="isOpen" class="mentor-panel" aria-label="AI 导师">
        <header>
          <div class="mentor-title"><span><Bot :size="19" /></span><div><strong>AI 导师</strong><small>{{ pageLabel }}</small></div></div>
          <M3IconButton label="关闭 AI 导师" @click="isOpen = false"><X :size="19" /></M3IconButton>
        </header>

        <div ref="bodyRef" class="mentor-body" aria-live="polite">
          <M3Card
            v-for="message in messages"
            :key="message.id"
            tag="article"
            :variant="message.role === 'user' ? 'filled' : 'outlined'"
            :class="['mentor-message', message.role]"
            :data-response-mode="message.response ? responseMode(message.response) : undefined"
          >
            <div class="message-copy primary-answer">{{ message.text }}</div>
            <M3Button v-if="message.retryText" class="retry-button" variant="text" :disabled="sending" @click="send(message.retryText, message.id)">重试</M3Button>
            <template v-if="message.response">
              <div class="response-meta" :data-generation-mode="message.response.generationMode" :data-used-personal-context="hasPersonalContextFlag(message.response) ? String(message.response.usedPersonalContext) : undefined">
                <span class="generation-status">{{ generationLabel(message.response.generationMode) }}</span>
                <span v-if="hasPersonalContextFlag(message.response)" class="personal-context-status">{{ personalContextLabel(message.response) }}</span>
              </div>

              <template v-if="responseMode(message.response) === 'coaching'">
                <details v-if="message.response.evidenceBasis.length || message.response.uncertainties.length" class="coaching-details">
                  <summary><span>为什么这样回答</span><small>{{ explanationSummary(message.response) }}</small></summary>
                  <div class="coaching-details-body">
                    <section v-if="message.response.evidenceBasis.length" class="response-section">
                      <strong>主要依据</strong>
                      <ul><li v-for="(item, index) in message.response.evidenceBasis" :key="index">{{ item.statement }}</li></ul>
                    </section>
                    <section v-if="message.response.uncertainties.length" class="response-section">
                      <strong>仍需确认</strong>
                      <ul><li v-for="(item, index) in message.response.uncertainties" :key="index">{{ item }}</li></ul>
                    </section>
                  </div>
                </details>
                <section v-if="message.response.nextStep?.trim()" class="response-section next-step"><strong>建议下一步</strong><p>{{ message.response.nextStep }}</p></section>
              </template>

              <div v-if="responseMode(message.response) === 'coaching' && message.response.actions?.length" class="response-actions"><M3Button v-for="action in message.response.actions" :key="action.action" variant="tonal" @click="navigate(action.action)">{{ action.label }}</M3Button></div>
            </template>
          </M3Card>
          <M3Card v-if="sending" class="mentor-message assistant pending" tag="div" variant="outlined"><M3CircularProgress indeterminate label="AI 导师正在回答" /></M3Card>
        </div>

        <footer>
          <div ref="quickQuestionsRef" class="quick-questions" role="group" aria-label="示例问题" tabindex="0" @wheel="handleQuickQuestionsWheel"><M3Button v-for="question in quickQuestions" :key="question" variant="text" :disabled="sending" @click="send(question)">{{ question }}</M3Button></div>
          <div class="mentor-input"><M3TextArea v-model="input" class="mentor-input-field" :rows="2" maxlength="2000" label="向 AI 导师提问" @keydown="handleInputKeydown" /><M3IconButton label="发送" variant="filled" :disabled="!input.trim() || sending" @click="send()"><Send :size="18" /></M3IconButton></div>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mentor-fab { position: fixed; z-index: 1202; right: var(--career-spacing-6); bottom: var(--career-spacing-6); }
.mentor-panel { position: fixed; z-index: 1201; right: var(--career-spacing-6); bottom: 88px; width: min(400px, calc(100vw - 32px)); height: min(680px, calc(100vh - 128px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface); box-shadow: var(--md-sys-elevation-level3); }
.mentor-panel > header { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: var(--career-spacing-4); padding: var(--career-spacing-2) var(--career-spacing-3) var(--career-spacing-2) var(--career-spacing-4); border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.mentor-title { display: flex; align-items: center; gap: var(--career-spacing-3); }
.mentor-title > span { width: 40px; height: 40px; display: grid; place-items: center; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.mentor-title > div { display: grid; gap: var(--career-spacing-1); }
.mentor-title strong { font: 500 var(--md-sys-typescale-title-medium-size) / var(--md-sys-typescale-title-medium-line-height) var(--md-ref-typeface-brand); }
.mentor-title small { color: var(--md-sys-color-on-surface-variant); font: 500 var(--md-sys-typescale-label-medium-size) / var(--md-sys-typescale-label-medium-line-height) var(--md-ref-typeface-plain); }
.mentor-body { overflow-y: auto; padding: var(--career-spacing-4); background: var(--md-sys-color-surface); }
.mentor-message { width: min(92%, 340px); margin-bottom: var(--career-spacing-3); padding: var(--career-spacing-3) var(--career-spacing-4); }
.mentor-message.user { margin-left: auto; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.message-copy { font: 400 var(--md-sys-typescale-body-medium-size) / var(--md-sys-typescale-body-medium-line-height) var(--md-ref-typeface-plain); white-space: pre-wrap; }
.primary-answer { color: var(--md-sys-color-on-surface); }
.retry-button { margin-top: var(--career-spacing-2); }
.response-meta { display: flex; flex-wrap: wrap; gap: var(--career-spacing-1) var(--career-spacing-3); margin-top: var(--career-spacing-3); padding-top: var(--career-spacing-2); border-top: 1px solid var(--md-sys-color-outline-variant); color: var(--md-sys-color-on-surface-variant); font: 500 var(--md-sys-typescale-label-small-size) / var(--md-sys-typescale-label-small-line-height) var(--md-ref-typeface-plain); opacity: 0.72; }
.response-meta > span { min-width: 0; }
.generation-status, .personal-context-status { overflow-wrap: anywhere; }
.coaching-details { margin-top: var(--career-spacing-3); border-top: 1px solid var(--md-sys-color-outline-variant); border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.coaching-details summary { cursor: pointer; padding: var(--career-spacing-2) 0; color: var(--md-sys-color-primary); font: 500 var(--md-sys-typescale-label-medium-size) / var(--md-sys-typescale-label-medium-line-height) var(--md-ref-typeface-plain); }
.coaching-details summary span { margin-right: var(--career-spacing-2); }
.coaching-details summary small { color: var(--md-sys-color-on-surface-variant); font: inherit; }
.coaching-details summary:focus-visible { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }
.coaching-details-body { padding-bottom: var(--career-spacing-2); }
.response-section { margin-top: var(--career-spacing-3); }
.response-section > strong { color: var(--md-sys-color-primary); font: 500 var(--md-sys-typescale-label-medium-size) / var(--md-sys-typescale-label-medium-line-height) var(--md-ref-typeface-plain); }
.response-section ul { display: grid; gap: var(--career-spacing-1); margin: var(--career-spacing-1) 0 0; padding-left: var(--career-spacing-5); color: var(--md-sys-color-on-surface-variant); font: 400 var(--md-sys-typescale-body-small-size) / var(--md-sys-typescale-body-small-line-height) var(--md-ref-typeface-plain); }
.response-section p { margin: var(--career-spacing-1) 0 0; color: var(--md-sys-color-on-surface-variant); font: 400 var(--md-sys-typescale-body-small-size) / var(--md-sys-typescale-body-small-line-height) var(--md-ref-typeface-plain); }
.response-actions { display: flex; flex-wrap: wrap; gap: var(--career-spacing-2); margin-top: var(--career-spacing-3); }
.pending { display: flex; min-height: 52px; align-items: center; justify-content: center; }
.pending :deep(md-circular-progress) { --md-circular-progress-size: 28px; }
.mentor-panel > footer { min-width: 0; padding: var(--career-spacing-3); border-top: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface-container); }
.quick-questions { display: flex; width: 100%; min-width: 0; max-width: 100%; gap: var(--career-spacing-1); margin-bottom: var(--career-spacing-2); overflow-x: auto; overflow-y: hidden; overscroll-behavior-inline: contain; padding: 0 var(--career-spacing-1) var(--career-spacing-2) 0; scroll-snap-type: inline proximity; scrollbar-width: thin; }
.quick-questions > * { flex: 0 0 auto; scroll-snap-align: start; white-space: nowrap; }
.mentor-input { display: grid; grid-template-columns: minmax(0, 1fr) 48px; gap: var(--career-spacing-2); align-items: end; }
.mentor-input-field { max-height: 112px; }
.mentor-panel-enter-active, .mentor-panel-leave-active { transition: opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized), transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized); }
.mentor-panel-enter-from, .mentor-panel-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 599px) { .mentor-fab { right: var(--career-spacing-4); bottom: 96px; } .mentor-fab.panel-open { display: none; } .mentor-panel { inset: 72px var(--career-spacing-2) 88px; width: auto; height: auto; border-radius: var(--md-sys-shape-corner-large); } }
</style>
