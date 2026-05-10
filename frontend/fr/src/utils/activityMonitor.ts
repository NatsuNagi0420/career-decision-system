/**
 * 模块：用户行为信号采集与主动消息触发
 * 职责：采集当前页面行为信号，定时发送到后端，接收主动消息推送
 */

/**
 * 页面状态接口
 * 记录用户在各业务页面的关键操作完成情况和进行中状态
 */
export interface PageState {
  /** 综合信息录入是否完成 */
  entryCompleted: boolean
  /** 深度测评是否已开始 */
  deepAssessmentStarted: boolean
  /** 深度测评是否已完成 */
  deepAssessmentCompleted: boolean
  /** 能力画像是否已生成完成 */
  profileGenerated: boolean
  /** 能力画像页面停留时长（秒） */
  profileViewDuration: number
  /** 已浏览的岗位详情数量 */
  browsedJobCount: number
  /** 是否已选定目标岗位 */
  targetJobSelected: boolean
  /** 职业路径规划是否已生成完成 */
  pathPlanGenerated: boolean
  /** 职业规划报告是否已生成完成 */
  reportGenerated: boolean
  /** 能力画像是否正在生成中（用于防止推理中被主动消息打断） */
  profileGenerating: boolean
  /** 职业路径规划是否正在生成中（用于防止推理中被主动消息打断） */
  pathPlanGenerating: boolean
}

/**
 * 活动信号接口
 * 发送到后端的完整信号数据结构
 */
export interface ActivitySignal {
  /** 当前页面路径 */
  page: string
  /** 进入当前页面的时间戳 */
  pageEnteredAt: number
  /** 最近一次用户操作的时间戳 */
  lastActionAt: number
  /** 最近操作类型列表（最多保留10条） */
  recentActions: string[]
  /** 页面关键业务状态 */
  pageState: PageState
}

/**
 * 主动消息接口
 * 后端推送的主动介入消息结构
 */
export interface ProactiveMessage {
  /** 主动消息文本内容 */
  message: string
  /** 可选的操作按钮列表 */
  buttons: Array<{
    /** 按钮显示文本 */
    label: string
    /** 按钮操作类型（如 go:capability-profile） */
    action: string
  }>
}

/**
 * 活动监控器类
 * 单例模式，负责采集用户行为并与后端通信
 */
class ActivityMonitor {
  private currentPage: string = ''
  private pageEnteredAt: number = 0
  private lastActionAt: number = Date.now()
  private recentActions: string[] = []
  private pageState: PageState = {
    entryCompleted: false,
    deepAssessmentStarted: false,
    deepAssessmentCompleted: false,
    profileGenerated: false,
    profileViewDuration: 0,
    browsedJobCount: 0,
    targetJobSelected: false,
    pathPlanGenerated: false,
    reportGenerated: false,
    profileGenerating: false,
    pathPlanGenerating: false
  }

  private heartbeatInterval: number | null = null
  private cooldownMap: Map<string, { lastPushTime: number; pushCount: number }> = new Map()

  /**
   * 初始化监控器，启动心跳
   */
  init() {
    this.startHeartbeat()
  }

  /**
   * 页面切换时调用
   */
  onPageChange(newPage: string) {
    // 发送当前页面的最终信号
    if (this.currentPage) {
      this.sendSignal()
    }

    // 重置为新页面
    this.currentPage = newPage
    this.pageEnteredAt = Date.now()
    this.lastActionAt = Date.now()
    this.recentActions = []

    // 发送新页面的初始信号
    this.sendSignal()
  }

