import request from '@/utils/request'
import type { ActivitySignal } from '@/utils/activityMonitor'

export type ActivitySignalResponse = {
  shouldPush: boolean
  message: string
  buttons: unknown[]
}

export const sendActivitySignalApi = (signal: ActivitySignal) =>
  request<ActivitySignalResponse>({
    url: '/activity/signal',
    method: 'post',
    data: signal,
    showError: false
  })
