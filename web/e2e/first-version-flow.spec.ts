import { expect, test } from '@playwright/test'
import { installMockApi } from './mockApi'

test('学生完成第一版职业决策与行动闭环', async ({ page }, testInfo) => {
  const expectNoPageOverflow = async () => {
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow).toBe(false)
  }
  const capture = async (name: string) => {
    if (process.env.E2E_CAPTURE !== '1') return
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }))
    await page.waitForTimeout(100)
    await testInfo.attach(name, {
      body: await page.screenshot({
        style: '.m3-snackbar { visibility: hidden !important; }'
      }),
      contentType: 'image/png'
    })
  }
  await installMockApi(page)
  await page.goto('/login')

  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByLabel('用户名').fill('e2e_student')
  await page.getByLabel('手机号').fill('13900000001')
  await page.getByLabel('密码', { exact: true }).fill('StrongPass123')
  await page.getByLabel('确认密码').fill('StrongPass123')
  await page.getByText('我已阅读并同意用户协议和隐私政策').click()
  await page.getByRole('button', { name: '创建并开始引导' }).click()

  await expect(page).toHaveURL(/\/onboarding$/)
  await page.getByLabel(/专业/).fill('软件工程')
  await page.getByLabel(/当前年级/).selectOption('大三')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel(/当前困惑/).fill('未来三个月优先验证 Java 后端还是数据分析？')
  await page.getByLabel(/已经想到的方向/).fill('Java 后端、数据分析')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel(/项目标题/).fill('Java 后端还是数据分析')
  await page.getByRole('button', { name: '完成并开始' }).click()

  await expect(page).toHaveURL(/\/decision-projects\/101$/)
  await page.getByRole('button', { name: /保存并继续/ }).click()
  await expect(page.getByRole('heading', { name: '整理事实、判断和信息缺口' })).toBeVisible()
  const evidenceForm = page.locator('.side-form')
  await evidenceForm.getByLabel('标题').fill('课程项目与 SQL 练习')
  await evidenceForm.getByLabel('说明').fill('完成过 Java 课程项目，也能编写基础 SQL 查询。')
  await evidenceForm.getByLabel('可信度').selectOption('high')
  await evidenceForm.getByRole('button', { name: '添加证据' }).click()
  await expect(page.getByText('课程项目与 SQL 练习')).toBeVisible()
  await page.getByRole('button', { name: '编辑证据' }).click()
  await evidenceForm.getByLabel('说明').fill('完成过 Java 课程项目，并独立整理过 SQL 查询练习。')
  await evidenceForm.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('独立整理过 SQL 查询练习')).toBeVisible()
  await page.getByRole('button', { name: /保存并继续/ }).click()
  await expect(page.getByRole('heading', { name: '保留 2 至 5 个候选方向' })).toBeVisible()

  const addCandidate = async (name: string, support: string, oppose: string) => {
    await page.getByLabel('方向名称').fill(name)
    await page.getByLabel('支持理由').fill(support)
    await page.getByLabel('反对因素').fill(oppose)
    await page.getByLabel('不确定性').fill('需要通过真实任务验证')
    await page.getByLabel('验证动作').fill('完成一个最小实践')
    await page.getByRole('button', { name: '加入候选' }).click()
  }
  await addCandidate('Java 后端', '已有 Java 课程项目', '系统基础仍需补齐')
  await addCandidate('数据分析', 'SQL 基础可复用', '统计基础证据不足')
  const javaCandidate = page.locator('.candidate-card').filter({ hasText: 'Java 后端' })
  await javaCandidate.getByRole('button', { name: '编辑候选' }).click()
  await page.getByLabel('支持理由').fill('已有 Java 课程项目和接口开发经历')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(javaCandidate.getByText('已有 Java 课程项目和接口开发经历')).toBeVisible()
  await expect(page.getByText('当前 2 个候选')).toBeVisible()
  await expectNoPageOverflow()
  await capture('decision-candidates')

  await page.goto('/explore?tab=jobs')
  await expect(page.getByRole('heading', { name: '职业探索' })).toBeVisible()
  const javaJob = page.locator('.job-list article').filter({ hasText: 'Java 后端工程师' })
  await javaJob.getByRole('heading', { name: 'Java 后端工程师' }).click()
  await expect(page.getByRole('heading', { name: '个人证据匹配' })).toBeVisible()
  await javaJob.getByRole('button', { name: '设为目标' }).click()
  await expect(javaJob.getByRole('button', { name: '目标岗位' })).toBeVisible()
  const addJobSample = async (jobName: string, candidateName: string) => {
    const job = page.locator('.job-list article').filter({ hasText: jobName })
    await job.getByRole('button', { name: '加入项目' }).click()
    const dialog = page.locator('md-dialog[open]')
    await dialog.getByLabel('验证候选').selectOption({ label: candidateName })
    await dialog.getByRole('button', { name: '确认加入' }).click()
  }
  await addJobSample('Java 后端工程师', 'Java 后端')
  await addJobSample('数据分析师', '数据分析')

  await page.goto('/decision-projects/101')
  await expect(page.getByRole('heading', { name: '保留 2 至 5 个候选方向' })).toBeVisible()
  await page.getByRole('button', { name: /保存并继续/ }).click()
  await expect(page.getByRole('heading', { name: '使用同一组标准对比' })).toBeVisible()
  await page.getByLabel('兴趣与价值重要度').fill('5')
  await expect(page.getByLabel('兴趣与价值重要度')).toHaveValue('5')

  const saveCandidateComparison = async (index: number, assessment: string) => {
    const cell = page.locator('.criterion-row').first().locator('.comparison-cell').nth(index)
    await cell.locator('select').first().selectOption('4')
    await cell.getByLabel('依据').fill(assessment)
    await cell.locator('select[multiple]').selectOption({ index: 0 })
    await cell.getByLabel('不确定性').fill('还需要更多实践和岗位样本验证')
    await cell.getByLabel('验证动作').fill('完成一个最小实践并记录结果')
    await cell.getByRole('button', { name: '保存' }).click()
  }
  await saveCandidateComparison(0, '已有 Java 课程项目作为基础证据。')
  await saveCandidateComparison(1, '已有 SQL 练习，但分析深度仍需验证。')
  await page.getByRole('button', { name: /保存并继续/ }).click()

  await expect(page.getByRole('heading', { name: '由你确认主目标与备选目标' })).toBeVisible()
  await page.getByLabel('主目标').selectOption({ label: 'Java 后端' })
  await page.getByLabel(/备选目标/).selectOption({ label: '数据分析' })
  await page.getByLabel('选择理由').fill('已有项目证据更强，先用四周行动继续验证。')
  await page.getByLabel('主要风险').fill('系统基础与岗位样本仍不足。')
  await page.getByText('我已查看支持理由、反对因素和不确定性').click()
  await page.getByRole('button', { name: '确认目标' }).click()
  await expect(page.getByText('当前主目标')).toBeVisible()
  await page.getByRole('button', { name: '生成行动计划' }).click()

  await expect(page).toHaveURL(/\/action-plans\/new\?projectId=101/)
  await page.getByRole('button', { name: '生成并保存计划' }).click()
  await expect(page).toHaveURL(/\/action-plans\/501$/)
  await expect(page.getByRole('heading', { name: 'Java 后端' })).toBeVisible()
  await expectNoPageOverflow()
  await capture('action-plan')

  const firstTask = page.locator('.task-card').filter({ hasText: '分析 5 个真实岗位' })
  await firstTask.getByRole('button', { name: '开始' }).click()
  await firstTask.getByRole('button', { name: '完成' }).click()
  await page.getByLabel('成果说明').fill('整理了五个岗位的共同技能与经验要求。')
  await page.getByLabel(/成果链接/).fill('https://example.test/job-evidence')
  await page.getByRole('button', { name: '保存成果' }).click()
  await page.getByRole('button', { name: '本周复盘' }).click()

  await expect(page).toHaveURL(/\/weekly-reviews\/new/)
  await page.getByLabel('完成情况').fill('完成岗位分析，能力缺口整理尚未完成。')
  await page.getByLabel('成果证据').fill('五个岗位样本和一份共同要求清单。')
  await page.getByLabel('遇到的阻碍').fill('课程作业占用了计划时间。')
  await page.getByRole('button', { name: '提交复盘' }).click()
  await page.getByRole('button', { name: '确认提交' }).click()
  await expect(page.getByText('已提交', { exact: true })).toBeVisible()
  await expectNoPageOverflow()
  await capture('weekly-review')

  const adjustment = page.locator('.adjustment-list article').filter({ hasText: '整理当前证据与缺口' })
  await adjustment.getByRole('checkbox').check()
  await adjustment.locator('select').selectOption('skipped')
  await adjustment.getByRole('textbox', { name: '调整原因' }).fill('本周时间不足，先聚焦岗位分析成果。')
  await page.getByRole('button', { name: '确认并应用调整' }).click()
  await page.getByRole('button', { name: '确认应用' }).click()
  await expect(page.getByText('本次复盘的计划调整已经应用')).toBeVisible()
})

