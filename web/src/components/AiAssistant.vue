<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getUserInfo } from '@/utils/auth'
import { ElMessage } from 'element-plus'
import { assistantChatApi, assistantChatStreamApi } from '@/api/assistant'
import { loadPathPlan, loadTargetJob } from '@/utils/storage'
import { consumeSseStream, type SseEventHandlers } from '@/utils/sseParser'

type AssistantAction = {
  label: string
  kind: 'navigate'
  to: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: AssistantAction[]
  pending?: boolean
}

const route = useRoute()
const router = useRouter()

const isOpen = ref(false)
const input = ref('')
const isSending = ref(false)
const pendingReplyId = ref<string | null>(null)
const targetJobText = ref('未选择')
const planProgressText = ref('未生成')
const messages = ref<ChatMessage[]>([
  {
    id: 'm-hello',
    role: 'assistant',
    content:
      '你好，我是你的职场规划助手星途。你可以问我：这一步该做什么、如何筛选岗位、如何拆解计划。'
  }
])

const pageLabel = computed(() => {
  const p = route.path
  if (p.startsWith('/entry')) return '信息录入'
  if (p === '/capability-profile') return '能力画像'
  if (p === '/job-exploration') return '岗位探索'
  if (p === '/path-planning') return '路径规划'
  if (p === '/report') return '报告生成'
  return '全站'
})

const quickQuestions = computed(() => {
  const p = route.path
  if (p === '/capability-profile') return ['解释我的画像', '为什么推荐这些岗位', '下一步做什么']
  if (p === '/job-exploration') return ['如何筛选薪资', '匹配度怎么看', '帮我选目标岗位']
  if (p === '/path-planning') return ['怎么补齐差距', '给我一周计划', '下一步做什么']
  if (p === '/report') return ['帮我润色报告摘要', '怎么执行这个计划', '下一步做什么']
  if (p.startsWith('/entry')) return ['如何完善信息', 'MBTI 有什么用', '下一步做什么']
  return ['如何开始', '平台能做什么', '下一步做什么']
})

const contextSummary = computed(() => {
  const user = getUserInfo()
  return {
    userName: user?.username || '未登录',
    page: pageLabel.value,
    targetJob: targetJobText.value,
    planProgress: planProgressText.value
  }
})

const STORAGE_KEY = 'ai_assistant_pos_v1'
const FAB_SIZE = 56
const FAB_MARGIN = 16
const FAB_BOTTOM_SAFE = 100
const PANEL_GAP = 12
const PANEL_HEIGHT = 560

const viewportW = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const viewportH = ref(typeof window !== 'undefined' ? window.innerHeight : 800)
const isMobile = computed(() => viewportW.value <= 768)
const panelWidth = computed(() => (isMobile.value ? Math.max(320, viewportW.value - 24) : 380))

type Point = { x: number; y: number }
const fabPos = ref<Point>({ x: 0, y: 0 })
const fabStyle = computed(() => ({ left: `${fabPos.value.x}px`, top: `${fabPos.value.y}px` }))

const panelPlacement = computed<'above' | 'below'>(() => {
  const aboveTop = fabPos.value.y - PANEL_GAP - PANEL_HEIGHT
  return aboveTop >= FAB_MARGIN ? 'above' : 'below'
})

const panelPos = computed(() => {
  const w = panelWidth.value
  const h = PANEL_HEIGHT
  const maxLeft = Math.max(FAB_MARGIN, viewportW.value - FAB_MARGIN - w)
  const baseLeft = Math.min(maxLeft, Math.max(FAB_MARGIN, fabPos.value.x + FAB_SIZE - w))

  const top =
    panelPlacement.value === 'above'
      ? fabPos.value.y - PANEL_GAP - h
      : fabPos.value.y + FAB_SIZE + PANEL_GAP
  const maxTop = Math.max(FAB_MARGIN, viewportH.value - FAB_MARGIN - h)
  const safeTop = Math.min(maxTop, Math.max(FAB_MARGIN, top))

  return { left: baseLeft, top: safeTop, width: w, height: h }
})

const panelStyle = computed(() => ({
  left: `${panelPos.value.left}px`,
  top: `${panelPos.value.top}px`,
  width: `${panelPos.value.width}px`,
  height: `${panelPos.value.height}px`
}))

