/**
 * SSE (Server-Sent Events) 事件解析工具
 * 提供统一的SSE事件格式定义和解析方法
 */

/**
 * SSE事件类型枚举
 */
export enum SseEventType {
  /** 步骤进度事件 - 多步推理链的步骤更新 */
  STEP = 'step',
  /** 进度事件 - 单步内的部分结果 */
  PROGRESS = 'progress',
  /** Token事件 - 流式文本输出的增量token */
  TOKEN = 'token',
  /** 按钮事件 - 助手对话中的操作按钮 */
  BUTTONS = 'buttons',
  /** 完成事件 - 流式响应完成 */
  COMPLETE = 'complete',
  /** 完成事件（别名） - 兼容旧代码 */
  DONE = 'done',
  /** 错误事件 - 流式响应出错 */
  ERROR = 'error'
}

/**
 * 步骤进度事件数据
 */
export interface SseStepData {
  /** 当前步骤编号（从1开始） */
  step: number
  /** 总步骤数 */
  total: number
  /** 当前步骤摘要说明 */
  summary: string
}

/**
 * 进度事件数据
 */
export interface SseProgressData {
  /** 部分结果数据（具体结构由业务定义） */
  partial?: unknown
  /** 进度百分比（0-100，可选） */
  percentage?: number
}

/**
 * Token事件数据
 */
export interface SseTokenData {
  /** 增量文本内容 */
  text: string
}

/**
 * 按钮事件数据
 */
export interface SseButtonsData {
  /** 按钮列表 */
  buttons: Array<{
    /** 按钮显示文本 */
    label: string
    /** 按钮操作类型 */
    action: string
  }>
}

/**
 * 完成事件数据
 */
export interface SseCompleteData {
  /** 最终结果数据（具体结构由业务定义） */
  result?: unknown
}

/**
 * 错误事件数据
 */
export interface SseErrorData {
  /** 错误消息 */
  message: string
  /** 错误代码（可选） */
  code?: string
  /** 错误类型（可选）：NETWORK, TIMEOUT, AI_ERROR, EMPTY_RESPONSE, INVALID_JSON, SYSTEM_ERROR */
  errorType?: string
  /** 失败的步骤编号（可选） */
  step?: number
  /** 总步骤数（可选） */
  total?: number
  /** 用户建议（可选） */
  suggestion?: string
}

/**
 * 统一的SSE事件数据类型
 */
export type SseEventData =
  | SseStepData
  | SseProgressData
  | SseTokenData
  | SseButtonsData
  | SseCompleteData
  | SseErrorData

/**
 * SSE事件结构
 */
export interface SseEvent {
  /** 事件类型 */
  event: SseEventType
  /** 事件数据 */
  data: SseEventData
}

/**
 * SSE事件处理器类型定义
 */
export interface SseEventHandlers {
  /** 步骤进度事件处理器 */
  onStep?: (data: SseStepData) => void
  /** 进度事件处理器 */
  onProgress?: (data: SseProgressData) => void
  /** Token事件处理器 */
  onToken?: (data: SseTokenData) => void
  /** 按钮事件处理器 */
  onButtons?: (data: SseButtonsData) => void
  /** 完成事件处理器 */
  onComplete?: (data: SseCompleteData) => void
  /** 错误事件处理器 */
  onError?: (data: SseErrorData) => void
}

/**
 * 解析SSE事件行
 * @param eventLine 事件类型行（格式：event: xxx）
 * @param dataLine 数据行（格式：data: {...}）
 * @returns 解析后的SSE事件对象，解析失败返回null
 */
export function parseSseEvent(eventLine: string, dataLine: string): SseEvent | null {
  try {
    // 解析事件类型 - 支持 "event: xxx" 和 "event:xxx" 两种格式
    if (!eventLine.startsWith('event:')) {
      console.warn('Invalid SSE event line:', eventLine)
      return null
    }
    const eventType = eventLine.slice(6).trim() as SseEventType

    // 解析数据 - 支持 "data: xxx" 和 "data:xxx" 两种格式
    if (!dataLine.startsWith('data:')) {
      console.warn('Invalid SSE data line:', dataLine)
      return null
    }
    const dataStr = dataLine.slice(5).trim()

    // 空数据处理
    if (!dataStr || dataStr === '{}') {
      return {
        event: eventType,
        data: {}
      }
    }

    const data = JSON.parse(dataStr)

    return {
      event: eventType,
      data
    }
  } catch (e) {
    console.warn('Failed to parse SSE event:', e, { eventLine, dataLine })
    return null
  }
}

/**
 * 消费SSE流的通用方法
 * @param response Fetch Response对象
 * @param handlers 事件处理器对象
 * @param timeout 超时时间（毫秒），默认120秒
 * @returns Promise，流结束时resolve
 */
export async function consumeSseStream(
  response: Response,
  handlers: SseEventHandlers,
  timeout: number = 120000
): Promise<void> {
  if (!response.ok || !response.body) {
    throw new Error('Stream not supported or response not ok')
  }

  console.log('=== consumeSseStream 开始 ===')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let pendingEventLine: string | null = null  // 跨数据块保存未配对的 event 行

  // 创建超时 Promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reader.cancel()
      console.warn('SSE stream timeout, cancelling reader')
      reject(new Error('Stream timeout'))
    }, timeout)
  })

  // 创建读取流的 Promise
  const streamPromise = (async () => {
    try {
      let _chunkCount = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        _chunkCount++
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        // 处理每一行
        for (const line of lines) {
          if (line.startsWith('event:')) {
            // 保存 event 行，等待下一个 data 行
            pendingEventLine = line
          } else if (line.startsWith('data:') && pendingEventLine) {
            // 找到配对的 data 行，解析事件
            const event = parseSseEvent(pendingEventLine, line)
            pendingEventLine = null  // 清空待配对状态

            if (!event) {
              console.warn('事件解析失败')
              continue
            }

            // 分发到对应的处理器
            switch (event.event) {
              case SseEventType.STEP:
                handlers.onStep?.(event.data as SseStepData)
                break
              case SseEventType.PROGRESS:
                handlers.onProgress?.(event.data as SseProgressData)
                break
              case SseEventType.TOKEN:
                handlers.onToken?.(event.data as SseTokenData)
                break
              case SseEventType.BUTTONS:
                handlers.onButtons?.(event.data as SseButtonsData)
                break
              case SseEventType.COMPLETE:
              case SseEventType.DONE:
                handlers.onComplete?.(event.data as SseCompleteData)
                break
              case SseEventType.ERROR:
                handlers.onError?.(event.data as SseErrorData)
                break
              default:
                console.warn('Unknown SSE event type:', event.event)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  })()

  // 使用 Promise.race 来处理超时
  await Promise.race([streamPromise, timeoutPromise])
}

/**
 * 创建SSE事件消费器（简化版）
 * 返回一个函数，调用时开始消费流
 */
export function createSseConsumer(handlers: SseEventHandlers, timeout?: number) {
  return async (response: Response) => {
    await consumeSseStream(response, handlers, timeout)
  }
}
