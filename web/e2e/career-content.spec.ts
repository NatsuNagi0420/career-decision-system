import { expect, test } from '@playwright/test'
import { installMockApi } from './mockApi'

const direction = {
  id: 1,
  code: 'backend',
  name: '后端开发',
  category: '技术研发',
  summary: '设计和实现服务端业务、接口、数据与稳定性能力。',
  typicalWork: ['开发业务接口', '设计数据模型', '排查性能与稳定性问题'],
  commonSkills: ['Java', 'Spring Boot', 'MySQL'],
  growthPath: ['初级工程师', '后端工程师', '高级工程师'],
  misconceptions: ['只会写接口就足够', '框架熟练等于基础扎实'],
  majorTags: ['计算机', '软件工程'],
  industryTags: ['互联网', '企业服务'],
  workTypes: ['工程', '协作'],
  custom: false,
  favorite: false,
  updatedAt: '2026-07-11T10:00:00'
}
const directions = [
  direction,
  {
    ...direction,
    id: 2,
    code: 'data-analysis',
    name: '数据分析',
    category: '数据与算法',
    summary: '通过数据清洗、分析和表达支持业务判断。',
    typicalWork: ['定义业务指标', '清洗和分析数据', '表达分析结论'],
    commonSkills: ['SQL', 'Python', 'BI'],
    growthPath: ['分析助理', '数据分析师', '分析负责人'],
    misconceptions: ['会做图表就等于会分析'],
    workTypes: ['分析', '沟通']
  },
  {
    ...direction,
    id: 3,
    code: 'product-management',
    name: '产品经理',
    category: '产品与设计',
    summary: '识别用户问题并推动解决方案持续交付和验证。',
    typicalWork: ['开展用户研究', '整理需求和方案', '推动协作与复盘'],
    commonSkills: ['用户研究', '需求分析', '沟通协作'],
    growthPath: ['产品助理', '产品经理', '产品负责人'],
    misconceptions: ['产品经理只负责写文档'],
    workTypes: ['决策', '协作']
  }
]

const directionJobs = [
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
    sourcePlatform: 'E2E 招聘样本',
    sourceUrl: 'https://example.test/jobs/1002',
    sourceUpdatedAt: '2026-07-11T10:00:00'
  },
  {
    id: 1003,
    title: '服务端开发工程师',
    company: '示例科技 B',
    city: '上海',
    location: '上海',
    direction: '技术研发',
    industry: '互联网',
    companySize: '300-999人',
    salaryRange: '18k-28k',
    salaryMin: 18000,
    salaryMax: 28000,
    experienceLevel: '3-5年',
    education: '本科',
    tags: ['Java', 'MySQL', '分布式系统'],
    summary: '负责核心服务开发、数据存储和稳定性治理。',
    sourcePlatform: 'E2E 招聘样本',
    sourceUrl: 'https://example.test/jobs/1003',
    sourceUpdatedAt: '2026-07-11T10:00:00'
  }
]

const envelope = (data: unknown) => ({ code: 0, message: 'success', data, timestamp: Date.now(), traceId: 'career-content-e2e' })

test.beforeEach(async ({ page }) => {
  await installMockApi(page)
  await page.route('**/api/v1/career-directions**', async (route) => {
    const url = new URL(route.request().url())
    const jobsMatch = url.pathname.match(/\/career-directions\/(\d+)\/jobs$/)
    if (jobsMatch) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({
          items: directionJobs.map((job, index) => ({
            job,
            matchScore: 92 - index * 4,
            matchSource: 'rule',
            reviewStatus: 'pending',
            matchReasons: ['岗位名称与方向一致', '结构化技能要求命中']
          })),
          page: 0,
          size: 50,
          totalElements: directionJobs.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
          mappingVersion: 'direction-rule-career-content-v1'
        }))
      })
      return
    }
    const insightsMatch = url.pathname.match(/\/career-directions\/(\d+)\/insights$/)
    if (insightsMatch) {
      const item = directions.find((candidate) => candidate.id === Number(insightsMatch[1])) || direction
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({
          directionId: item.id,
          directionName: item.name,
          sampleSize: directionJobs.length,
          salary: {
            minimumMonthly: 15000,
            averageMinimumMonthly: 16500,
            averageMaximumMonthly: 26500,
            maximumMonthly: 28000,
            sampleSize: directionJobs.length
          },
          cities: [{ name: '杭州', count: 1 }, { name: '上海', count: 1 }],
          educationLevels: [{ name: '本科', count: 2 }],
          experienceLevels: [{ name: '1-3年', count: 1 }, { name: '3-5年', count: 1 }],
          skills: item.commonSkills.map((name) => ({ name, count: 1 })),
          commonRequirements: item.commonSkills.map((name) => ({ name: `掌握 ${name}`, count: 1 })),
          latestSourceUpdatedAt: '2026-07-11T10:00:00',
          mappingVersion: 'direction-rule-career-content-v1'
        }))
      })
      return
    }
    const detailId = Number(url.pathname.match(/\/career-directions\/(\d+)$/)?.[1])
    const detail = directions.find((item) => item.id === detailId)
    const favorite = /\/favorite$/.test(url.pathname)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope(favorite || detail ? detail || direction : directions))
    })
  })
  await page.route('**/api/v1/personal-evidence**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope([{
        id: 21,
        evidenceType: 'project',
        title: 'Java 课程项目',
        description: '使用 SpringBoot 完成服务端接口',
        roleName: '后端开发',
        resultSummary: '交付 8 个接口并通过测试',
        linkUrl: null,
        proficiency: '熟悉',
        lastUsedAt: null,
        feedback: null,
        sourceType: 'manual',
        sourceRefType: null,
        sourceRefId: null,
        credibility: 'high',
        visibility: 'private',
        occurredAt: null,
        createdAt: '2026-07-01T10:00:00',
        updatedAt: '2026-07-01T10:00:00'
      }]))
    })
  })
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
})