const clampFabPos = (p: Point): Point => {
  const maxX = Math.max(FAB_MARGIN, viewportW.value - FAB_MARGIN - FAB_SIZE)
  const maxY = Math.max(FAB_MARGIN, viewportH.value - FAB_MARGIN - FAB_SIZE)
  return {
    x: Math.min(maxX, Math.max(FAB_MARGIN, p.x)),
    y: Math.min(maxY, Math.max(FAB_MARGIN, p.y))
  }
}

const setFabPos = (p: Point) => {
  fabPos.value = clampFabPos(p)
}

const loadFabPos = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const obj = JSON.parse(raw) as Partial<Point>
    if (typeof obj?.x !== 'number' || typeof obj?.y !== 'number') return false
    setFabPos({ x: obj.x, y: obj.y })
    return true
  } catch {
    return false
  }
}

const saveFabPos = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fabPos.value))
  } catch {
    // ignore
  }
}

const initFabPos = () => {
  const loaded = loadFabPos()
  if (loaded) return
  const x = Math.max(FAB_MARGIN, viewportW.value - FAB_MARGIN - FAB_SIZE)
  const y = Math.max(FAB_MARGIN, viewportH.value - FAB_BOTTOM_SAFE)
  setFabPos({ x, y })
}

const refreshContext = () => {
  const job = loadTargetJob()
  const plan = loadPathPlan()
  targetJobText.value = job ? `${job.jobName}（${job.city}）` : '未选择'
  if (plan) {
    const tasks = plan.stages.flatMap(s => s.tasks)
    planProgressText.value = `${tasks.filter(t => t.done).length}/${tasks.length}`
  } else {
    planProgressText.value = '未生成'
  }
}

const toggle = async () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    refreshContext()
    await nextTick()
    scrollToBottom()
  }
}

watch(
  () => route.path,
  async () => {
    if (!isOpen.value) return
    refreshContext()
    await nextTick()
    scrollToBottom()
  }
)

const bodyRef = ref<HTMLElement | null>(null)
const scrollToBottom = () => {
  const el = bodyRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

const fabRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const activePointerId = ref<number | null>(null)
const dragStartPointer = ref<Point | null>(null)
const dragStartFab = ref<Point | null>(null)
const didDrag = ref(false)

const onFabPointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return
  const el = fabRef.value
  if (!el) return

  activePointerId.value = e.pointerId
  dragStartPointer.value = { x: e.clientX, y: e.clientY }
  dragStartFab.value = { ...fabPos.value }
  didDrag.value = false
  isDragging.value = true
  el.setPointerCapture(e.pointerId)
}

const onFabPointerMove = (e: PointerEvent) => {
  if (activePointerId.value !== e.pointerId) return
  if (!dragStartPointer.value || !dragStartFab.value) return

  const dx = e.clientX - dragStartPointer.value.x
  const dy = e.clientY - dragStartPointer.value.y
  if (!didDrag.value && Math.hypot(dx, dy) > 4) didDrag.value = true
  setFabPos({ x: dragStartFab.value.x + dx, y: dragStartFab.value.y + dy })
}

const onFabPointerUp = (e: PointerEvent) => {
  if (activePointerId.value !== e.pointerId) return
  const el = fabRef.value
  if (el) el.releasePointerCapture(e.pointerId)
  activePointerId.value = null
  dragStartPointer.value = null
  dragStartFab.value = null

  if (didDrag.value) {
    const centerX = fabPos.value.x + FAB_SIZE / 2
    const x =
      centerX < viewportW.value / 2 ? FAB_MARGIN : Math.max(FAB_MARGIN, viewportW.value - FAB_MARGIN - FAB_SIZE)
    setFabPos({ x, y: fabPos.value.y })
    saveFabPos()
  } else {
    toggle()
  }
  isDragging.value = false
}

const onFabPointerCancel = (e: PointerEvent) => {
  if (activePointerId.value !== e.pointerId) return
  const el = fabRef.value
  if (el) el.releasePointerCapture(e.pointerId)
  activePointerId.value = null
  dragStartPointer.value = null
  dragStartFab.value = null
  isDragging.value = false
}

