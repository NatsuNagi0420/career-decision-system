import { reactive } from 'vue'

export type SnackbarTone = 'success' | 'info' | 'warning' | 'error'

export type SnackbarItem = {
  id: number
  message: string
  tone: SnackbarTone
  duration: number
}

export type ConfirmOptions = {
  confirmButtonText?: string
  cancelButtonText?: string
  type?: 'warning' | 'error' | 'info' | 'success'
}

export class M3ConfirmCancelledError extends Error {
  constructor() {
    super('Dialog cancelled')
    this.name = 'M3ConfirmCancelledError'
  }
}

export const snackbarState = reactive<{ queue: SnackbarItem[] }>({ queue: [] })

export const confirmState = reactive({
  open: false,
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  tone: 'warning' as ConfirmOptions['type']
})

let snackbarId = 0
let confirmResolve: (() => void) | null = null
let confirmReject: ((reason: Error) => void) | null = null

function enqueue(message: unknown, tone: SnackbarTone) {
  const text = typeof message === 'string' ? message : String(message ?? '')
  if (!text.trim()) return
  const last = snackbarState.queue[snackbarState.queue.length - 1]
  if (last?.message === text && last.tone === tone) return
  snackbarState.queue.push({
    id: ++snackbarId,
    message: text,
    tone,
    duration: tone === 'error' ? 6000 : 4000
  })
}

export const m3Message = {
  success: (message: unknown) => enqueue(message, 'success'),
  info: (message: unknown) => enqueue(message, 'info'),
  warning: (message: unknown) => enqueue(message, 'warning'),
  error: (message: unknown) => enqueue(message, 'error')
}

export function dismissSnackbar(id: number) {
  const index = snackbarState.queue.findIndex((item) => item.id === id)
  if (index >= 0) snackbarState.queue.splice(index, 1)
}

export function m3Confirm(message: string, title = '请确认', options: ConfirmOptions = {}) {
  if (confirmReject) confirmReject(new M3ConfirmCancelledError())
  confirmState.open = true
  confirmState.title = title
  confirmState.message = message
  confirmState.confirmText = options.confirmButtonText || '确认'
  confirmState.cancelText = options.cancelButtonText || '取消'
  confirmState.tone = options.type || 'warning'
  return new Promise<void>((resolve, reject) => {
    confirmResolve = resolve
    confirmReject = reject
  })
}

export function acceptConfirm() {
  confirmState.open = false
  confirmResolve?.()
  confirmResolve = null
  confirmReject = null
}

export function cancelConfirm() {
  confirmState.open = false
  confirmReject?.(new M3ConfirmCancelledError())
  confirmResolve = null
  confirmReject = null
}
