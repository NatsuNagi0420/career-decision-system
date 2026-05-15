import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCapabilityGeneration } from '../useCapabilityGeneration'
import * as capabilityApi from '@/api/capability'
import * as storage from '@/utils/storage'
import { ElMessage } from 'element-plus'

vi.mock('@/api/capability')
vi.mock('@/utils/storage')
vi.mock('element-plus', () => ({
  ElMessage: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  ElMessageBox: {
    confirm: vi.fn()
  }
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))
vi.mock('@/utils/activityMonitor', () => ({
  activityMonitor: {
    recordAction: vi.fn(),
    updatePageState: vi.fn()
  }
}))

describe('useCapabilityGeneration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { loading, loadingState, profile } = useCapabilityGeneration()

      expect(loading.value).toBe(false)
      expect(loadingState.value).toEqual({
        isLoading: false,
        step: 0,
        total: 6,
        summary: ''
      })
      expect(profile.value).toBeNull()
    })
  })

  describe('initializeGeneration', () => {
    it('should redirect to entry page if no draft exists', async () => {
      vi.mocked(storage.loadEntryDraft).mockReturnValue(null)

      const { initializeGeneration } = useCapabilityGeneration()
      await initializeGeneration()

      expect(ElMessage.warning).toHaveBeenCalledWith(
        expect.stringContaining('还没有完成信息录入')
      )
    })

    it('should skip generation if cached profile exists with jobs', async () => {
      const mockDraft = { basic: { name: 'Test' }, target: {}, skills: [] }
      const mockProfile = {
        recommendedJobs: [{ id: 1, jobName: 'Developer' }]
      }

      vi.mocked(storage.loadEntryDraft).mockReturnValue(mockDraft)
      vi.mocked(storage.loadDeepAssessmentDraft).mockReturnValue({})

      const { initializeGeneration, profile } = useCapabilityGeneration()
      // Manually set profile to simulate cached state
      const capabilityStore = (await import('@/stores/capability')).useCapabilityStore()
      capabilityStore.setProfile(mockProfile as unknown)

      await initializeGeneration()

      expect(profile.value).toEqual(mockProfile)
    })

    it('should prepare payload correctly with target job', async () => {
      const mockDraft = {
        basic: { name: 'Test' },
        target: { role: 'Engineer', cities: ['Beijing'] },
        skills: ['Vue'],
        questionnaireAnswers: { basic_education: 'bachelor' }
      }
      const mockDeep = { ability_1: '5' }
      const mockTargetJob = {
        jobName: 'Senior Developer',
        city: 'Shanghai',
        salary: '20k-30k'
      }

      vi.mocked(storage.loadEntryDraft).mockReturnValue(mockDraft)
      vi.mocked(storage.loadDeepAssessmentDraft).mockReturnValue(mockDeep)
      vi.mocked(storage.loadTargetJob).mockReturnValue(mockTargetJob)

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"summary":"Done"}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(capabilityApi.generateCapabilityProfileStreamApi).mockResolvedValue(mockResponse as unknown)

      const { initializeGeneration } = useCapabilityGeneration()
      await initializeGeneration()

      expect(capabilityApi.generateCapabilityProfileStreamApi).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({
            role: 'Senior Developer',
            cities: ['Shanghai'],
            salary: '20k-30k'
          }),
          questionnaireAnswers: expect.objectContaining({
            basic_education: 'bachelor',
            ability_1: '5'
          })
        })
      )
    })
  })

  describe('startGeneration - SSE streaming', () => {
    it('should handle step events correctly', async () => {
      const mockPayload = {
        basic: { name: 'Test' },
        target: {},
        skills: []
      }

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":1,"total":6,"summary":"Analyzing..."}\n\n'))
            controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":2,"total":6,"summary":"Processing..."}\n\n'))
            controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"summary":"Done","skills":[]}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(capabilityApi.generateCapabilityProfileStreamApi).mockResolvedValue(mockResponse as unknown)

      const { startGeneration, loadingState } = useCapabilityGeneration()
      await startGeneration(mockPayload as unknown)

      expect(loadingState.value.isLoading).toBe(false)
      expect(storage.saveCapabilityProfileDraft).toHaveBeenCalled()
    })

    it('should save progress to localStorage during generation', async () => {
      const mockPayload = {
        basic: { name: 'Test' },
        target: {},
        skills: []
      }

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":3,"total":6,"summary":"Halfway..."}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(capabilityApi.generateCapabilityProfileStreamApi).mockResolvedValue(mockResponse as unknown)

      const { startGeneration } = useCapabilityGeneration()

      // Start but don't wait for completion
      const promise = startGeneration(mockPayload as unknown)

      // Wait a bit for step event to be processed
      await new Promise(resolve => setTimeout(resolve, 100))

      const saved = localStorage.getItem('profile_generation_progress')
      expect(saved).toBeTruthy()

      await promise
    })

    it('should handle error events gracefully', async () => {
      const mockPayload = {
        basic: { name: 'Test' },
        target: {},
        skills: []
      }

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: error\ndata: {"errorType":"NETWORK","suggestion":"Check connection"}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(capabilityApi.generateCapabilityProfileStreamApi).mockResolvedValue(mockResponse as unknown)

      const { startGeneration } = useCapabilityGeneration()
      await startGeneration(mockPayload as unknown)

      expect(ElMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('网络连接失败')
        })
      )
    })
  })

  describe('startGeneration - fallback mode', () => {
    it('should fallback to non-streaming API when stream fails', async () => {
      const mockPayload = {
        basic: { name: 'Test' },
        target: {},
        skills: []
      }
      const mockProfile = { summary: 'Profile', skills: [] }

      vi.mocked(capabilityApi.generateCapabilityProfileStreamApi).mockRejectedValue(
        new Error('Stream not supported')
      )
      vi.mocked(capabilityApi.generateCapabilityProfileDraftApi).mockResolvedValue(mockProfile as unknown)

      const { startGeneration, loadingState } = useCapabilityGeneration()
      await startGeneration(mockPayload as unknown)

      expect(capabilityApi.generateCapabilityProfileDraftApi).toHaveBeenCalledWith(mockPayload)
      expect(loadingState.value.summary).toContain('备用方案')
      expect(storage.saveCapabilityProfileDraft).toHaveBeenCalledWith(mockProfile)
    })

    it('should show error message when fallback also fails', async () => {
      const mockPayload = {
        basic: { name: 'Test' },
        target: {},
        skills: []
      }

      vi.mocked(capabilityApi.generateCapabilityProfileStreamApi).mockRejectedValue(
        new Error('Stream failed')
      )
      vi.mocked(capabilityApi.generateCapabilityProfileDraftApi).mockRejectedValue(
        new Error('Fallback failed')
      )

      const { startGeneration } = useCapabilityGeneration()

      await expect(startGeneration(mockPayload as unknown)).rejects.toThrow()
      expect(ElMessage.error).toHaveBeenCalledWith('生成失败，请稍后再试')
    })
  })

  describe('progress management', () => {
    it('should clear progress after successful generation', async () => {
      const mockPayload = {
        basic: { name: 'Test' },
        target: {},
        skills: []
      }

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"summary":"Done"}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(capabilityApi.generateCapabilityProfileStreamApi).mockResolvedValue(mockResponse as unknown)

      const { startGeneration } = useCapabilityGeneration()

      // Set some progress first
      localStorage.setItem('profile_generation_progress', JSON.stringify({
        step: 2,
        total: 6,
        summary: 'In progress',
        timestamp: Date.now()
      }))

      await startGeneration(mockPayload as unknown)

      const saved = localStorage.getItem('profile_generation_progress')
      expect(saved).toBeNull()
    })

    it('should manually clear progress', () => {
      localStorage.setItem('profile_generation_progress', JSON.stringify({
        step: 2,
        total: 6,
        summary: 'Test',
        timestamp: Date.now()
      }))

      const { clearProgress } = useCapabilityGeneration()
      clearProgress()

      const saved = localStorage.getItem('profile_generation_progress')
      expect(saved).toBeNull()
    })
  })
})