const onResize = () => {
  viewportW.value = window.innerWidth
  viewportH.value = window.innerHeight
  setFabPos(fabPos.value)
}

const handleProactiveMessage = (event: Event) => {
  const customEvent = event as CustomEvent<{ message: string; buttons: unknown[] }>
  if (!customEvent.detail?.message) return

  const msgId = `m-proactive-${Date.now()}`
  const parsed = parseReply(customEvent.detail.message)

  pushMessage({
    id: msgId,
    role: 'assistant',
    content: parsed.text,
    actions: parsed.actions
  })

  // 如果助手面板未打开，可以选择自动打开或显示提示
  if (!isOpen.value) {
    // 可选：自动打开面板
    // isOpen.value = true
    // 或者显示一个提示
    ElMessage.info('AI 助手有新消息')
  }
}

onMounted(() => {
  viewportW.value = window.innerWidth
  viewportH.value = window.innerHeight
  initFabPos()
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('proactive-message', handleProactiveMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('proactive-message', handleProactiveMessage)
})

const pushMessage = (msg: ChatMessage) => {
  messages.value.push(msg)
  nextTick(scrollToBottom)
}

type AssistantMessagePatch = Partial<Pick<ChatMessage, 'content' | 'actions' | 'pending'>>

const upsertAssistantMessage = (id: string, patch: AssistantMessagePatch) => {
  const idx = messages.value.findIndex(m => m.id === id)
  if (idx < 0) return
  const cur = messages.value[idx]
  if (!cur) return
  messages.value[idx] = { ...cur, ...patch }
  nextTick(scrollToBottom)
}

const parseReply = (raw: string): { text: string; actions: AssistantAction[] } => {
  const s = (raw ?? '').trim()

  const actionMap: Record<string, string> = {
    'go:capability-profile': '/capability-profile',
    'go:job-exploration': '/job-exploration',
    'go:path-planning': '/path-planning',
    'go:report': '/report',
    'go:generate-plan': '/path-planning',
    'go-job-exploration': '/job-exploration',
    'go-path-planning': '/path-planning',
    'go-report': '/report'
  }

  const tailJsonMatch = s.match(/(\{\s*"buttons"\s*:\s*\[[\s\S]*?\]\s*\})\s*$/)
  if (tailJsonMatch?.[1]) {
    const jsonPart = tailJsonMatch[1]
    const text = s.slice(0, s.length - jsonPart.length).trim() || s
    try {
      const obj = JSON.parse(jsonPart) as { buttons?: Array<{ label: string; action: string }> }
      const buttons = Array.isArray(obj.buttons) ? obj.buttons : []
      const actions: AssistantAction[] = buttons
        .map(b => {
          const label = b?.label?.trim()
          const action = b?.action?.trim()
          if (!label || !action) return null
          const to = actionMap[action]
          if (!to) return null
          return { label, kind: 'navigate' as const, to }
        })
        .filter(Boolean) as AssistantAction[]

      return { text, actions }
    } catch {
      return { text, actions: [] }
    }
  }

  return { text: s, actions: [] }
}

const buildNextActions = (): AssistantAction[] => {
  const p = route.path
  if (p.startsWith('/entry')) return [{ label: '去能力画像', kind: 'navigate', to: '/capability-profile' }]
  if (p === '/capability-profile') return [{ label: '去岗位探索', kind: 'navigate', to: '/job-exploration' }]
  if (p === '/job-exploration') return [{ label: '去路径规划', kind: 'navigate', to: '/path-planning' }]
  if (p === '/path-planning') return [{ label: '去报告生成', kind: 'navigate', to: '/report' }]
  return []
}

const send = async (preset?: string) => {
  const text = (preset ?? input.value).trim()
  if (!text) return
  if (isSending.value) return
  if (!getUserInfo()?.id) {
    ElMessage.warning('请先登录后再使用星途助手')
    router.push('/login')
    return
  }

  input.value = ''
  pushMessage({ id: `m-u-${Date.now()}`, role: 'user', content: text })

  isSending.value = true
  const thinkingId = `m-a-thinking-${Date.now()}`
  pendingReplyId.value = thinkingId
  pushMessage({
    id: thinkingId,
    role: 'assistant',
    content: '',
    pending: true
  })

  const payload = {
    page: route.path,
    message: text,
    context: contextSummary.value as unknown as Record<string, unknown>
  }

  try {
    const response = await assistantChatStreamApi(payload)

    if (!response.ok || !response.body) {
      throw new Error('Stream not supported')
    }

    let fullContent = ''

    const handlers: SseEventHandlers = {
      onToken: (data) => {
        fullContent += data.text || ''
        upsertAssistantMessage(thinkingId, { content: fullContent, pending: true })
      },
      onButtons: (data) => {
        const actions: AssistantAction[] = (data.buttons || [])
          .map((b: { label: string; action: string }) => {
            const actionMap: Record<string, string> = {
              'go:capability-profile': '/capability-profile',
              'go:job-exploration': '/job-exploration',
              'go:path-planning': '/path-planning',
              'go:report': '/report'
            }
            const to = actionMap[b.action]
            if (!to) return null
            return { label: b.label, kind: 'navigate' as const, to }
          })
          .filter(Boolean) as AssistantAction[]

        // 从文本中移除 JSON 部分
        const jsonMatch = fullContent.match(/\s*\{["']buttons["']:\s*\[.*?\]\s*\}\s*$/s)
        if (jsonMatch) {
          fullContent = fullContent.substring(0, jsonMatch.index).trim()
        }

        upsertAssistantMessage(thinkingId, { content: fullContent, actions, pending: false })
      },
      onComplete: () => {
        upsertAssistantMessage(thinkingId, { pending: false })
      },
      onError: () => {
        upsertAssistantMessage(thinkingId, {
          content: '抱歉，我遇到了一些问题，请稍后再试。',
          pending: false
        })
      }
    }

    await consumeSseStream(response, handlers, 120000)
  } catch (error) {
    console.warn('Streaming failed, fallback to non-streaming:', error)
    try {
      const res = await assistantChatApi(payload)
      const parsed = parseReply(res.reply)
      const content = parsed.text || '我正在思考，你也可以换个问法试试。'
      const actions = parsed.actions.length ? parsed.actions : text.includes('下一步') ? buildNextActions() : []
      upsertAssistantMessage(thinkingId, { content, actions, pending: false })
    } catch {
      ElMessage.error('星途暂时不可用，请稍后重试')
      upsertAssistantMessage(thinkingId, {
        content: '我这边连接有点问题，稍后再试试。你也可以先继续当前步骤，我会在你需要时提供建议。',
        pending: false
      })
    }
  } finally {
    isSending.value = false
    if (pendingReplyId.value === thinkingId) pendingReplyId.value = null
  }
}

const runAction = (a: AssistantAction) => {
  if (a.kind === 'navigate') router.push(a.to)
}
</script>

<template>
  <div class="ai-assistant-wrapper">
    <div
      ref="fabRef"
      class="ai-fab"
      :class="{ active: isOpen, dragging: isDragging }"
      :style="fabStyle"
      @pointerdown.prevent="onFabPointerDown"
      @pointermove.prevent="onFabPointerMove"
      @pointerup.prevent="onFabPointerUp"
      @pointercancel.prevent="onFabPointerCancel"
    >
      <div class="fab-halo" />
      <svg class="fab-note note-1" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 3v10.5a3.5 3.5 0 1 1-2-3.15V6h7V3z" />
      </svg>
      <svg class="fab-note note-2" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 4v10.7a3.3 3.3 0 1 1-2-3V7h8V4z" />
      </svg>
      <div class="fab-inner">
        <div class="fab-top">
          <span class="fab-ai">AI</span>
          <span class="fab-dot" />
        </div>
        <div class="fab-name">星途</div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="panel-pop">
        <div v-if="isOpen" class="ai-panel" :style="panelStyle" @click.stop>
          <div class="panel-header">
            <div class="header-left">
              <div class="avatar">星</div>
              <div>
                <div class="panel-title">星途</div>
                <div class="panel-sub">当前：{{ pageLabel }}</div>
              </div>
            </div>
            <svg class="header-wave" viewBox="0 0 240 36" aria-hidden="true">
              <path d="M0 20 C 16 12, 24 28, 40 20 S 64 12, 80 20 S 104 28, 120 20 S 144 12, 160 20 S 184 28, 200 20 S 224 12, 240 20" />
            </svg>
            <button class="close" type="button" @click="toggle">×</button>
          </div>

          <div class="panel-context">
            <details class="context-details">
              <summary class="context-summary">上下文摘要</summary>
              <div class="context-grid">
                <div class="context-item">
                  <div class="k">用户</div>
                  <div class="v">{{ contextSummary.userName }}</div>
                </div>
                <div class="context-item">
                  <div class="k">页面</div>
                  <div class="v">{{ contextSummary.page }}</div>
                </div>
                <div class="context-item">
                  <div class="k">目标岗位</div>
                  <div class="v">{{ contextSummary.targetJob }}</div>
                </div>
                <div class="context-item">
                  <div class="k">计划完成</div>
                  <div class="v">{{ contextSummary.planProgress }}</div>
                </div>
              </div>
            </details>
          </div>

          <div ref="bodyRef" class="panel-body">
            <TransitionGroup name="msg-pop" tag="div">
              <div
                v-for="m in messages"
                :key="m.id"
                class="msg"
                :class="[m.role, { pending: !!m.pending }]"
              >
                <div class="bubble">
                  <div class="text">{{ m.content }}</div>
                  <div v-if="m.pending" class="typing">
                    <span class="dot" />
                    <span class="dot" />
                    <span class="dot" />
                  </div>
                  <div v-if="m.actions && m.actions.length" class="actions">
                    <button
                      v-for="a in m.actions"
                      :key="a.label"
                      class="action-btn"
                      type="button"
                      @click="runAction(a)"
                    >
                      {{ a.label }}
                    </button>
                  </div>
                </div>
              </div>
            </TransitionGroup>
          </div>

          <div class="panel-footer">
            <div class="quick">
              <button
                v-for="q in quickQuestions"
                :key="q"
                type="button"
                class="quick-btn"
                @click="send(q)"
              >
                {{ q }}
              </button>
            </div>
            <div class="input-row">
              <el-input v-model="input" placeholder="输入你的问题…" @keyup.enter="send()" />
              <el-button type="primary" :loading="isSending" @click="send()">发送</el-button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ai-fab {
  position: fixed;
  z-index: 1003;
  width: 56px;
  height: 56px;
  touch-action: none;
  user-select: none;
}

.fab-halo {
  position: absolute;
  inset: -10px;
  border-radius: 999px;
  background:
    radial-gradient(closest-side, rgba(248, 204, 101, 0.35), rgba(248, 204, 101, 0)),
    radial-gradient(closest-side, rgba(193, 176, 255, 0.3), rgba(193, 176, 255, 0));
  filter: blur(1px);
  opacity: 0.9;
  animation: haloPulse 2.2s ease-in-out infinite;
  pointer-events: none;
}

.fab-note {
  position: absolute;
  width: 18px;
  height: 18px;
  fill: var(--clay-ube-800);
  opacity: 0.75;
  filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.16));
  pointer-events: none;
}

.ai-fab.dragging .fab-note {
  opacity: 0;
}

.note-1 {
  left: -6px;
  top: 6px;
  animation: noteFloat1 2.8s ease-in-out infinite;
}

.note-2 {
  right: -6px;
  bottom: 8px;
  opacity: 0.55;
  fill: var(--clay-matcha-300);
  animation: noteFloat2 3.2s ease-in-out infinite;
}

.ai-fab.dragging .fab-halo {
  animation: none;
  opacity: 0.6;
}

.fab-inner {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: grab;
  color: #fff;
  background:
    radial-gradient(120% 120% at 20% 20%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0) 55%),
    linear-gradient(135deg, #000000 0%, var(--clay-ube-800) 52%, var(--clay-matcha-800) 100%);
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.18),
    0 4px 10px rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.24);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.ai-fab.active .fab-inner {
  box-shadow:
    0 14px 30px rgba(15, 23, 42, 0.22),
    0 6px 14px rgba(0, 0, 0, 0.3);
}

.fab-inner:hover {
  transform: translateY(-1px) scale(1.03);
}

.ai-fab.dragging .fab-inner {
  transform: scale(1.02);
  cursor: grabbing;
}

.fab-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  line-height: 1;
}