  /**
   * 记录用户操作
   * @param actionType 操作类型（如 'entry_submitted', 'profile_generated'）
   * @param stateUpdate 可选的页面状态更新
   *
   * 关键操作会立即发送信号到后端，包括：
   * - entry_submitted: 信息录入提交
   * - assessment_started: 深度测评开始
   * - assessment_completed: 深度测评完成
   * - profile_generated: 能力画像生成完成
   * - target_job_selected: 目标岗位选定
   * - path_plan_generated: 路径规划生成完成
   */
  recordAction(actionType: string, stateUpdate?: Partial<PageState>) {
    this.lastActionAt = Date.now()
    this.recentActions.push(actionType)
    if (this.recentActions.length > 10) {
      this.recentActions.shift()
    }

    if (stateUpdate) {
      this.pageState = { ...this.pageState, ...stateUpdate }
    }

    // 关键操作立即发送信号
    const criticalActions = [
      'entry_submitted',
      'assessment_started',
      'assessment_completed',
      'profile_generated',
      'target_job_selected',
      'path_plan_generated'
    ]

    if (criticalActions.includes(actionType)) {
      this.sendSignal()
    }
  }

  /**
   * 更新页面状态
   * @param stateUpdate 要更新的状态字段（部分更新）
   *
   * 常用状态字段：
   * - profileGenerating: 能力画像生成中（防止主动消息打断）
   * - pathPlanGenerating: 路径规划生成中（防止主动消息打断）
   * - profileGenerated: 能力画像已完成
   * - pathPlanGenerated: 路径规划已完成
   * - targetJobSelected: 已选定目标岗位
   */
  updatePageState(stateUpdate: Partial<PageState>) {
    this.pageState = { ...this.pageState, ...stateUpdate }
  }

  /**
   * 启动心跳定时器（每45秒）
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    this.heartbeatInterval = window.setInterval(() => {
      if (this.currentPage) {
        this.sendSignal()
      }
    }, 45000) // 45秒
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * 立即发送信号（用于关键事件后立即触发）
   */
  sendNow() {
    this.sendSignal()
  }

  /**
   * 发送信号到后端
   */
  private async sendSignal() {
    if (!this.currentPage) return

    // 更新页面停留时长
    if (this.currentPage === '/capability-profile' && this.pageState.profileGenerated) {
      this.pageState.profileViewDuration = Math.floor((Date.now() - this.pageEnteredAt) / 1000)
    }

    const signal: ActivitySignal = {
      page: this.currentPage,
      pageEnteredAt: this.pageEnteredAt,
      lastActionAt: this.lastActionAt,
      recentActions: [...this.recentActions],
      pageState: { ...this.pageState }
    }

    try {
      const response = await fetch('/api/activity/signal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(signal)
      })

      if (response.ok) {
        const result = await response.json()
        if (result.data && result.data.shouldPush) {
          this.handleProactiveMessage(result.data)
        }
      }
    } catch (error) {
      console.warn('Failed to send activity signal:', error)
    }
  }

  /**
   * 处理主动消息推送
   */
  private handleProactiveMessage(data: { shouldPush: boolean; message: string; buttons: any[] }) {
    // 检查本地冷却期
    const cooldownKey = this.currentPage
    const cooldown = this.cooldownMap.get(cooldownKey)
    const now = Date.now()

    if (cooldown) {
      const timeSinceLastPush = now - cooldown.lastPushTime
      const minInterval = 15 * 60 * 1000 // 15分钟

      if (timeSinceLastPush < minInterval && cooldown.pushCount >= 5) {
        console.log('Proactive message suppressed by local cooldown')
        return
      }
    }

    // 更新冷却记录
    this.cooldownMap.set(cooldownKey, {
      lastPushTime: now,
      pushCount: (cooldown?.pushCount || 0) + 1
    })

    // 触发自定义事件，由 AiAssistant 组件监听
    const event = new CustomEvent('proactive-message', {
      detail: {
        message: data.message,
        buttons: data.buttons || []
      }
    })
    window.dispatchEvent(event)
  }

  /**
   * 获取当前信号状态（用于调试）
   */
  getCurrentState(): ActivitySignal {
    return {
      page: this.currentPage,
      pageEnteredAt: this.pageEnteredAt,
      lastActionAt: this.lastActionAt,
      recentActions: [...this.recentActions],
      pageState: { ...this.pageState }
    }
  }
}

// 导出单例
export const activityMonitor = new ActivityMonitor()
