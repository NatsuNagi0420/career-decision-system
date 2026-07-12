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

  const criteria = [
    ['interest_values', '兴趣与价值'],
    ['existing_evidence', '已有证据'],
    ['learning_cost', '学习成本'],
    ['job_demand', '岗位需求'],
    ['regional_opportunity', '地域机会'],
    ['income_expectation', '收入预期'],
    ['risk', '风险']
  ].map(([code, name], index) => ({
    id: 300 + index,
    code,
    name,
    description: `${name}比较说明`,
    importance: index < 2 ? 5 : 3,
    sortOrder: index,
    results: []
  }))

  let project: JsonRecord | null = null
  let candidateSequence = 200
  let evidenceSequence = 250
  let jobSampleSequence = 280
  let plan: JsonRecord | null = null
  let review: JsonRecord | null = null
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
      responsibilities: [],
      requirements: [],
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
      responsibilities: [],
      requirements: [],
      growthPath: [],
      interviewFocus: [],
      sourcePlatform: 'E2E 招聘样本',
      sourceUrl: 'https://example.test/jobs/1005',
      sourceUpdatedAt: now
    }
  ]
  let targetJobs: JsonRecord[] = []
  let chatRetryAttempts = 0
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

  const refreshPlanMetrics = () => {
    if (!plan) return
    const tasks = plan.weeks.flatMap((week: JsonRecord) => week.tasks)
    plan.taskCount = tasks.length
    plan.completedTaskCount = tasks.filter((item: JsonRecord) => item.status === 'completed').length
    plan.progressPercent = Math.round(plan.completedTaskCount / Math.max(1, plan.taskCount) * 100)
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
    if (path === '/assessments/mbti/history' && method === 'GET') {
      await fulfill(route, [])
      return
    }
    if (path === '/personal-evidence' && method === 'GET') {
      await fulfill(route, [])
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
          reply: '我是职业决策系统中的 AI 助手。具体底层模型由当前服务配置决定，我不会把自己描述成未经确认的模型。',
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
      await fulfill(route, {
        sessionId: body!.sessionId || 13001,
        generationMode: 'fallback',
        modelName: 'e2e-rule-coach',
        confidence: 0.58,
        reply: body!.message === '继续提问' ? '这是同一会话中的后续回答。' : '重试成功，原问题已经保留。',
        evidenceBasis: [{ statement: '当前页面：个人档案', sourceRefs: ['profile:1'] }],
        uncertainties: ['还需要更多个人证据。'],
        nextStep: '补充一条课程项目证据。',
        actions: []
      })
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
      await fulfill(route, [])
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
      project = {
        id: 101,
        ...body,
        background: body!.background || null,
        triggerReason: body!.triggerReason || null,
        priorities: body!.priorities || [],
        mustHaves: body!.mustHaves || [],
        dealBreakers: body!.dealBreakers || [],
        status: 'clarifying',
        currentStage: 'clarify',
        current: true,
        version: 1,
        candidates: [],
        jobSamples: [],
        evidence: [],
        criteria,
        targets: [],
        decidedAt: null,
        createdAt: now,
        updatedAt: now
      }
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
    if (path === '/decision-projects/101' && method === 'PUT') {
      project = { ...project, ...body, version: (project!.version || 1) + 1, updatedAt: now }
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
      project!.status = body!.stage === 'target' ? 'ready_to_decide' : `${body!.stage}`
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
        createdAt: now
      })
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
        confirmedAt: now
      }]
      if (backup) project!.targets.push({ id: 402, candidateId: backup.id, targetType: 'backup', targetName: backup.name, decisionReason: body!.decisionReason, mainRisks: body!.mainRisks || null, reviewDate: body!.reviewDate || null, confirmedAt: now })
      project!.status = 'decided'
      project!.currentStage = 'target'
      project!.decidedAt = now
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
    if (path === '/action-plans/generate' && method === 'POST') {
      plan ||= createPlan(body!)
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
      selectedTask.results.push({ id: 801, description: body!.description, linkUrl: body!.linkUrl || null, verificationStatus: 'unverified', createdAt: now, updatedAt: now })
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