.fab-ai {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.3px;
  opacity: 0.92;
}

.fab-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.18);
}

.fab-name {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 700;
  opacity: 0.95;
}

.ai-panel {
  position: fixed;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--clay-border-subtle);
  border-radius: 18px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 1004;
  backdrop-filter: blur(12px);
}

.panel-header {
  padding: 12px 14px;
  background:
    radial-gradient(120% 120% at 10% 0%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0) 55%),
    linear-gradient(135deg, #000000 0%, var(--clay-ube-800) 52%, var(--clay-matcha-800) 100%);
  color: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.header-wave {
  width: 118px;
  height: 18px;
  opacity: 0.6;
  margin-right: 6px;
}

.header-wave path {
  fill: none;
  stroke: rgba(255, 255, 255, 0.88);
  stroke-width: 2.2;
  stroke-linecap: round;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.22);
  font-weight: 900;
  letter-spacing: 0.5px;
}

.panel-title {
  font-weight: 900;
  line-height: 1.1;
}

.panel-sub {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 4px;
}

.close {
  border: none;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  transition: background 0.15s ease, transform 0.15s ease;
}

.close:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
}

.panel-context {
  padding: 10px 14px;
  border-bottom: 1px solid var(--clay-border-subtle);
  background: rgba(248, 250, 252, 0.9);
}

