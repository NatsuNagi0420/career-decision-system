import { expect, test } from '@playwright/test'
import { installMockApi } from './mockApi'

test('学生在工作区完成 V2 方向了解、临时计划和目标升级', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
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
  const taskResultRequests: Array<Record<string, unknown>> = []
  page.on('request', (request) => {
    if (/\/action-plans\/\d+\/tasks\/\d+\/results$/.test(new URL(request.url()).pathname)) {
      taskResultRequests.push(request.postDataJSON() as Record<string, unknown>)
    }
  })
  await installMockApi(page)
  await page.goto('/login')

  await page.getByRole('tab', { name: '注册' }).click()
  const registerView = page.locator('[data-auth-mode="register"]')
  await expect(registerView).toBeVisible()
  await registerView.getByLabel('用户名', { exact: true }).fill('e2e_student')
  await registerView.getByLabel('手机号').fill('13900000001')
  await registerView.getByLabel('密码', { exact: true }).fill('StrongPass123')
  await registerView.getByLabel('确认密码').fill('StrongPass123')
  await registerView.getByText('我已阅读并同意用户协议和隐私政策').click()
  await registerView.getByRole('button', { name: '创建并开始引导' }).click()

  await expect(page).toHaveURL(/\/onboarding$/)
  await page.getByLabel(/专业/).fill('软件工程')
  await page.getByLabel(/当前年级/).selectOption('大三')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel(/你现在最想想清楚什么/).fill('未来三个月优先验证 Java 后端还是数据分析？')
  const directionInput = page.getByLabel(/你已经想到哪些方向/).locator('input')
  await directionInput.fill('Java 后端、数据分析')
  await directionInput.press('Enter')
  await expect(page.getByText('已添加 2 / 5 项')).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel(/给这次思考起个名字/).fill('Java 后端还是数据分析')
  await page.getByLabel(/希望什么时候有一个初步答案/).fill('2026-08-31')
  await page.getByRole('button', { name: '完成并开始' }).click()

  await expect(page).toHaveURL(/\/decision-projects\/101$/)
  await expect(page.getByRole('heading', { name: '先说说你在考虑什么' })).toBeVisible()
  await page.getByRole('button', { name: /能做出作品/ }).click()
  await page.getByRole('button', { name: /有真实岗位可以参考/ }).click()
  await page.getByRole('button', { name: /长期高频出差/ }).click()
  await page.getByRole('button', { name: /保存并看看下一步/ }).click()

  await expect(page.getByRole('heading', { name: '看看有哪些选择' })).toBeVisible()
  await expect(page.locator('.candidate-card').filter({ hasText: 'Java 后端' })).toBeVisible()
  await expect(page.locator('.candidate-card').filter({ hasText: '数据分析' })).toBeVisible()
  await expectNoPageOverflow()
  await capture('decision-candidates')
  await page.getByRole('button', { name: /保存并看看下一步/ }).click()

  await expect(page.getByRole('heading', { name: '多了解一些' })).toBeVisible()
  const addResources = async (candidateName: string, evidenceTitle: string, syncToProfile: boolean) => {
    const card = page.locator('.understanding-card').filter({ has: page.getByRole('heading', { name: candidateName, exact: true }) })
    await card.getByRole('button', { name: /我有哪些相关经历/ }).click()
    const evidenceSheet = page.getByRole('dialog', { name: `${candidateName} 的补充资料` })
    await evidenceSheet.getByLabel('用一句话概括').fill(evidenceTitle)
    await evidenceSheet.getByLabel('再补充一点（可选）').fill(`我亲自完成过与${candidateName}有关的课程练习。`)
    await evidenceSheet.getByLabel('这条内容有多确定').selectOption('high')
    if (syncToProfile) await evidenceSheet.getByRole('checkbox', { name: '同时保存到我的个人资料' }).click()
    await evidenceSheet.getByRole('button', { name: '保存这段内容' }).click()
    await expect(evidenceSheet.getByText(evidenceTitle, { exact: true }).first()).toBeVisible()
    await evidenceSheet.getByRole('button', { name: '关闭' }).click()

    await card.getByRole('button', { name: /真实岗位通常在找什么/ }).click()
    const jobSheet = page.getByRole('dialog', { name: `${candidateName} 的补充资料` })
    await jobSheet.getByRole('button', { name: '放到这个方向' }).click()
    await expect(jobSheet.getByRole('button', { name: '已经放入' })).toBeVisible()
    await jobSheet.getByRole('button', { name: '关闭' }).click()
    await expect(page).toHaveURL(/\/decision-projects\/101$/)
  }
  await addResources('Java 后端', 'Java 课程项目', true)
  await addResources('数据分析', 'SQL 数据练习', false)
  await expect(page.getByText('每个方向都有了可以参考的内容。')).toBeVisible()
  await page.getByRole('button', { name: /保存并看看下一步/ }).click()

  await expect(page.getByRole('heading', { name: '放在一起看看' })).toBeVisible()
  for (const card of await page.locator('.overall-card').all()) {
    for (const criterion of await card.locator('.criterion-check').all()) {
      const copy = await criterion.innerText()
      const verdict = copy.includes('一定要有') ? 'meets' : copy.includes('不太能接受') ? 'not_found' : 'good_fit'
      await criterion.locator('select').selectOption(verdict)
    }
  }
  await page.getByRole('button', { name: /保存并决定下一步/ }).click()

  await expect(page.getByRole('heading', { name: '决定下一步先试什么' })).toBeVisible()
  await page.getByLabel(/目前更想先试试哪个方向/).selectOption({ label: 'Java 后端' })
  await page.getByLabel(/为什么目前更想先试这个/).fill('已经有一段项目经历，想用四周时间继续感受实际工作。')
  await page.getByLabel(/准备什么时候回来看看/).fill('2026-09-30')
  await page.getByRole('checkbox', { name: '确认这是我目前愿意先尝试的方向' }).click()
  await page.getByRole('button', { name: '保存这次选择', exact: true }).click()
  await expect(page.getByText('目前先尝试').first()).toBeVisible()
  await page.getByRole('button', { name: '安排一段了解计划' }).click()

  await expect(page).toHaveURL(/\/action-plans\/new\?projectId=101&planType=validation/)
  await page.getByRole('button', { name: '先看看计划' }).click()
  await expect(page.getByRole('region', { name: '行动计划草稿' })).toBeVisible()
  await expect(page.getByText('多了解一些', { exact: true })).toBeVisible()
  await expect(page.getByText('Java、Spring Boot 与数据库设计').first()).toBeVisible()
  await page.getByRole('button', { name: '保存这份计划' }).click()
  await expect(page).toHaveURL(/\/action-plans\/501$/)
  await expect(page.getByRole('heading', { name: 'Java 后端', exact: true })).toBeVisible()
  await expect(page.getByText('多了解一些', { exact: true })).toBeVisible()
  await expectNoPageOverflow()
  await capture('action-plan')

  const firstTask = page.locator('.task-card').filter({ hasText: '分析 5 个真实岗位' })
  await firstTask.getByRole('button', { name: '开始' }).click()
  await firstTask.getByRole('button', { name: '完成' }).click()
  await page.getByLabel(/简单说说你做了什么/).fill('整理了五个岗位的共同技能与经验要求。')
  await page.getByLabel(/相关链接/).fill('https://example.test/job-evidence')
  await page.getByRole('checkbox', { name: '同时加入我的个人经历' }).click()
  await page.getByRole('button', { name: '保存成果' }).click()
  expect(taskResultRequests.at(-1)?.saveAsEvidence).toBe(true)

  await page.goto('/decision-projects/101')
  await expect(page.getByRole('heading', { name: '决定下一步先试什么' })).toBeVisible()
  await page.locator('.choice-level md-radio[aria-label="已经比较了解"]').click()
  await page.getByLabel(/还想保留哪个备选方向/).selectOption({ label: '数据分析' })
  await page.getByRole('checkbox', { name: '确认这是我目前愿意先尝试的方向' }).click()
  await page.getByRole('button', { name: '保存这次选择', exact: true }).click()
  await page.getByRole('button', { name: '生成正式行动计划' }).click()

  await expect(page).toHaveURL(/\/action-plans\/new\?projectId=101&planType=action/)
  await page.getByRole('button', { name: '先看看计划' }).click()
  await expect(page.getByText('继续向目标前进')).toBeVisible()
  await page.getByRole('button', { name: '保存这份计划' }).click()
  await expect(page).toHaveURL(/\/action-plans\/501$/)
  await expect(page.getByText('下一步计划', { exact: true })).toBeVisible()
})