test('核心页面在当前视口没有水平溢出', async ({ page }) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/onboarding')
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(hasOverflow).toBe(false)
})

test('历史记录汇总并打开四类旧数据', async ({ page }) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/history')

  await expect(page.getByRole('heading', { name: '历史记录' })).toBeVisible()
  await expect(page.getByText('4 条')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Java 后端还是数据分析' })).toBeVisible()
  await expect(page.getByText('未来三个月优先验证 Java 后端还是数据分析？')).toBeVisible()
  await expect(page.getByRole('heading', { name: '快照中的行动计划' })).toBeVisible()
  await expect(page.getByText('分析 5 个真实岗位')).toBeVisible()

  const filters = page.getByRole('tablist', { name: '历史记录类型筛选' })
  await filters.getByRole('tab', { name: /简历分析/ }).click()
  await expect(page.locator('.history-list > button')).toHaveCount(1)
  await page.locator('.history-list button').filter({ hasText: 'Java 后端简历分析' }).click()
  await expect(page.getByRole('heading', { name: 'Java 后端简历分析' })).toBeVisible()
  await expect(page.getByText('项目成果缺少量化说明')).toBeVisible()

  await filters.getByRole('tab', { name: /旧路径/ }).click()
  await expect(page.locator('.history-list > button')).toHaveCount(1)
  await page.locator('.history-list button').filter({ hasText: 'Java 后端路径计划' }).click()
  await expect(page.getByRole('heading', { name: 'Java 后端路径计划' })).toBeVisible()
  await expect(page.getByText('复习 Spring Boot')).toBeVisible()

  await filters.getByRole('tab', { name: /旧报告/ }).click()
  await expect(page.locator('.history-list > button')).toHaveCount(1)
  await page.locator('.history-list button').filter({ hasText: '旧版职业报告' }).click()
  await expect(page.getByRole('heading', { name: '旧版职业报告' })).toBeVisible()
  await expect(page.getByText('保留原始报告结论。')).toBeVisible()

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(hasOverflow).toBe(false)
})

test('AI 导师重试沿用请求并继续同一会话', async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/chat/messages') {
      chatRequests.push(request.postDataJSON() as Record<string, unknown>)
    }
  })
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/profile')

  await page.getByRole('button', { name: '打开 AI 导师' }).click()
  await page.getByLabel('向 AI 导师提问').fill('请测试重试')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByText('重试成功，原问题已经保留。')).toBeVisible()

  await page.getByLabel('向 AI 导师提问').fill('继续提问')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('这是同一会话中的后续回答。')).toBeVisible()

  expect(chatRequests).toHaveLength(3)
  expect(chatRequests[1]?.requestId).toBe(chatRequests[0]?.requestId)
  expect(chatRequests[2]?.sessionId).toBe(13001)
})