.context-details {
  font-size: 12px;
}

.context-summary {
  cursor: pointer;
  color: #0f172a;
  font-weight: 700;
}

.context-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.context-item {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  padding: 8px 10px;
}

.k {
  color: #a8a29e;
  margin-bottom: 4px;
}

.v {
  color: #334155;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-body {
  flex: 1;
  padding: 12px 12px;
  overflow: auto;
  background:
    radial-gradient(120% 120% at 0% 0%, rgba(248, 204, 101, 0.16) 0%, rgba(248, 204, 101, 0) 55%),
    #ffffff;
}

.msg {
  display: flex;
  margin-bottom: 10px;
}

.msg.user {
  justify-content: flex-end;
}

.bubble {
  max-width: 84%;
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.msg.user .bubble {
  border-color: rgba(50, 3, 125, 0.26);
  background:
    radial-gradient(120% 120% at 0% 0%, rgba(193, 176, 255, 0.22) 0%, rgba(193, 176, 255, 0.08) 55%),
    rgba(254, 246, 231, 0.96);
}

.text {
  color: #0f172a;
  font-size: 13px;
  line-height: 1.6;
}

.actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-btn {
  border: 1px solid var(--clay-border-subtle);
  background: #fef6e7;
  color: var(--clay-ube-900);
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.action-btn:hover {
  background: #f5efe2;
  border-color: var(--clay-border);
  color: #000000;
}

.panel-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--clay-border-subtle);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
}