test('决策阶段导航完整显示标题且不裁切文字', async ({ page }) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/decision-projects/new')

  const expectedStages = [
    ['brief', '先说说你在考虑什么', '说明困惑、时间和在意的事情'],
    ['candidates', '看看有哪些选择', '保留两三个想进一步了解的方向'],
    ['validate', '多了解一些', '把经历和真实岗位放到方向旁边'],
    ['compare', '放在一起看看', '只关注真正影响选择的差异'],
    ['commit', '决定下一步先试什么', '选择一个方向并安排回看时间']
  ] as const
  const viewportWidth = page.viewportSize()?.width ?? 1440

  for (const [code, titleText, helpText] of expectedStages) {
    const button = page.locator(`.stage-button[data-stage="${code}"]`)
    const title = button.locator('.stage-copy strong')
    const help = button.locator('.stage-copy small')
    await expect(title).toHaveText(titleText)
    await expect(help).toHaveText(helpText)

    if (viewportWidth <= 680) {
      await expect(button.locator('.stage-copy')).toBeHidden()
      continue
    }

    await expect(title).toBeVisible()
    const titleBounds = await title.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      const container = element.closest('.stage-button')!.getBoundingClientRect()
      return {
        textLeft: text.left,
        textRight: text.right,
        textTop: text.top,
        textBottom: text.bottom,
        containerLeft: container.left,
        containerRight: container.right,
        containerTop: container.top,
        containerBottom: container.bottom
      }
    })
    expect(titleBounds.textLeft).toBeGreaterThanOrEqual(titleBounds.containerLeft - 1)
    expect(titleBounds.textRight).toBeLessThanOrEqual(titleBounds.containerRight + 1)
    expect(titleBounds.textTop).toBeGreaterThanOrEqual(titleBounds.containerTop - 1)
    expect(titleBounds.textBottom).toBeLessThanOrEqual(titleBounds.containerBottom + 1)

    if (viewportWidth > 1100) {
      await expect(help).toBeVisible()
      const helpIsClipped = await help.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const text = range.getBoundingClientRect()
        const box = element.getBoundingClientRect()
        return text.left < box.left - 1 || text.right > box.right + 1
          || text.top < box.top - 1 || text.bottom > box.bottom + 1
      })
      expect(helpIsClipped).toBe(false)
    } else {
      await expect(help).toBeHidden()
    }
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('方向建议长内容保持清晰层级且操作按钮不偏移', async ({ page }) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/decision-projects/new')
  await page.evaluate(async () => {
    const request = (path: string, method: string, data: Record<string, unknown>) => fetch(`/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': `web-e2e-agent-layout-${path}` },
      body: JSON.stringify(data)
    })
    await request('/decision-projects', 'POST', {
      title: '开发方向比较',
      question: '未来三个月先尝试哪一个开发方向？',
      decisionDeadline: '2026-09-30',
      priorities: ['能做出作品'],
      initialCandidates: [{ name: 'Java 后端' }, { name: '数据分析' }]
    })
    await request('/decision-projects/101/stage', 'PATCH', { stage: 'candidates' })
  })
  await page.goto('/decision-projects/101')
  await page.getByRole('button', { name: '请穗奈帮我想想' }).click()

  const panel = page.locator('.agent-insight').filter({ has: page.getByRole('heading', { name: '可以参考的方向' }) })
  await expect(panel).toBeVisible()
  await expect(panel.getByText('参考了这些信息')).toBeVisible()
  await expect(panel.getByText('还需要留意')).toBeVisible()
  await expect(panel.getByText('接下来可以这样了解')).toBeVisible()
  await expect(panel.getByText('参考：这次思考')).toBeVisible()
  await expect(panel).not.toContainText('decision-project:101')

  const layout = await panel.evaluate((element) => {
    const grid = element.querySelector('.agent-grid')!.getBoundingClientRect()
    const evidence = element.querySelector('.agent-evidence')!.getBoundingClientRect()
    const cautions = element.querySelector('.agent-cautions')!.getBoundingClientRect()
    const next = element.querySelector('.agent-next')!.getBoundingClientRect()
    return {
      grid: { left: grid.left, right: grid.right },
      evidence: { top: evidence.top, bottom: evidence.bottom },
      cautions: { top: cautions.top, bottom: cautions.bottom },
      next: { left: next.left, right: next.right, top: next.top }
    }
  })
  expect(Math.abs(layout.next.left - layout.grid.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(layout.next.right - layout.grid.right)).toBeLessThanOrEqual(1)
  expect(layout.next.top).toBeGreaterThanOrEqual(Math.max(layout.evidence.bottom, layout.cautions.bottom) - 1)

  for (const row of await panel.locator('.ai-suggestion-list article').all()) {
    const bounds = await row.evaluate((element) => {
      const rowBounds = element.getBoundingClientRect()
      const buttonBounds = element.querySelector('.m3-button')!.getBoundingClientRect()
      return {
        rowLeft: rowBounds.left,
        rowRight: rowBounds.right,
        buttonLeft: buttonBounds.left,
        buttonRight: buttonBounds.right
      }
    })
    expect(bounds.buttonLeft).toBeGreaterThanOrEqual(bounds.rowLeft - 1)
    expect(bounds.buttonRight).toBeLessThanOrEqual(bounds.rowRight + 1)
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('工作区侧栏支持键盘、移动端全屏和减少动效', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/decision-projects/new')
  await page.evaluate(async () => {
    const request = (path: string, method: string, data: Record<string, unknown>) => fetch(`/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': `web-e2e-seed-${path}` },
      body: JSON.stringify(data)
    })
    await request('/decision-projects', 'POST', {
      title: '键盘测试',
      question: '我想了解哪个方向更适合自己？',
      decisionDeadline: '2026-08-31',
      priorities: ['能做出作品'],
      initialCandidates: [{ name: 'Java 后端' }, { name: '数据分析' }]
    })
    await request('/decision-projects/101/stage', 'PATCH', { stage: 'candidates' })
    await request('/decision-projects/101/stage', 'PATCH', { stage: 'validate' })
  })
  await page.goto('/decision-projects/101')

  const trigger = page.locator('.understanding-card').first().getByRole('button', { name: /我有哪些相关经历/ })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog', { name: 'Java 后端 的补充资料' })
  await expect(sheet).toBeVisible()
  const sheetState = await sheet.evaluate((element) => ({
    bodyOverflow: document.body.style.overflow,
    transitionDuration: getComputedStyle(element).transitionDuration,
    width: element.getBoundingClientRect().width,
    viewportWidth: window.innerWidth,
    focusInside: element.contains(document.activeElement)
  }))
  expect(sheetState.bodyOverflow).toBe('hidden')
  expect(Number.parseFloat(sheetState.transitionDuration)).toBeLessThanOrEqual(0.001)
  expect(sheetState.focusInside).toBe(true)
  if (sheetState.viewportWidth <= 600) expect(Math.abs(sheetState.width - sheetState.viewportWidth)).toBeLessThanOrEqual(1)

  await page.keyboard.press('Tab')
  expect(await sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('新建项目遇到网络问题时保留并恢复本地草稿', async ({ page }) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  let failOnce = true
  await page.route('**/api/v1/decision-projects', async (route) => {
    if (route.request().method() === 'POST' && failOnce) {
      failOnce = false
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 503, message: '服务暂时不可用，请稍后重试', data: null })
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/decision-projects/new')
  const question = page.getByLabel(/你现在最想想清楚什么/)
  await question.fill('未来三个月，我应该先尝试哪个开发方向？')
  await page.getByLabel(/希望什么时候有一个初步答案/).fill('2026-09-15')
  await page.getByRole('button', { name: /能做出作品/ }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('career.form-draft.1.decision-project-v2-new'))).not.toBeNull()

  await page.getByRole('button', { name: /保存并看看下一步/ }).click()
  await expect(page.getByText('这次还没有保存成功，你填写的内容仍然保留着，可以再试一次。')).toBeVisible()
  await expect(question).toHaveValue('未来三个月，我应该先尝试哪个开发方向？')

  await page.reload()
  await expect(question).toHaveValue('未来三个月，我应该先尝试哪个开发方向？')
  await expect(page.getByText('能做出作品', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /保存并看看下一步/ }).click()
  await expect(page).toHaveURL(/\/decision-projects\/101$/)
  await expect(page.getByRole('heading', { name: '看看有哪些选择' })).toBeVisible()
  const catalogSuggestion = page.locator('.direction-suggestion-list').getByRole('button', { name: /后端开发/ })
  await expect(catalogSuggestion).toBeVisible()
  await catalogSuggestion.click()
  await expect(page.locator('.candidate-card').filter({ hasText: '后端开发' })).toBeVisible()
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

test('工作台决策概况使用动态取色卡片且不显示内部阶段码', async ({ page }, testInfo) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/decision-projects/new')
  await page.evaluate(async () => {
    const request = (path: string, method: string, data: Record<string, unknown>) => fetch(`/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': `web-e2e-dashboard-${path}` },
      body: JSON.stringify(data)
    })
    await request('/decision-projects', 'POST', {
      title: '未来三个月的开发方向',
      question: '未来三个月，我应该先尝试 AI Agent 应用开发，还是 Java 后端开发？',
      decisionDeadline: '2026-09-30',
      priorities: ['能做出作品'],
      initialCandidates: [{ name: 'AI Agent 应用开发' }, { name: 'Java 后端开发' }]
    })
    await request('/decision-projects/101/stage', 'PATCH', { stage: 'candidates' })
  })

  await page.goto('/')
  const summary = page.locator('.project-summary')
  await expect(summary).toBeVisible()
  await expect(summary.getByText('看看有哪些选择', { exact: true })).toBeVisible()
  await expect(summary).not.toContainText('candidates')
  await expect(summary.getByRole('term')).toHaveCount(4)
  await expect(summary.getByText('目前想先试', { exact: true })).toBeVisible()
  await expect(summary.getByText('看过的岗位', { exact: true })).toBeVisible()

  const metrics = summary.locator('dl[aria-label="当前决策概况"] > div')
  await expect(metrics).toHaveCount(4)
  const layout = await summary.evaluate((element) => {
    const rows = Array.from(element.querySelectorAll('dl > div')) as HTMLElement[]
    const resolveBackground = (value: string) => {
      const sample = document.createElement('span')
      sample.style.background = value
      document.body.append(sample)
      const color = getComputedStyle(sample).backgroundColor
      sample.remove()
      return color
    }
    const firstStyle = getComputedStyle(rows[0]!)
    const rects = rows.map((row) => row.getBoundingClientRect())
    return {
      columnCount: new Set(rects.map((rect) => Math.round(rect.left))).size,
      borderRadius: Number.parseFloat(firstStyle.borderRadius),
      tileBackground: firstStyle.backgroundColor,
      lowestSurface: resolveBackground('var(--md-sys-color-surface-container-lowest)'),
      hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }
  })
  expect(layout.columnCount).toBe((page.viewportSize()?.width || 1440) <= 560 ? 1 : 2)
  expect(layout.borderRadius).toBeGreaterThanOrEqual(8)
  expect(layout.tileBackground).not.toBe(layout.lowestSurface)
  expect(layout.hasOverflow).toBe(false)

  if ((page.viewportSize()?.width || 1440) > 820) {
    const cardHeights = await page.locator('.dashboard-grid .dashboard-section > .m3-card').evaluateAll((cards) =>
      cards.map((card) => card.getBoundingClientRect().height)
    )
    expect(Math.abs(cardHeights[0]! - cardHeights[1]!)).toBeLessThanOrEqual(1)
  }

  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach('dashboard-tonal-metrics', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }
})

test('职业方向使用服务端稳定映射并展示结构化 JD', async ({ page }) => {
  const apiPaths: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/v1/')) apiPaths.push(url.pathname)
  })
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })

  await page.goto('/explore/directions/11')
  await expect(page.getByRole('heading', { name: '后端开发', level: 1 })).toBeVisible()
  await expect(page.locator('.requirement-block').getByText('熟悉 Java 与 Spring Boot', { exact: true })).toBeVisible()
  await expect(page.locator('.related-job')).toHaveCount(1)
  expect(apiPaths).toContain('/api/v1/career-directions/11/jobs')
  expect(apiPaths).toContain('/api/v1/career-directions/11/insights')
  expect(apiPaths.some((path) => path === '/api/v1/jobs')).toBe(false)

  await page.locator('.related-job').click()
  await expect(page.getByRole('heading', { name: '岗位职责' })).toBeVisible()
  await expect(page.getByText('开发并维护后端接口')).toBeVisible()
  await expect(page.getByRole('heading', { name: '任职要求' })).toBeVisible()
  await expect(page.getByText('掌握 MySQL 和基础数据库设计', { exact: true })).toBeVisible()
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

test('独立穗奈助手可以恢复、创建和管理历史会话', async ({ page }) => {
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
  await page.goto('/assistant')

  await expect(page.getByRole('main', { name: '穗奈助手对话' })).toBeVisible()
  await page.getByRole('button', { name: /^岗位方向比较/ }).click()
  await expect(page.getByText('Java 后端和数据分析应该先验证哪个？')).toBeVisible()
  await expect(page.getByRole('main', { name: '穗奈助手对话' }).getByText('先用相同维度比较两个方向，再各做一个低成本体验任务。')).toBeVisible()

  await page.getByRole('button', { name: '开始新会话' }).click()
  await expect(page.getByRole('heading', { name: '你好，我是穗奈' })).toBeVisible()
  await page.getByLabel('向穗奈提问').fill('帮我安排下一步')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.getByRole('main', { name: '穗奈助手对话' }).getByText('重试成功，原问题已经保留。')).toBeVisible()

  await page.getByRole('button', { name: '重命名会话' }).click()
  await page.getByLabel('会话名称').fill('我的职业讨论')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('我的职业讨论', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: '删除会话', exact: true }).click()
  await expect(page.getByRole('button', { name: '删除会话', exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: '删除会话', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: '你好，我是穗奈' })).toBeVisible()
  await expect(page.getByText('会话已删除')).toBeVisible()
  await page.goto('/assistant?session=13001')
  await expect(page.getByRole('heading', { name: '你好，我是穗奈' })).toBeVisible()
  await expect(page).not.toHaveURL(/session=13001/)

  const composer = page.getByLabel('向穗奈提问')
  await composer.click()
  await composer.pressSequentially('请测试重试')
  await expect(composer).toHaveValue('请测试重试')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByRole('main', { name: '穗奈助手对话' }).getByText('重试成功，原问题已经保留。')).toBeVisible()
  expect(chatRequests.at(-1)?.requestId).toBe(chatRequests.at(-2)?.requestId)
})
