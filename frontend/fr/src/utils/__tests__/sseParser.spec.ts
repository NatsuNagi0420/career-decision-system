import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SseEventType,
  parseSseEvent,
  consumeSseStream,
  createSseConsumer,
  type SseEventHandlers,
  type SseStepData,
  type SseCompleteData,
  type SseErrorData
} from '../sseParser'

describe('sseParser', () => {
  describe('parseSseEvent', () => {
    it('should parse step event correctly', () => {
      const eventLine = 'event: step'
      const dataLine = 'data: {"step":1,"total":5,"summary":"Processing..."}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).not.toBeNull()
      expect(result!.event).toBe(SseEventType.STEP)
      expect((result!.data as SseStepData).step).toBe(1)
      expect((result!.data as SseStepData).total).toBe(5)
      expect((result!.data as SseStepData).summary).toBe('Processing...')
    })

    it('should parse complete event correctly', () => {
      const eventLine = 'event: complete'
      const dataLine = 'data: {"result":{"summary":"Done","nodes":[]}}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).not.toBeNull()
      expect(result!.event).toBe(SseEventType.COMPLETE)
      expect((result!.data as SseCompleteData).result).toBeDefined()
    })

    it('should parse error event correctly', () => {
      const eventLine = 'event: error'
      const dataLine = 'data: {"message":"Network error","errorType":"NETWORK","suggestion":"Check connection"}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).not.toBeNull()
      expect(result!.event).toBe(SseEventType.ERROR)
      expect((result!.data as SseErrorData).message).toBe('Network error')
      expect((result!.data as SseErrorData).errorType).toBe('NETWORK')
    })

    it('should handle event line without space after colon', () => {
      const eventLine = 'event:step'
      const dataLine = 'data:{"step":1,"total":5,"summary":"Test"}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).not.toBeNull()
      expect(result?.event).toBe(SseEventType.STEP)
    })

    it('should handle empty data', () => {
      const eventLine = 'event: complete'
      const dataLine = 'data: {}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).not.toBeNull()
      expect(result?.event).toBe(SseEventType.COMPLETE)
      expect(result?.data).toEqual({})
    })

    it('should return null for invalid event line', () => {
      const eventLine = 'invalid: step'
      const dataLine = 'data: {"step":1}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).toBeNull()
    })

    it('should return null for invalid data line', () => {
      const eventLine = 'event: step'
      const dataLine = 'invalid: {"step":1}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).toBeNull()
    })

    it('should return null for invalid JSON', () => {
      const eventLine = 'event: step'
      const dataLine = 'data: {invalid json}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).toBeNull()
    })

    it('should parse token event correctly', () => {
      const eventLine = 'event: token'
      const dataLine = 'data: {"text":"Hello "}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).not.toBeNull()
      expect(result?.event).toBe(SseEventType.TOKEN)
    })

    it('should parse progress event correctly', () => {
      const eventLine = 'event: progress'
      const dataLine = 'data: {"percentage":50,"partial":{"data":"test"}}'

      const result = parseSseEvent(eventLine, dataLine)

      expect(result).not.toBeNull()
      expect(result?.event).toBe(SseEventType.PROGRESS)
    })
  })

  describe('consumeSseStream', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleWarnSpy.mockRestore()
      vi.restoreAllMocks()
    })

    it('should consume stream and call handlers', async () => {
      const onStep = vi.fn()
      const onComplete = vi.fn()

      const handlers: SseEventHandlers = {
        onStep,
        onComplete
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":1,"total":3,"summary":"Step 1"}\n\n'))
          controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":2,"total":3,"summary":"Step 2"}\n\n'))
          controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"result":"Done"}\n\n'))
          controller.close()
        }
      })

      const response = new Response(stream, { status: 200 })

      await consumeSseStream(response, handlers, 5000)

      expect(onStep).toHaveBeenCalledTimes(2)
      expect(onStep).toHaveBeenCalledWith({ step: 1, total: 3, summary: 'Step 1' })
      expect(onStep).toHaveBeenCalledWith({ step: 2, total: 3, summary: 'Step 2' })
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith({ result: 'Done' })
    })

    it('should handle error events', async () => {
      const onError = vi.fn()

      const handlers: SseEventHandlers = {
        onError
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: error\ndata: {"message":"Test error","errorType":"NETWORK"}\n\n'))
          controller.close()
        }
      })

      const response = new Response(stream, { status: 200 })

      await consumeSseStream(response, handlers, 5000)

      expect(onError).toHaveBeenCalledWith({
        message: 'Test error',
        errorType: 'NETWORK'
      })
    })

    it('should handle done event as alias for complete', async () => {
      const onComplete = vi.fn()

      const handlers: SseEventHandlers = {
        onComplete
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: done\ndata: {"result":"Finished"}\n\n'))
          controller.close()
        }
      })

      const response = new Response(stream, { status: 200 })

      await consumeSseStream(response, handlers, 5000)

      expect(onComplete).toHaveBeenCalledWith({ result: 'Finished' })
    })

    it('should handle events split across chunks', async () => {
      const onStep = vi.fn()

      const handlers: SseEventHandlers = {
        onStep
      }

      const stream = new ReadableStream({
        start(controller) {
          // Split event across multiple chunks
          controller.enqueue(new TextEncoder().encode('event: step\n'))
          controller.enqueue(new TextEncoder().encode('data: {"step":1,"total":2,"summary":"Split event"}\n\n'))
          controller.close()
        }
      })

      const response = new Response(stream, { status: 200 })

      await consumeSseStream(response, handlers, 5000)

      expect(onStep).toHaveBeenCalledWith({ step: 1, total: 2, summary: 'Split event' })
    })

    it('should throw error if response is not ok', async () => {
      const response = new Response(null, { status: 500 })

      await expect(
        consumeSseStream(response, {}, 5000)
      ).rejects.toThrow('Stream not supported or response not ok')
    })

    it('should throw error if response has no body', async () => {
      const response = new Response(null, { status: 200 })

      await expect(
        consumeSseStream(response, {}, 5000)
      ).rejects.toThrow('Stream not supported or response not ok')
    })

    it('should handle timeout', async () => {
      let timeoutId: NodeJS.Timeout
      const stream = new ReadableStream({
        start(controller) {
          // Never close the stream
          timeoutId = setTimeout(() => {
            try {
              controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":1}\n\n'))
            } catch {
              // Ignore if controller is already closed
            }
          }, 200)
        },
        cancel() {
          clearTimeout(timeoutId)
        }
      })

      const response = new Response(stream, { status: 200 })

      await expect(
        consumeSseStream(response, {}, 100) // 100ms timeout
      ).rejects.toThrow()
    })

    it('should handle multiple event types in one stream', async () => {
      const onStep = vi.fn()
      const onProgress = vi.fn()
      const onToken = vi.fn()
      const onComplete = vi.fn()

      const handlers: SseEventHandlers = {
        onStep,
        onProgress,
        onToken,
        onComplete
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":1,"total":2,"summary":"Starting"}\n\n'))
          controller.enqueue(new TextEncoder().encode('event: progress\ndata: {"percentage":25}\n\n'))
          controller.enqueue(new TextEncoder().encode('event: token\ndata: {"text":"Hello"}\n\n'))
          controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"result":"Done"}\n\n'))
          controller.close()
        }
      })

      const response = new Response(stream, { status: 200 })

      await consumeSseStream(response, handlers, 5000)

      expect(onStep).toHaveBeenCalledTimes(1)
      expect(onProgress).toHaveBeenCalledTimes(1)
      expect(onToken).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('should warn on unknown event type', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: unknown\ndata: {"test":"data"}\n\n'))
          controller.close()
        }
      })

      const response = new Response(stream, { status: 200 })

      await consumeSseStream(response, {}, 5000)

      expect(consoleWarnSpy).toHaveBeenCalledWith('Unknown SSE event type:', 'unknown')
    })

    it('should skip invalid events without crashing', async () => {
      const onStep = vi.fn()

      const handlers: SseEventHandlers = {
        onStep
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: step\ndata: {invalid json}\n\n'))
          controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":1,"total":1,"summary":"Valid"}\n\n'))
          controller.close()
        }
      })

      const response = new Response(stream, { status: 200 })

      await consumeSseStream(response, handlers, 5000)

      expect(onStep).toHaveBeenCalledTimes(1)
      expect(onStep).toHaveBeenCalledWith({ step: 1, total: 1, summary: 'Valid' })
    })
  })

  describe('createSseConsumer', () => {
    it('should create a consumer function', () => {
      const handlers: SseEventHandlers = {
        onComplete: vi.fn()
      }

      const consumer = createSseConsumer(handlers, 5000)

      expect(typeof consumer).toBe('function')
    })

    it('should consume stream when called', async () => {
      const onComplete = vi.fn()

      const handlers: SseEventHandlers = {
        onComplete
      }

      const consumer = createSseConsumer(handlers, 5000)

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"result":"Success"}\n\n'))
          controller.close()
        }
      })

      const response = new Response(stream, { status: 200 })

      await consumer(response)

      expect(onComplete).toHaveBeenCalledWith({ result: 'Success' })
    })
  })
})