.panel-pop-enter-active,
.panel-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.panel-pop-enter-from,
.panel-pop-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.msg-pop-enter-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.msg-pop-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.typing {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
  animation: dotPulse 1s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.15s;
}

.dot:nth-child(3) {
  animation-delay: 0.3s;
}

.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.quick-btn {
  border: 1px solid var(--clay-border-subtle);
  background: rgba(255, 255, 255, 0.96);
  color: #475569;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.quick-btn:hover {
  background: #fef6e7;
  border-color: var(--clay-border);
  color: var(--clay-ube-800);
}

.input-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}

@media (max-width: 768px) {
  .ai-panel {
    border-radius: 16px;
  }
}

@keyframes haloPulse {
  0% {
    transform: scale(0.92);
    opacity: 0.65;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.95;
  }
  100% {
    transform: scale(0.92);
    opacity: 0.65;
  }
}

@keyframes noteFloat1 {
  0% {
    transform: translateY(1px) rotate(-8deg);
  }
  50% {
    transform: translateY(-5px) rotate(6deg);
  }
  100% {
    transform: translateY(1px) rotate(-8deg);
  }
}

@keyframes noteFloat2 {
  0% {
    transform: translateY(-1px) rotate(10deg);
  }
  50% {
    transform: translateY(6px) rotate(-6deg);
  }
  100% {
    transform: translateY(-1px) rotate(10deg);
  }
}

@keyframes dotPulse {
  0% {
    opacity: 0.35;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
}
</style>
