import type { Page, Route } from '@playwright/test'

type JsonRecord = Record<string, any>

const now = '2026-07-11T10:00:00'

const envelope = (data: unknown, traceId = 'e2e-trace') => ({
  code: 0,
  message: 'success',
  data,
  timestamp: Date.now(),
  traceId
})

const fulfill = (route: Route, data: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(status < 400 ? envelope(data) : data)
})

const task = (id: number, title: string, status = 'todo') => ({
  id,
  weekNo: 1,
  title,
  taskType: 'career_research',
  content: title === '分析 5 个真实岗位' ? '提取共同技能、学历、经验和职责关键词。' : '整理已有证据和能力缺口。',
  status,
  dueAt: '2026-07-13T18:00:00',
  estimatedMinutes: 60,
  acceptanceCriteria: title === '分析 5 个真实岗位' ? '保存 5 个岗位并整理不少于 5 条共同要求。' : '形成已有、缺少、待验证三栏清单。',
  startedAt: null,
  completedAt: null,
  deferredTo: null,
  skipReason: null,
  sortOrder: id,
  version: 1,
  results: [],
  updatedAt: now
})

export async function installMockApi(page: Page) {
  let profile: JsonRecord = {
    userId: 1,
    displayName: '测试同学',
    identityType: null,
    school: null,
    major: null,
    degree: null,
    grade: null,
    graduationDate: null,
    city: null,
    targetRole: null,
    targetCities: [],
    expectedSalary: null,
    currentConfusion: null,
    existingDirections: [],
    weeklyAvailableMinutes: null,
    onboardingCompleted: false,
    profileVersion: 1,
    skills: [],
    certificates: [],
    experiences: [],
    values: [],
    preferredIndustries: [],
    preferredWorkModes: [],
    constraints: [],
    externalAiConsent: false,
    completed: false,
    updatedAt: now
  }

  let criteria = [
    ['interest_values', '兴趣与价值'],
    ['existing_evidence', '已有经历'],
    ['learning_cost', '需要投入的时间']
  ].map(([code, name], index) => ({
    id: 300 + index,
    code,
    name,
    description: `${name}比较说明`,
    importance: index < 2 ? 5 : 3,
    sortOrder: index,
    criterionKind: 'legacy',
    sourceType: 'system',
    results: []
  }))

  let project: JsonRecord | null = null
  let candidateSequence = 200
  let evidenceSequence = 250
  let jobSampleSequence = 280
  let plan: JsonRecord | null = null
  let review: JsonRecord | null = null
  const personalEvidence: JsonRecord[] = []
  const taskResultRequestIds = new Set<string>()
  const jobs = [
    {
      id: 1002,
      title: 'Java 后端工程师',
      company: '示例科技 A',
      city: '杭州',
      location: '杭州',
      direction: '技术研发',
      industry: '企业服务',
      companySize: '100-299人',
      salaryRange: '15k-25k',
      salaryMin: 15000,
      salaryMax: 25000,
      experienceLevel: '1-3年',
      education: '本科',
      tags: ['Java', 'Spring Boot', 'MySQL'],
      summary: '负责后端接口、数据模型和服务稳定性。',
      responsibilities: ['开发并维护后端接口', '参与数据模型设计与服务稳定性建设'],
      requirements: ['熟悉 Java 与 Spring Boot', '掌握 MySQL 和基础数据库设计'],
      growthPath: [],
      interviewFocus: [],
      sourcePlatform: 'E2E 招聘样本',
      sourceUrl: 'https://example.test/jobs/1002',
      sourceUpdatedAt: now
    },
    {
      id: 1005,
      title: '数据分析师',
      company: '示例科技 B',
      city: '上海',
      location: '上海',
      direction: '数据分析',
      industry: '教育科技',
      companySize: '100-299人',
      salaryRange: '12k-20k',
      salaryMin: 12000,
      salaryMax: 20000,
      experienceLevel: '应届生',
      education: '本科',
      tags: ['SQL', 'Python', 'BI'],
      summary: '负责业务指标分析、数据清洗和结论表达。',
      responsibilities: ['完成业务指标分析与数据清洗', '向业务团队解释分析结论'],
      requirements: ['掌握 SQL 与 Python', '能够使用至少一种 BI 工具'],
      growthPath: [],
      interviewFocus: [],
      sourcePlatform: 'E2E 招聘样本',
      sourceUrl: 'https://example.test/jobs/1005',
      sourceUpdatedAt: now
    }
  ]
  const directions = [
    {
      id: 11,
      code: 'backend-engineering',
      name: '后端开发',
      category: '技术研发',
      summary: '设计并实现可靠的服务端系统。',
      typicalWork: ['接口开发', '数据建模', '稳定性治理'],
      commonSkills: ['Java', 'Spring Boot', 'MySQL'],
      growthPath: ['初级工程师', '高级工程师', '技术负责人'],
      misconceptions: ['只需要编写接口'],
      majorTags: ['计算机'],
      industryTags: ['企业服务'],
      workTypes: ['工程', '协作'],
      custom: false,
      favorite: false,
      updatedAt: now
    },
    {
      id: 12,
      code: 'data-analysis',
      name: '数据分析',
      category: '数据分析',
      summary: '使用数据支持业务判断。',
      typicalWork: ['指标分析', '数据清洗', '结论表达'],
      commonSkills: ['SQL', 'Python', 'BI'],
      growthPath: ['数据分析师', '高级分析师', '分析负责人'],
      misconceptions: ['只需要制作图表'],
      majorTags: ['统计学', '计算机'],
      industryTags: ['教育科技'],
      workTypes: ['分析', '沟通'],
      custom: false,
      favorite: false,
      updatedAt: now
    }
  ]
  let targetJobs: JsonRecord[] = []
  let chatRetryAttempts = 0
  let chatSessions: JsonRecord[] = [
    {
      id: 13002,
      title: '岗位方向比较',
      lastPage: '/explore',
      createdAt: '2026-07-10T09:00:00',
      updatedAt: '2026-07-10T09:06:00',
      messages: [
        {
          id: 14001,
          requestId: 'e2e-history-001',
          role: 'user',
          content: 'Java 后端和数据分析应该先验证哪个？',
          response: null,
          createdAt: '2026-07-10T09:00:00'
        },
        {
          id: 14002,
          requestId: 'e2e-history-001',
          role: 'assistant',
          content: '先用相同维度比较两个方向，再各做一个低成本体验任务。',
          response: {
            sessionId: 13002,
            generationMode: 'llm',
            modelName: 'e2e-career-coach',
            confidence: 0.78,
            reply: '先用相同维度比较两个方向，再各做一个低成本体验任务。',
            usedPersonalContext: true,
            evidenceBasis: [{ statement: '两个方向都缺少实际体验证据。', sourceRefs: ['profile:1'] }],
            uncertainties: [],
            nextStep: '分别安排一个 60 分钟体验任务。',
            actions: []
          },
          createdAt: '2026-07-10T09:06:00'
        }
      ]
    }
  ]
  const reportSnapshots = [
    {
      id: '10001',
      decisionProjectId: 101,
      snapshotVersion: 3,
      type: 'decision_snapshot',
      title: 'Java 后端还是数据分析',
      summary: '基于候选、证据和岗位样本保存的决策快照。',
      content: JSON.stringify({
        kind: 'decision_snapshot',
        projectVersion: 3,
        project: {
          id: 101,
          title: 'Java 后端还是数据分析',
          question: '未来三个月优先验证 Java 后端还是数据分析？',
          status: 'decided',
          candidates: [{ id: 201, name: 'Java 后端', recommendationReason: '课程项目证据更强', opposingFactors: '系统基础待补齐', uncertainties: '岗位样本仍有限' }],
          evidence: [{ id: 251, title: 'Java 课程项目', detail: '独立完成接口开发', sourceType: 'profile', credibility: 'high', stance: 'support' }],
          targets: [{ targetType: 'primary', targetName: 'Java 后端', decisionReason: '先用四周行动继续验证' }]
        },
        actionPlan: {
          id: 501,
          projectId: 101,
          targetId: 401,
          targetRole: 'Java 后端',
          overview: '用真实岗位和实践成果继续验证目标。',
          status: 'active',
          durationWeeks: 4,
          version: 2,
          startDate: '2026-07-07',
          endDate: '2026-08-03',
          taskCount: 1,
          completedTaskCount: 1,
          progressPercent: 100,
          weeks: [{ id: 601, weekNo: 1, title: '第 1 周', goal: '校准岗位要求', tasks: [task(701, '分析 5 个真实岗位', 'completed')] }],
          createdAt: now,
          updatedAt: now
        }
      }),
      createdAt: '2026-07-11T10:00:00',
      updatedAt: '2026-07-11T10:00:00'
    },
    {
      id: '10000',
      decisionProjectId: null,
      snapshotVersion: null,
      type: 'career',
      title: '旧版职业报告',
      summary: '旧五步流程生成的职业报告。',
      content: JSON.stringify({ content: { summary: '保留原始报告结论。', evidenceHighlights: ['课程实践'], risksAndAlternatives: ['继续验证岗位要求'] } }),
      createdAt: '2026-07-08T10:00:00',
      updatedAt: '2026-07-08T10:00:00'
    }
  ]
  const resumeAnalysis = {
    id: 11001,
    targetRole: 'Java 后端',
    score: 78,
    atsScore: 74,
    keywordMatch: 69,
    issueCount: 1,
    suggestionCount: 1,
    issues: ['项目成果缺少量化说明'],
    suggestions: ['补充接口数量与测试结果'],
    improvedFragments: ['独立完成 8 个接口并补充自动化测试'],
    createdAt: '2026-07-10T10:00:00'
  }
  const legacyPathPlan = {
    id: 12001,
    targetRole: 'Java 后端',
    overview: '旧版路径计划保留用于历史回看。',
    status: 'active',
    milestoneCount: 1,
    taskCount: 1,
    completedTaskCount: 0,
    progressPercent: 0,
    milestones: [{ id: 12002, title: '补齐基础', duration: '2 周', tasks: [{ id: 12003, content: '复习 Spring Boot', status: 'todo', completedAt: null }], acceptance: ['完成一个接口练习'] }],
    checkpoints: ['完成一个接口练习'],
    createdAt: '2026-07-09T10:00:00',
    updatedAt: '2026-07-09T10:00:00'
  }

  const projectSummary = () => project ? {
    id: project.id,
    title: project.title,
    question: project.question,
    status: project.status,
    currentStage: project.currentStage,
    current: true,
    version: project.version,
    candidateCount: project.candidates.length,
    jobSampleCount: project.jobSamples.length,
    primaryTarget: project.targets.find((item: JsonRecord) => item.targetType === 'primary')?.targetName || null,
    decisionDeadline: project.decisionDeadline,
    createdAt: now,
    updatedAt: now
  } : null

  const createPlan = (body: JsonRecord) => ({
    id: 501,
    projectId: project!.id,
    targetId: project!.targets[0].id,
    targetRole: project!.targets[0].targetName,
    planType: body.planType || (project!.targets[0].verificationStatus === 'verified' ? 'action' : 'validation'),
    overview: '用真实岗位、实践成果和复盘继续验证目标。',
    status: 'active',
    durationWeeks: body.durationWeeks || 4,
    version: 1,
    startDate: body.startDate || '2026-07-11',
    endDate: '2026-08-07',
    taskCount: 4,
    completedTaskCount: 0,
    progressPercent: 0,
    weeks: [
      { id: 601, weekNo: 1, title: '第 1 周', goal: '用真实岗位校准目标要求', tasks: [task(701, '分析 5 个真实岗位'), task(702, '整理当前证据与缺口')] },
      { id: 602, weekNo: 2, title: '第 2 周', goal: '产出可验证成果', tasks: [task(703, '学习一个关键技能点')] },
      { id: 603, weekNo: 3, title: '第 3 周', goal: '继续实践验证', tasks: [] },
      { id: 604, weekNo: 4, title: '第 4 周', goal: '沉淀成果并复查目标', tasks: [task(704, '复查目标与下一步')] }
    ],
    createdAt: now,
    updatedAt: now
  })

  const createPlanPreview = (body: JsonRecord) => ({
    requestId: body.requestId,
    projectId: project!.id,
    targetId: project!.targets[0].id,
    targetRole: project!.targets[0].targetName,
    planType: body.planType || (project!.targets[0].verificationStatus === 'verified' ? 'action' : 'validation'),
    overview: '根据真实岗位要求和已有项目证据，先校准差距，再形成可检查成果。',
    durationWeeks: body.durationWeeks || 4,
    startDate: body.startDate || '2026-07-11',
    endDate: '2026-08-07',
    generationMode: 'llm',
    modelName: 'e2e-career-coach',
    confidence: 0.82,
    evidenceBasis: [
      { statement: '已参考 1 个 Java 后端岗位及其结构化任职要求。', sourceRefs: ['job:1002'] },
      { statement: '已参考课程项目证据。', sourceRefs: ['personal-evidence:901'] }
    ],
    uncertainties: ['系统设计能力仍需通过项目成果验证。'],
    weeks: Array.from({ length: body.durationWeeks || 4 }, (_, index) => {
      const weekNo = index + 1
      const finalWeek = weekNo === (body.durationWeeks || 4)
      const firstWeek = weekNo === 1
      return {
        weekNo,
        goal: firstWeek ? '校准岗位要求与个人证据' : finalWeek ? '沉淀成果并复查目标' : '围绕关键能力形成成果',
        tasks: firstWeek ? [
          {
            title: '分析 5 个真实岗位', taskType: 'career_research',
            content: '提取共同技能、学历、经验和职责关键词。', estimatedMinutes: 90,
            acceptanceCriteria: '保存 5 个岗位并整理不少于 5 条共同要求。',
            rationale: '先确认真实市场要求。', capabilityGap: '岗位要求尚未完成对照',
            jobRequirement: 'Java、Spring Boot 与数据库设计', sourceRefs: ['job:1002']
          },
          {
            title: '整理当前证据与缺口', taskType: 'career_research',
            content: '把课程项目证据逐条对应到岗位要求。', estimatedMinutes: 60,
            acceptanceCriteria: '形成已有、缺少、待验证三栏清单。',
            rationale: '避免把关键词命中当作能力证明。', capabilityGap: '证据与要求尚未关联',
            jobRequirement: 'Java、Spring Boot 与数据库设计', sourceRefs: ['job:1002', 'personal-evidence:901']
          }
        ] : [{
          title: finalWeek ? '复查目标与下一步' : `完成第 ${weekNo} 周能力样例`,
          taskType: finalWeek ? 'career_research' : 'project',
          content: finalWeek ? '结合岗位样本和成果复查目标。' : '完成一个可运行的后端能力样例。',
          estimatedMinutes: finalWeek ? 45 : 180,
          acceptanceCriteria: finalWeek ? '提交周复盘并明确下一步。' : '提交可运行结果和说明。',
          rationale: '用行动成果继续验证目标。', capabilityGap: '缺少可展示成果',
          jobRequirement: 'Java、Spring Boot 与数据库设计', sourceRefs: ['job:1002']
        }]
      }
    })
  })

  const refreshPlanMetrics = () => {
    if (!plan) return
    const tasks = plan.weeks.flatMap((week: JsonRecord) => week.tasks)
    plan.taskCount = tasks.length
    plan.completedTaskCount = tasks.filter((item: JsonRecord) => item.status === 'completed').length
    plan.progressPercent = Math.round(plan.completedTaskCount / Math.max(1, plan.taskCount) * 100)
  }

  const refreshBriefCriteria = (source: JsonRecord) => {
    const previous = new Map(criteria.map((criterion) => [criterion.code, criterion.results]))
    const definitions = [
      ...(source.mustHaves || []).map((name: string) => ({ name, kind: 'must_have', importance: 5 })),
      ...(source.dealBreakers || []).map((name: string) => ({ name, kind: 'deal_breaker', importance: 5 })),
      ...(source.priorities || []).map((name: string, index: number) => ({ name, kind: 'priority', importance: Math.max(1, 5 - index) }))
    ]
    if (!definitions.length) return
    criteria = definitions.map((item, index) => {
      const code = `brief_${item.kind}_${index}`
      return {
        id: 300 + index,
        code,
        name: item.name,
        description: null,
        importance: item.importance,
        sortOrder: index,
        criterionKind: item.kind,
        sourceType: 'brief',
        results: previous.get(code) || []
      }
    })
    source.criteria = criteria
  }

  const journeyResponse = () => {
    const candidateStates = (project?.candidates || []).map((candidate: JsonRecord) => {
      const evidenceCount = project!.evidence.filter((item: JsonRecord) => item.candidateId === null || item.candidateId === candidate.id).length
      const jobSampleCount = project!.jobSamples.filter((item: JsonRecord) => item.candidateId === candidate.id).length
      const comparisonCount = project!.criteria.filter((criterion: JsonRecord) =>
        criterion.results.some((result: JsonRecord) => result.candidateId === candidate.id && result.confirmedAt)
      ).length
      const hasOpenQuestion = Boolean(candidate.uncertainties && candidate.validationActions?.length)
      const remainingItems: string[] = []
      if (!evidenceCount && !hasOpenQuestion) remainingItems.push('可以补充一段相关经历，或记下还不清楚的地方')
      if (!jobSampleCount) remainingItems.push('还可以看看一个真实岗位')
      return {
        candidateId: candidate.id,
        state: remainingItems.length ? (evidenceCount || jobSampleCount || hasOpenQuestion ? 'partial' : 'unverified') : 'validated',
        evidenceCount,
        jobSampleCount,
        comparisonCount,
        remainingItems
      }
    })
    const briefComplete = Boolean(project?.question && project?.decisionDeadline && project?.priorities?.length)
    const candidatesComplete = candidateStates.length >= 2
    const validateComplete = candidatesComplete && candidateStates.every((item: JsonRecord) => item.state === 'validated')
    const compareComplete = Boolean(project?.comparisonReviewedAt)
    const commitComplete = Boolean(project?.targets.length)
    const canVerify = compareComplete && candidateStates.filter((candidateState: JsonRecord) => {
      const candidateId = candidateState.candidateId
      const credible = project!.evidence.some((item: JsonRecord) =>
        (item.candidateId === null || item.candidateId === candidateId) && ['high', 'medium'].includes(item.credibility)
      )
      const criteriaReady = project!.criteria.every((criterion: JsonRecord) => {
        const result = criterion.results.find((item: JsonRecord) => item.candidateId === candidateId && item.confirmedAt)
        if (!result || result.verdict === 'unknown') return false
        if (criterion.criterionKind === 'must_have') return result.verdict === 'meets'
        if (criterion.criterionKind === 'deal_breaker') return result.verdict === 'not_found'
        return true
      })
      return credible && candidateState.jobSampleCount > 0 && criteriaReady
    }).length >= 2
    const stageMap: Record<string, string> = { clarify: 'brief', evidence: 'validate', target: 'commit' }
    const stages = [
      { code: 'brief', ready: true, complete: briefComplete, remainingItems: briefComplete ? [] : ['说说你想弄清楚什么、时间和最在意的事情'] },
      { code: 'candidates', ready: briefComplete, complete: candidatesComplete, remainingItems: candidatesComplete ? [] : ['先选择两个正在考虑的方向'] },
      { code: 'validate', ready: candidatesComplete, complete: validateComplete, remainingItems: validateComplete ? [] : ['为每个方向看看经历和真实岗位'] },
      { code: 'compare', ready: candidatesComplete, complete: compareComplete, remainingItems: compareComplete ? [] : ['把几个方向放在一起看一遍'] },
      { code: 'commit', ready: compareComplete, complete: commitComplete, remainingItems: commitComplete ? [] : ['选择目前更想先试试的方向'] }
    ]
    return {
      projectId: project!.id,
      currentStage: stageMap[project!.currentStage] || project!.currentStage || 'brief',
      projectStatus: project!.status,
      canSaveProvisional: briefComplete && candidatesComplete && compareComplete,
      canVerify,
      stages,
      candidates: candidateStates,
      nextSteps: stages.find((stage) => !stage.complete && stage.ready)?.remainingItems || []
    }
  }

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const requestId = request.headers()['x-request-id']
    if (!requestId?.startsWith('web-')) {
      throw new Error(`Web API request is missing a client trace ID: ${request.method()} ${request.url()}`)
    }
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api\/v1/, '')
    const method = request.method()
    const body = request.postDataJSON?.() as JsonRecord | undefined

    if (path === '/auth/register' && method === 'POST') {
      await fulfill(route, { id: 1, username: body!.username, phone: body!.phone, email: body!.email })
      return
    }
    if (path === '/auth/login' && method === 'POST') {
      await fulfill(route, {
        user: { id: 1, username: body!.username, avatar: '' },
        token: 'e2e-access-token',
        refreshToken: 'e2e-refresh-token'
      })
      return
    }
    if (path === '/users/me/profile' && method === 'GET') {
      await fulfill(route, profile)
      return
    }
    if (path === '/users/me/profile' && method === 'PUT') {
      profile = { ...profile, ...body, onboardingCompleted: true, completed: true, updatedAt: now }
      await fulfill(route, profile)
      return
    }
    if (path === '/dashboard' && method === 'GET') {
      const primaryTarget = project?.targets?.find((target: JsonRecord) => target.targetType === 'primary')
      const dashboardState = plan ? 'executing' : primaryTarget ? 'decided' : project ? 'exploring' : profile.onboardingCompleted ? 'ready_to_explore' : 'new_user'
      const primaryAction = dashboardState === 'executing'
        ? { key: 'continue_plan', label: '继续本周行动', path: `/action-plans/${plan!.id}` }
        : dashboardState === 'decided'
          ? { key: 'create_plan', label: '安排下一步', path: `/action-plans/new?projectId=${project!.id}` }
          : dashboardState === 'exploring'
            ? { key: 'continue_decision', label: '继续当前决策', path: `/decision-projects/${project!.id}` }
            : dashboardState === 'ready_to_explore'
              ? { key: 'create_decision', label: '开始一次思考', path: '/decision-projects/new' }
              : { key: 'complete_onboarding', label: '完善个人资料', path: '/onboarding' }
      const currentWeek = plan?.weeks?.[0]
      const currentTasks = currentWeek?.tasks || []
      await fulfill(route, {
        state: dashboardState,
        primaryAction: primaryAction.key,
        primaryActionLabel: primaryAction.label,
        primaryActionPath: primaryAction.path,
        onboardingCompleted: Boolean(profile.onboardingCompleted),
        profile,
        currentProject: project ? {
          id: project.id,
          title: project.title,
          question: project.question,
          status: project.status,
          currentStage: project.currentStage,
          candidateCount: project.candidates.length,
          jobSampleCount: project.jobSamples.length,
          openQuestionCount: project.candidates.filter((candidate: JsonRecord) => candidate.uncertainties).length,
          resultCount: project.evidence.filter((item: JsonRecord) => item.sourceType === 'task_result').length,
          primaryTarget: primaryTarget?.targetName || null,
          updatedAt: project.updatedAt
        } : null,
        today: {
          planId: plan?.id || null,
          projectId: project?.id || null,
          targetId: primaryTarget?.id || null,
          targetRole: primaryTarget?.targetName || null,
          planType: plan?.planType || null,
          weekNo: currentWeek?.weekNo || 0,
          completedThisWeek: currentTasks.filter((task: JsonRecord) => task.status === 'completed').length,
          totalThisWeek: currentTasks.length,
          tasks: currentTasks,
          serverTime: now
        },
        executionRisk: {
          overdueTaskCount: 0,
          deferredTaskCount: 0,
          completedWithoutEvidenceCount: 0,
          recentResultCount: 0
        },
        latestAgentAdvice: project ? {
          id: 1,
          agentType: 'decision_coach',
          generationMode: 'llm',
          conclusion: '可以先明确自己想做出的作品，再分别查看两个方向的真实岗位。',
          nextStep: '分别查看三个真实岗位。',
          createdAt: now
        } : null,
        latestReview: review,
        generatedAt: now
      })
      return
    }
    if (path === '/assessments/mbti/history' && method === 'GET') {
      await fulfill(route, [])
      return
    }
    if (path === '/personal-evidence' && method === 'GET') {
      await fulfill(route, personalEvidence)
      return
    }
    if (path === '/chat/sessions' && method === 'GET') {
      await fulfill(route, chatSessions.map((session) => ({
        id: session.id,
        title: session.title,
        lastPage: session.lastPage,
        messageCount: session.messages.length,
        lastMessage: session.messages.at(-1)?.content || null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      })))
      return
    }
    const chatSessionMatch = path.match(/^\/chat\/sessions\/(\d+)$/)
    if (chatSessionMatch && method === 'GET') {
      const session = chatSessions.find((item) => item.id === Number(chatSessionMatch[1]))
      if (!session) {
        await fulfill(route, { code: 40490, message: 'Chat session not found', data: null }, 404)
        return
      }
      await fulfill(route, session)
      return
    }
    if (chatSessionMatch && method === 'PATCH') {
      const session = chatSessions.find((item) => item.id === Number(chatSessionMatch[1]))
      if (!session) {
        await fulfill(route, { code: 40490, message: 'Chat session not found', data: null }, 404)
        return
      }
      session.title = body!.title
      session.updatedAt = now
      await fulfill(route, {
        id: session.id,
        title: session.title,
        lastPage: session.lastPage,
        messageCount: session.messages.length,
        lastMessage: session.messages.at(-1)?.content || null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      })
      return
    }
    if (chatSessionMatch && method === 'DELETE') {
      const sessionId = Number(chatSessionMatch[1])
      if (!chatSessions.some((item) => item.id === sessionId)) {
        await fulfill(route, { code: 40490, message: 'Chat session not found', data: null }, 404)
        return
      }
      chatSessions = chatSessions.filter((item) => item.id !== sessionId)
      await fulfill(route, { sessionId, deleted: true })
      return
    }
    if (path === '/chat/messages' && method === 'POST') {
      if (body!.message === '请测试重试' && chatRetryAttempts++ === 0) {
        await fulfill(route, { code: 503, message: '导师服务暂时不可用', data: null }, 503)
        return
      }
      if (body!.message === '你是什么模型？') {
        await fulfill(route, {
          sessionId: body!.sessionId || 13001,
          responseMode: 'direct',
          usedPersonalContext: false,
          generationMode: 'fallback',
          modelName: 'e2e-unverified-provider-model',
          confidence: 0.5,
          reply: '我是穗奈，青穗集里的 AI 职业决策助手。具体底层模型由当前服务配置决定，我不会把自己描述成未经确认的模型。',
          evidenceBasis: [],
          uncertainties: [],
          nextStep: null,
          actions: [],
          intent: 'model_identity'
        })
        return
      }
      if (body!.message === '请基于我的档案给出职业决策建议') {
        await fulfill(route, {
          sessionId: body!.sessionId || 13001,
          responseMode: 'coaching',
          usedPersonalContext: true,
          generationMode: 'llm',
          modelName: 'e2e-career-coach',
          confidence: 0.76,
          reply: '先明确目标岗位，再补一条能够验证岗位匹配度的个人证据。',
          evidenceBasis: [{ statement: '档案显示尚未填写目标岗位。', sourceRefs: ['profile:targetRole'] }],
          uncertainties: ['现有档案还不足以判断具体岗位匹配度。'],
          nextStep: '完善目标岗位，并补充一条课程项目证据。',
          actions: [{ label: '完善个人档案', action: 'go:profile' }],
          intent: 'decision_coaching'
        })
        return
      }
      const response = {
        sessionId: body!.sessionId || 13001,
        generationMode: 'fallback',
        modelName: 'e2e-rule-coach',
        confidence: 0.58,
        reply: body!.message === '继续提问' ? '这是同一会话中的后续回答。' : '重试成功，原问题已经保留。',
        evidenceBasis: [{ statement: '当前页面：个人档案', sourceRefs: ['profile:1'] }],
        uncertainties: ['还需要更多个人证据。'],
        nextStep: '补充一条课程项目证据。',
        actions: []
      }
      if (body!.page === '/assistant') {
        let session = chatSessions.find((item) => item.id === response.sessionId)
        if (!session) {
          session = {
            id: response.sessionId,
            title: body!.message.slice(0, 80),
            lastPage: '/assistant',
            createdAt: now,
            updatedAt: now,
            messages: []
          }
          chatSessions.unshift(session)
        }
        session.messages.push(
          { id: Date.now(), requestId: body!.requestId, role: 'user', content: body!.message, response: null, createdAt: now },
          { id: Date.now() + 1, requestId: body!.requestId, role: 'assistant', content: response.reply, response, createdAt: now }
        )
        session.updatedAt = now
      }
      await fulfill(route, response)
      return
    }
    if (path === '/reports' && method === 'GET') {
      await fulfill(route, { items: reportSnapshots, page: 0, size: 50, total: reportSnapshots.length, totalPages: 1 })
      return
    }
    const reportMatch = path.match(/^\/reports\/(\d+)$/)
    if (reportMatch && method === 'GET') {
      await fulfill(route, reportSnapshots.find((item) => item.id === reportMatch[1]))
      return
    }
    if (path === '/resumes/analyses' && method === 'GET') {
      const { issues, suggestions, improvedFragments, ...summary } = resumeAnalysis
      await fulfill(route, [summary])
      return
    }
    if (path === `/resumes/analyses/${resumeAnalysis.id}` && method === 'GET') {
      await fulfill(route, resumeAnalysis)
      return
    }
    if (path === '/path-plans' && method === 'GET') {
      const { milestones, checkpoints, ...summary } = legacyPathPlan
      await fulfill(route, [summary])
      return
    }
    if (path === `/path-plans/${legacyPathPlan.id}` && method === 'GET') {
      await fulfill(route, legacyPathPlan)
      return
    }
    if (path === '/career-directions' && method === 'GET') {
      await fulfill(route, directions)
      return
    }
    const directionDetailMatch = path.match(/^\/career-directions\/(\d+)$/)
    if (directionDetailMatch && method === 'GET') {
      await fulfill(route, directions.find((item) => item.id === Number(directionDetailMatch[1])))
      return
    }
    const directionJobsMatch = path.match(/^\/career-directions\/(\d+)\/jobs$/)
    if (directionJobsMatch && method === 'GET') {
      const directionId = Number(directionJobsMatch[1])
      const mappedJobs = directionId === 11 ? [jobs[0]] : [jobs[1]]
      await fulfill(route, {
        items: mappedJobs.map((job) => ({
          job,
          matchScore: 92,
          matchSource: 'rule',
          reviewStatus: 'pending',
          matchReasons: ['岗位名称与方向一致', '结构化技能要求命中']
        })),
        page: 0,
        size: 50,
        totalElements: mappedJobs.length,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
        mappingVersion: 'direction-rule-e2e-v1'
      })
      return
    }
    const directionInsightsMatch = path.match(/^\/career-directions\/(\d+)\/insights$/)
    if (directionInsightsMatch && method === 'GET') {
      const directionId = Number(directionInsightsMatch[1])
      const backend = directionId === 11
      await fulfill(route, {
        directionId,
        directionName: backend ? '后端开发' : '数据分析',
        sampleSize: 1,
        salary: {
          minimumMonthly: backend ? 15000 : 12000,
          averageMinimumMonthly: backend ? 15000 : 12000,
          averageMaximumMonthly: backend ? 25000 : 20000,
          maximumMonthly: backend ? 25000 : 20000,
          sampleSize: 1
        },
        cities: [{ name: backend ? '杭州' : '上海', count: 1 }],
        educationLevels: [{ name: '本科', count: 1 }],
        experienceLevels: [{ name: backend ? '1-3年' : '应届生', count: 1 }],
        skills: (backend ? ['Java', 'Spring Boot', 'MySQL'] : ['SQL', 'Python', 'BI'])
          .map((name) => ({ name, count: 1 })),
        commonRequirements: (backend
          ? ['熟悉 Java 与 Spring Boot', '掌握 MySQL 和基础数据库设计']
          : ['掌握 SQL 与 Python', '能够使用至少一种 BI 工具'])
          .map((name) => ({ name, count: 1 })),
        latestSourceUpdatedAt: now,
        mappingVersion: 'direction-rule-e2e-v1'
      })
      return
    }
    if (path === '/jobs/facets' && method === 'GET') {
      await fulfill(route, {
        cities: [{ name: '杭州', count: 1 }, { name: '上海', count: 1 }],
        directions: [{ name: '技术研发', count: 1 }, { name: '数据分析', count: 1 }],
        tags: []
      })
      return
    }
    if (path === '/jobs/favorites' && method === 'GET') {
      await fulfill(route, [])
      return
    }
    if (path === '/jobs/targets' && method === 'GET') {
      await fulfill(route, targetJobs)
      return
    }
    const targetJobMatch = path.match(/^\/jobs\/targets\/(\d+)$/)
    if (targetJobMatch && method === 'POST') {
      const job = jobs.find((item) => item.id === Number(targetJobMatch[1]))
      if (job && !targetJobs.some((item) => item.id === job.id)) targetJobs.push(job)
      await fulfill(route, targetJobs)
      return
    }
    if (targetJobMatch && method === 'DELETE') {
      targetJobs = targetJobs.filter((item) => item.id !== Number(targetJobMatch[1]))
      await fulfill(route, targetJobs)
      return
    }
    if (path === '/jobs' && method === 'GET') {
      await fulfill(route, { items: jobs, page: 0, size: 12, totalElements: jobs.length, totalPages: 1 })
      return
    }
    const jobDetailMatch = path.match(/^\/jobs\/(\d+)$/)
    if (jobDetailMatch && method === 'GET') {
      await fulfill(route, jobs.find((item) => item.id === Number(jobDetailMatch[1])))
      return
    }
    if (path === '/decision-projects' && method === 'POST') {
      const initialCandidates = (body!.initialCandidates || []).map((item: JsonRecord, index: number) => ({
        id: candidateSequence++,
        directionId: item.directionId ?? (/Java|后端/i.test(item.name) ? 11 : /数据分析/i.test(item.name) ? 12 : null),
        name: item.name,
        sourceType: item.sourceType || 'user',
        recommendationReason: null,
        opposingFactors: null,
        uncertainties: null,
        validationActions: [],
        sortOrder: index,
        updatedAt: now
      }))
      project = {
        id: 101,
        ...body,
        title: body!.title || String(body!.question || '这次职业思考').replace(/[?？!！。]/g, '').slice(0, 24),
        background: body!.background || null,
        triggerReason: body!.triggerReason || null,
        priorities: body!.priorities || [],
        mustHaves: body!.mustHaves || [],
        dealBreakers: body!.dealBreakers || [],
        status: 'draft',
        currentStage: 'brief',
        current: true,
        version: 1,
        candidates: initialCandidates,
        jobSamples: [],
        evidence: [],
        criteria,
        targets: [],
        flowVersion: 2,
        comparisonReviewedAt: null,
        decidedAt: null,
        createdAt: now,
        updatedAt: now
      }
      refreshBriefCriteria(project)
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects' && method === 'GET') {
      await fulfill(route, project ? [projectSummary()] : [])
      return
    }
    if (path === '/decision-projects/101' && method === 'GET') {
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects/101/journey' && method === 'GET') {
      await fulfill(route, journeyResponse())
      return
    }
    if (path === '/decision-projects/101/coach' && method === 'POST') {
      await fulfill(route, {
        generationMode: 'llm',
        modelName: 'e2e-career-coach',
        confidence: 0.65,
        conclusion: '两个方向都可以继续了解。先明确自己希望做出什么样的作品，再用真实岗位和一次小练习确认差异。',
        evidenceBasis: [
          { statement: '已经记录了这次最想想清楚的问题。', sourceRefs: ['decision-project:101'] },
          { statement: '个人资料里有软件工程学习背景。', sourceRefs: ['profile'] },
          { statement: '已有一段课程项目经历可以参考。', sourceRefs: ['personal-evidence:901'] }
        ],
        counterArguments: [
          '目前还没有足够信息判断更喜欢哪一种日常工作。',
          '两个方向需要准备的作品类型不同。'
        ],
        uncertainties: [
          '还不清楚每周可以稳定投入多少时间。',
          '还没有分别查看南京地区的真实岗位数量。',
          '对 AI Agent 开发的实际工作内容还不够了解。',
          '对 Java 后端岗位的入门要求还需要进一步确认。'
        ],
        nextActions: [
          { actionType: 'clarify', title: '说清楚想做的作品', rationale: '把作品类型、完成程度和使用场景写下来，后面更容易比较。', acceptanceCriteria: '列出两到三个具体例子。' },
          { actionType: 'career_research', title: '分别查看真实岗位', rationale: '用同一个地区和经验范围了解两个方向的共同要求。', acceptanceCriteria: '每个方向保存三份岗位。' },
          { actionType: 'learning', title: '确认已有基础', rationale: '整理已经掌握的框架、工具和项目经验。', acceptanceCriteria: '形成一份已有和还需了解的清单。' },
          { actionType: 'project', title: '完成一次小练习', rationale: '用实际体验判断自己是否喜欢这类任务。', acceptanceCriteria: '留下可以回看的运行结果和感受。' },
          { actionType: 'compare', title: '把两个方向放在一起看看', rationale: '围绕作品、成长空间和工作稳定等在意的事情整理差异。', acceptanceCriteria: '每项都写下目前知道和还不知道的内容。' }
        ],
        candidateSuggestions: [
          {
            directionId: 11,
            name: 'Java 后端开发',
            recommendationReason: '已有全栈和接口开发经验，学习资源较多，也容易在三个月内做出一个完整作品。',
            opposingFactors: '需要继续补充工程化和系统设计经验。',
            uncertainties: '还没有核对本地真实岗位的具体要求。',
            validationActions: ['查看三份真实岗位']
          },
          {
            directionId: null,
            name: 'AI Agent 应用开发',
            recommendationReason: '和现有 Agent 项目经历有衔接，能够结合全栈能力做出有差异的作品，但仍需确认岗位成熟度和入门路径。',
            opposingFactors: '岗位变化较快。',
            uncertainties: '实际工作内容和入门门槛仍需了解。',
            validationActions: ['完成一个最小练习']
          }
        ]
      })
      return
    }
    if (path === '/decision-projects/101' && method === 'PUT') {
      project = { ...project, ...body, version: (project!.version || 1) + 1, updatedAt: now }
      refreshBriefCriteria(project)
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects/101/current' && method === 'POST') {
      if (body!.expectedVersion !== project!.version) throw new Error('stale project selection')
      project!.current = true
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects/101' && method === 'DELETE') {
      if (url.searchParams.get('expectedVersion') !== String(project!.version)) throw new Error('stale project archive')
      project = null
      await fulfill(route, null)
      return
    }
    if (path === '/decision-projects/101/stage' && method === 'PATCH') {
      project!.currentStage = body!.stage
      project!.status = project!.currentStage === 'brief' ? 'draft' : 'exploring'
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects/101/candidates' && method === 'POST') {
      project!.candidates.push({
        id: candidateSequence++,
        directionId: body!.directionId || null,
        name: body!.name,
        sourceType: body!.sourceType || 'user',
        recommendationReason: body!.recommendationReason || null,
        opposingFactors: body!.opposingFactors || null,
        uncertainties: body!.uncertainties || null,
        validationActions: body!.validationActions || [],
        sortOrder: project!.candidates.length,
        updatedAt: now
      })
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path.match(/^\/decision-projects\/101\/candidates\/\d+$/) && method === 'DELETE') {
      const candidateId = Number(path.split('/').at(-1))
      project!.candidates = project!.candidates.filter((item: JsonRecord) => item.id !== candidateId)
      project!.evidence = project!.evidence.filter((item: JsonRecord) => item.candidateId !== candidateId)
      project!.jobSamples = project!.jobSamples.filter((item: JsonRecord) => item.candidateId !== candidateId)
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path.match(/^\/decision-projects\/101\/candidates\/\d+$/) && method === 'PUT') {
      const candidateId = Number(path.split('/').at(-1))
      const index = project!.candidates.findIndex((item: JsonRecord) => item.id === candidateId)
      project!.candidates[index] = { ...project!.candidates[index], ...body, id: candidateId, updatedAt: now }
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects/101/evidence' && method === 'POST') {
      project!.evidence.unshift({
        id: evidenceSequence++,
        candidateId: body!.candidateId || null,
        personalEvidenceId: body!.personalEvidenceId || null,
        title: body!.title,
        detail: body!.detail || null,
        sourceType: body!.sourceType || 'user',
        sourceRef: body!.sourceRef || null,
        credibility: body!.credibility || 'medium',
        stance: body!.stance || 'neutral',
        updatedAt: now
      })
      if (body!.syncToProfile) {
        personalEvidence.unshift({
          id: 901 + personalEvidence.length,
          title: body!.title,
          description: body!.detail || '',
          evidenceType: 'project',
          sourceType: body!.sourceType || 'user',
          sourceUrl: null,
          credibility: body!.credibility || 'medium',
          tags: [],
          occurredAt: null,
          createdAt: now,
          updatedAt: now
        })
      }
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path.match(/^\/decision-projects\/101\/evidence\/\d+$/) && method === 'PUT') {
      const evidenceId = Number(path.split('/').at(-1))
      const index = project!.evidence.findIndex((item: JsonRecord) => item.id === evidenceId)
      project!.evidence[index] = { ...project!.evidence[index], ...body, id: evidenceId, updatedAt: now }
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path.match(/^\/decision-projects\/101\/evidence\/\d+$/) && method === 'DELETE') {
      const evidenceId = Number(path.split('/').at(-1))
      project!.evidence = project!.evidence.filter((item: JsonRecord) => item.id !== evidenceId)
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects/101/job-samples' && method === 'POST') {
      const job = jobs.find((item) => item.id === body!.jobId)!
      project!.jobSamples.push({
        id: jobSampleSequence++,
        candidateId: body!.candidateId,
        jobId: job.id,
        title: job.title,
        company: job.company,
        city: job.city,
        salaryText: job.salaryRange,
        note: body!.note || null,
        reviewedAt: now,
        createdAt: now
      })
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path.match(/^\/decision-projects\/101\/job-samples\/\d+$/) && method === 'DELETE') {
      const sampleId = Number(path.split('/').at(-1))
      project!.jobSamples = project!.jobSamples.filter((item: JsonRecord) => item.id !== sampleId)
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects/101/comparisons' && method === 'PUT') {
      for (const result of body!.results || []) {
        const criterion = project!.criteria.find((item: JsonRecord) => item.id === result.criterionId)
        if (!criterion) continue
        criterion.results = criterion.results.filter((item: JsonRecord) => item.candidateId !== result.candidateId)
        criterion.results.push({
          id: Date.now() + result.candidateId + result.criterionId,
          candidateId: result.candidateId,
          score: null,
          assessment: result.assessment || null,
          evidenceIds: result.evidenceIds || [],
          uncertainty: result.uncertainty || null,
          validationAction: result.validationAction || null,
          verdict: result.verdict,
          confirmedAt: result.confirmed === false ? null : now,
          updatedAt: now
        })
      }
      project!.comparisonReviewedAt = now
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path.match(/^\/decision-projects\/101\/criteria\/\d+\/results$/) && method === 'PUT') {
      const criterionId = Number(path.split('/')[4])
      const criterion = project!.criteria.find((item: JsonRecord) => item.id === criterionId)
      criterion.results = criterion.results.filter((item: JsonRecord) => item.candidateId !== body!.candidateId)
      criterion.results.push({ id: Date.now(), ...body, updatedAt: now })
      await fulfill(route, project)
      return
    }
    if (path.match(/^\/decision-projects\/101\/criteria\/\d+$/) && method === 'PUT') {
      const criterionId = Number(path.split('/').at(-1))
      const criterion = project!.criteria.find((item: JsonRecord) => item.id === criterionId)
      Object.assign(criterion, body)
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path === '/decision-projects/101/targets/confirm' && method === 'POST') {
      const primary = project!.candidates.find((item: JsonRecord) => item.id === body!.primaryCandidateId)
      const backup = project!.candidates.find((item: JsonRecord) => item.id === body!.backupCandidateId)
      project!.targets = [{
        id: 401,
        candidateId: primary.id,
        targetType: 'primary',
        targetName: primary.name,
        decisionReason: body!.decisionReason,
        mainRisks: body!.mainRisks || null,
        reviewDate: body!.reviewDate || null,
        verificationStatus: body!.verificationStatus || 'provisional',
        verifiedAt: body!.verificationStatus === 'verified' ? now : null,
        overrideReason: body!.overrideReason || null,
        confirmedAt: now
      }]
      if (backup) project!.targets.push({ id: 402, candidateId: backup.id, targetType: 'backup', targetName: backup.name, decisionReason: body!.decisionReason, mainRisks: body!.mainRisks || null, reviewDate: body!.reviewDate || null, verificationStatus: body!.verificationStatus || 'provisional', verifiedAt: body!.verificationStatus === 'verified' ? now : null, overrideReason: body!.overrideReason || null, confirmedAt: now })
      project!.status = body!.verificationStatus === 'verified' ? 'verified' : 'provisional'
      project!.currentStage = 'commit'
      project!.decidedAt = now
      project!.version += 1
      await fulfill(route, project)
      return
    }
    if (path === '/action-plans' && method === 'GET') {
      if (!plan) await fulfill(route, [])
      else {
        refreshPlanMetrics()
        const { weeks, overview, version, ...summary } = plan
        await fulfill(route, [summary])
      }
      return
    }
    if (path === '/action-plans/preview' && method === 'POST') {
      await fulfill(route, createPlanPreview(body!))
      return
    }
    if (path === '/action-plans/generate-confirmed' && method === 'POST') {
      plan = createPlan(body!)
      await fulfill(route, plan)
      return
    }
    if (path === '/action-plans/generate' && method === 'POST') {
      plan = createPlan(body!)
      await fulfill(route, plan)
      return
    }
    if (path === '/action-plans/501' && method === 'GET') {
      refreshPlanMetrics()
      await fulfill(route, plan)
      return
    }
    const statusMatch = path.match(/^\/action-plans\/501\/tasks\/(\d+)\/status$/)
    if (statusMatch && method === 'PATCH') {
      const selectedTask = plan!.weeks.flatMap((week: JsonRecord) => week.tasks).find((item: JsonRecord) => item.id === Number(statusMatch[1]))
      if (body!.expectedVersion !== selectedTask.version) {
        throw new Error(`任务版本不匹配：期望 ${selectedTask.version}，收到 ${body!.expectedVersion}`)
      }
      selectedTask.status = body!.status
      selectedTask.startedAt = body!.status === 'in_progress' ? now : selectedTask.startedAt
      selectedTask.completedAt = body!.status === 'completed' ? now : null
      selectedTask.deferredTo = body!.deferredTo || null
      selectedTask.skipReason = body!.status === 'skipped' ? body!.reason : null
      selectedTask.version += 1
      refreshPlanMetrics()
      await fulfill(route, plan)
      return
    }
    const resultMatch = path.match(/^\/action-plans\/501\/tasks\/(\d+)\/results$/)
    if (resultMatch && method === 'POST') {
      const selectedTask = plan!.weeks.flatMap((week: JsonRecord) => week.tasks).find((item: JsonRecord) => item.id === Number(resultMatch[1]))
      if (!taskResultRequestIds.has(body!.requestId)) {
        taskResultRequestIds.add(body!.requestId)
        selectedTask.results.push({ id: 801, description: body!.description, linkUrl: body!.linkUrl || null, verificationStatus: 'unverified', createdAt: now, updatedAt: now })
        if (body!.saveAsEvidence) {
          const evidenceId = 901 + personalEvidence.length
          personalEvidence.unshift({
            id: evidenceId,
            title: `行动成果：${selectedTask.title}`,
            description: body!.description,
            evidenceType: 'task_result',
            sourceType: 'task_result',
            sourceUrl: body!.linkUrl || null,
            credibility: 'medium',
            tags: [],
            occurredAt: null,
            createdAt: now,
            updatedAt: now
          })
          project!.evidence.unshift({
            id: evidenceSequence++,
            candidateId: project!.targets[0].candidateId,
            personalEvidenceId: evidenceId,
            title: `行动成果：${selectedTask.title}`,
            detail: body!.description,
            sourceType: 'task_result',
            sourceRef: `task-result:${selectedTask.results[0].id}`,
            credibility: 'medium',
            stance: 'support',
            updatedAt: now
          })
        }
      }
      await fulfill(route, plan)
      return
    }
    if (path === '/weekly-reviews' && method === 'GET') {
      await fulfill(route, review ? [review] : [])
      return
    }
    if (path === '/weekly-reviews' && method === 'PUT') {
      review = {
        id: 901,
        projectId: 101,
        ...body,
        status: 'draft',
        submittedAt: null,
        createdAt: now,
        updatedAt: now
      }
      await fulfill(route, review)
      return
    }
    if (path === '/weekly-reviews/901/submit' && method === 'POST') {
      review!.status = 'submitted'
      review!.submittedAt = now
      await fulfill(route, review)
      return
    }
    if (path === '/weekly-reviews/901/adjustments/apply' && method === 'POST') {
      review!.status = 'adjustments_applied'
      await fulfill(route, review)
      return
    }
    if (path === '/activity/signal' && method === 'POST') {
      await fulfill(route, { shouldPush: false, message: '', buttons: [] })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 404, message: `Unhandled E2E API: ${method} ${path}`, data: null })
    })
  })
}