test('职业内容从方向详情连接真实岗位、个人证据和简历 JD 对照', async ({ page }, testInfo) => {
  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: '职业探索' })).toBeVisible()
  const directionCard = page.locator('.direction-card').filter({ hasText: '后端开发' })
  await directionCard.getByRole('button', { name: '查看详情' }).click()

  await expect(page).toHaveURL(/\/explore\/directions\/1$/)
  await expect(page.getByRole('heading', { name: '后端开发', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '真实岗位聚合' })).toBeVisible()
  await expect(page.getByText('相关岗位样本').locator('..').getByText('2')).toBeVisible()
  await expect(page.getByRole('heading', { name: '我的证据与岗位要求' })).toBeVisible()
  await expect(page.getByText('Java 课程项目').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '职业体验任务' })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)

  await page.getByRole('button', { name: /Java 后端工程师/ }).click()
  await expect(page).toHaveURL(/\/explore\?tab=jobs&jobId=1002/)
  await expect(page.getByRole('complementary').getByRole('heading', { name: 'Java 后端工程师' })).toBeVisible()
  if (process.env.E2E_CAPTURE === '1') {
    await page.screenshot({ path: testInfo.outputPath('job-detail.png'), fullPage: true })
  }
  await page.getByRole('button', { name: '使用简历对照这份 JD' }).click()
  const dialog = page.getByRole('dialog', { name: '简历与目标 JD 对照' })
  await expect(dialog).toBeVisible()
  const resumeTextArea = page.getByRole('textbox', { name: '粘贴简历文本' })
  const [dialogBox, textAreaBox] = await Promise.all([dialog.boundingBox(), resumeTextArea.boundingBox()])
  expect(dialogBox).not.toBeNull()
  expect(textAreaBox).not.toBeNull()
  expect(textAreaBox!.x).toBeGreaterThanOrEqual(dialogBox!.x)
  expect(textAreaBox!.x + textAreaBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
  await resumeTextArea.fill('使用 Java 和 SpringBoot 完成课程项目并交付服务端接口。')
  const coverageText = page.locator('.resume-compare-result').getByText(/^\d+%$/)
  await expect(coverageText).toBeVisible()
  const coverage = Number((await coverageText.textContent())?.replace('%', ''))
  expect(coverage).toBeGreaterThan(0)
  expect(coverage).toBeLessThan(100)
  await expect(page.getByRole('heading', { name: '建议核对或补充' }).locator('..').getByText('MySQL', { exact: true })).toBeVisible()
})

test('最多三个职业方向可以进入独立快速对比并切换数据视图', async ({ page }, testInfo) => {
  await page.goto('/explore')
  for (const item of directions) {
    await page.getByRole('button', { name: `加入对比：${item.name}` }).click()
  }

  const compareBar = page.getByRole('region', { name: '已选职业方向对比' })
  await expect(compareBar).toBeVisible()
  await expect(compareBar.getByRole('button', { name: '对比 3 个方向' })).toBeEnabled()
  await compareBar.getByRole('button', { name: '对比 3 个方向' }).click()

  await expect(page).toHaveURL(/\/explore\/compare\?directions=1,2,3$/)
  await expect(page.getByRole('heading', { name: '职业方向快速对比' })).toBeVisible()
  for (const item of directions) {
    await expect(page.getByRole('heading', { name: item.name, level: 2 })).toBeVisible()
  }
  await expect(page.getByText('需要警惕的误区')).toBeVisible()
  if (process.env.E2E_CAPTURE === '1') {
    await page.screenshot({ path: testInfo.outputPath('career-compare.png'), fullPage: true })
  }

  await page.getByRole('tab', { name: '真实岗位' }).click()
  await expect(page.getByText('薪资样本范围')).toBeVisible()
  await expect(page.getByText(/只表示当前数据库匹配样本/)).toBeVisible()

  await page.getByRole('tab', { name: '我的证据' }).click()
  await expect(page.getByText('证据覆盖')).toBeVisible()
  await expect(page.getByText(/Java 课程项目/).first()).toBeVisible()

  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(pageOverflow).toBe(false)
  if (testInfo.project.name === 'chromium-360') {
    const comparisonScrolls = await page.locator('.comparison-scroll').evaluate((element) => element.scrollWidth > element.clientWidth)
    expect(comparisonScrolls).toBe(true)
  }
})
