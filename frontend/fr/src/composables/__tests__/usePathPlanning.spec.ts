import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePathPlanning } from '../usePathPlanning'
import * as persistenceApi from '@/api/persistence'
import * as storage from '@/utils/storage'
import { ElMessage, ElMessageBox } from 'element-plus'

const mockRouterPush = vi.fn()

vi.mock('@/api/persistence')
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
    push: mockRouterPush
  })
}))
vi.mock('@/utils/activityMonitor', () => ({
  activityMonitor: {
    recordAction: vi.fn(),
    updatePageState: vi.fn()
  }
}))

describe('usePathPlanning', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouterPush.mockClear()
    localStorage.clear()
  })

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const {
        targetJob,
        graphData,
        selectedNode,
        loading,
        errorMessage,
        loadingState
      } = usePathPlanning()

      expect(targetJob.value).toBeNull()
      expect(graphData.value).toBeNull()
      expect(selectedNode.value).toBeNull()
      expect(loading.value).toBe(false)
      expect(errorMessage.value).toBeNull()
      expect(loadingState.value).toEqual({
        isLoading: false,
        step: 0,
        total: 5,
        summary: ''
      })
    })
  })

  describe('initialize', () => {
    it('should redirect to entry page if no draft exists', async () => {
      vi.mocked(storage.loadEntryDraft).mockReturnValue(null)

      const { initialize } = usePathPlanning()
      await initialize()

      expect(ElMessage.warning).toHaveBeenCalledWith(
        expect.stringContaining('还没有完成信息录入')
      )
    })

    it('should set error message if no target job exists', async () => {
      vi.mocked(storage.loadEntryDraft).mockReturnValue({ basic: { name: 'Test' } } as unknown)
      vi.mocked(storage.loadTargetJob).mockReturnValue(null)

      const { initialize, errorMessage } = usePathPlanning()
      await initialize()

      expect(errorMessage.value).toContain('还没有目标岗位')
    })

    it('should load target job and fetch path data', async () => {
      const mockDraft = { basic: { name: 'Test' }, target: {} }
      const mockJob = { id: 1, jobName: 'Developer', city: 'Beijing' }

      vi.mocked(storage.loadEntryDraft).mockReturnValue(mockDraft as unknown)
      vi.mocked(storage.loadTargetJob).mockReturnValue(mockJob as unknown)
      vi.mocked(storage.loadDeepAssessmentDraft).mockReturnValue({})

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"nodes":[],"links":[]}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(persistenceApi.generatePathPlanStreamApi).mockResolvedValue(mockResponse as unknown)

      const { initialize, targetJob } = usePathPlanning()
      await initialize()

      expect(targetJob.value).toEqual(mockJob)
    })
  })

  describe('startGeneration - SSE streaming', () => {
    it('should handle step events correctly', async () => {
      const mockPayload = { basic: { name: 'Test' }, target: {} }

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":1,"total":5,"summary":"Analyzing..."}\n\n'))
            controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":2,"total":5,"summary":"Planning..."}\n\n'))
            controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"nodes":[{"id":"n1","label":"Start"}],"links":[]}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(persistenceApi.generatePathPlanStreamApi).mockResolvedValue(mockResponse as unknown)

      const { startGeneration, loadingState, graphData } = usePathPlanning()
      await startGeneration(mockPayload)

      expect(loadingState.value.isLoading).toBe(false)
      expect(graphData.value).toBeTruthy()
      expect(storage.savePathGraph).toHaveBeenCalled()
    })

    it('should save progress during generation', async () => {
      const mockPayload = { basic: { name: 'Test' }, target: {} }

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: step\ndata: {"step":3,"total":5,"summary":"Halfway..."}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(persistenceApi.generatePathPlanStreamApi).mockResolvedValue(mockResponse as unknown)

      const { startGeneration } = usePathPlanning()
      const promise = startGeneration(mockPayload)

      await new Promise(resolve => setTimeout(resolve, 100))

      const saved = localStorage.getItem('path_generation_progress')
      expect(saved).toBeTruthy()

      await promise
    })

    it('should select first node after completion', async () => {
      const mockPayload = { basic: { name: 'Test' }, target: {} }

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"nodes":[{"id":"n1","label":"Node1"},{"id":"n2","label":"Node2"}],"links":[]}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(persistenceApi.generatePathPlanStreamApi).mockResolvedValue(mockResponse as unknown)

      const { startGeneration, selectedNode } = usePathPlanning()
      await startGeneration(mockPayload)

      expect(selectedNode.value).toBeTruthy()
      expect((selectedNode.value as unknown)?.id).toBe('n1')
    })
  })

  describe('startGeneration - fallback mode', () => {
    it('should fallback to non-streaming API when stream fails', async () => {
      const mockPayload = { basic: { name: 'Test' }, target: {} }
      const mockGraph = { nodes: [{ id: 'n1', label: 'Start' }], links: [] }

      vi.mocked(persistenceApi.generatePathPlanStreamApi).mockRejectedValue(
        new Error('Stream not supported')
      )
      vi.mocked(persistenceApi.generatePathPlanApi).mockResolvedValue(mockGraph as unknown)

      const { startGeneration, graphData } = usePathPlanning()
      await startGeneration(mockPayload)

      expect(persistenceApi.generatePathPlanApi).toHaveBeenCalledWith(mockPayload)
      expect(graphData.value).toEqual(mockGraph)
      expect(storage.savePathGraph).toHaveBeenCalledWith(mockGraph)
    })

    it('should show error message when fallback also fails', async () => {
      const mockPayload = { basic: { name: 'Test' }, target: {} }

      vi.mocked(persistenceApi.generatePathPlanStreamApi).mockRejectedValue(
        new Error('Stream failed')
      )
      vi.mocked(persistenceApi.generatePathPlanApi).mockRejectedValue(
        new Error('Fallback failed')
      )

      const { startGeneration } = usePathPlanning()
      await startGeneration(mockPayload)

      expect(ElMessage.error).toHaveBeenCalledWith('获取路径规划失败')
    })
  })

  describe('progress management', () => {
    it('should restore progress from localStorage', async () => {
      const mockDraft = { basic: { name: 'Test' }, target: {} }
      const mockJob = { id: 1, jobName: 'Developer' }

      vi.mocked(storage.loadEntryDraft).mockReturnValue(mockDraft as unknown)
      vi.mocked(storage.loadTargetJob).mockReturnValue(mockJob as unknown)
      vi.mocked(storage.loadDeepAssessmentDraft).mockReturnValue({})

      localStorage.setItem('path_generation_progress', JSON.stringify({
        step: 2,
        total: 5,
        summary: 'In progress',
        timestamp: Date.now(),
        payload: mockDraft
      }))

      vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as unknown)

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"nodes":[],"links":[]}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(persistenceApi.generatePathPlanStreamApi).mockResolvedValue(mockResponse as unknown)

      const { fetchPathData } = usePathPlanning()
      await fetchPathData()

      expect(ElMessageBox.confirm).toHaveBeenCalledWith(
        expect.stringContaining('检测到上次生成任务未完成'),
        '恢复生成',
        expect.any(Object)
      )
    })

    it('should clear expired progress', async () => {
      const mockDraft = { basic: { name: 'Test' }, target: {} }
      const mockJob = { id: 1, jobName: 'Developer' }

      vi.mocked(storage.loadEntryDraft).mockReturnValue(mockDraft as unknown)
      vi.mocked(storage.loadTargetJob).mockReturnValue(mockJob as unknown)
      vi.mocked(storage.loadDeepAssessmentDraft).mockReturnValue({})

      // Set expired progress (6 minutes ago)
      localStorage.setItem('path_generation_progress', JSON.stringify({
        step: 2,
        total: 5,
        summary: 'Expired',
        timestamp: Date.now() - 6 * 60 * 1000,
        payload: mockDraft
      }))

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: complete\ndata: {"nodes":[],"links":[]}\n\n'))
            controller.close()
          }
        }),
        { status: 200 }
      )

      vi.mocked(persistenceApi.generatePathPlanStreamApi).mockResolvedValue(mockResponse as unknown)

      const { fetchPathData } = usePathPlanning()
      await fetchPathData()

      // Should not prompt for restore
      expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    })
  })

  describe('saveToReport', () => {
    it('should warn if no graph data exists', () => {
      const { saveToReport } = usePathPlanning()
      saveToReport()

      expect(ElMessage.warning).toHaveBeenCalledWith('请先生成路径规划')
    })

    it('should save plan with stages and tasks', () => {
      const mockGraph = {
        nodes: [{ id: 'n1', label: 'Node1' }],
        links: [],
        recommendations: [
          { name: 'Stage 1', steps: ['Step 1', 'Step 2'] },
          { name: 'Stage 2', steps: ['Step 3'] }
        ]
      }

      const { targetJob, graphData, saveToReport } = usePathPlanning()
      targetJob.value = { id: 1, jobName: 'Developer' }
      graphData.value = mockGraph as unknown

      saveToReport()

      expect(storage.savePathPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          stages: expect.arrayContaining([
            expect.objectContaining({
              name: 'Stage 1',
              tasks: expect.arrayContaining([
                expect.objectContaining({ title: 'Step 1', done: false }),
                expect.objectContaining({ title: 'Step 2', done: false })
              ])
            })
          ])
        })
      )
      expect(ElMessage.success).toHaveBeenCalledWith('已添加到报告预览')
    })
  })

  describe('node selection', () => {
    it('should select node', () => {
      const { selectNode, selectedNode } = usePathPlanning()
      const node = { id: 'n1', label: 'Node1' }

      selectNode(node)

      expect(selectedNode.value).toEqual(node)
    })

    it('should compute selectedLink based on selectedNode', () => {
      const { graphData, selectedLink, selectNode } = usePathPlanning()

      graphData.value = {
        nodes: [
          { id: 'n1', label: 'Node1' },
          { id: 'n2', label: 'Node2' }
        ],
        links: [
          { source: 'n1', target: 'n2', label: 'Link1' }
        ]
      } as unknown

      selectNode({ id: 'n2', label: 'Node2' })

      expect(selectedLink.value).toEqual(
        expect.objectContaining({ source: 'n1', target: 'n2' })
      )
    })
  })

  describe('navigation', () => {
    it('should navigate to report page', () => {
      const { generateReport } = usePathPlanning()
      generateReport()

      expect(mockRouterPush).toHaveBeenCalledWith('/report')
    })

    it('should navigate to job exploration page', () => {
      const { changeTarget } = usePathPlanning()
      changeTarget()

      expect(mockRouterPush).toHaveBeenCalledWith('/job-exploration')
    })
  })
})
