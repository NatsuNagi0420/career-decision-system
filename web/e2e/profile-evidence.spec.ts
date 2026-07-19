import { expect, test } from '@playwright/test'
import { installMockApi } from './mockApi'

const now = '2026-07-19T10:00:00'

test('个人证据使用本地化的 MD3 卡片并约束长内容', async ({ page }) => {
  await installMockApi(page)
  await page.route('**/api/v1/personal-evidence', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: [{
          id: 901,
          evidenceType: 'project',
          title: '项目经历',
          description: '传统全栈多端项目与 Agent 应用适配',
          roleName: '全栈开发',
          resultSummary: '一个项目包含小程序和网页，另一个项目包含 Android App、网页与 Agent 服务层。',
          linkUrl: null,
          proficiency: '熟悉前后端数据库联调、视频剪辑、文档制作和演示文稿制作',
          lastUsedAt: '2026-07-18',
          feedback: null,
          sourceType: 'user',
          sourceRefType: null,
          sourceRefId: null,
          credibility: 'high',
          visibility: 'private',
          occurredAt: '2026-07-18',
          createdAt: now,
          updatedAt: now
        }],
        timestamp: Date.now(),
        traceId: 'e2e-profile-evidence'
      })
    })
  })
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })

  await page.goto('/profile')
  const card = page.locator('.evidence-item')
  await expect(card).toHaveCount(1)
  await expect(card.getByText('项目经历', { exact: true }).first()).toBeVisible()
  await expect(card.getByText('由你填写', { exact: true })).toBeVisible()
  await expect(card.getByText('可靠程度 · 比较确定', { exact: true })).toBeVisible()
  await expect(card).not.toContainText(/\bproject\b|\bhigh\b/)

  const visual = await card.evaluate((element) => {
    const cardStyle = getComputedStyle(element)
    const panel = element.closest<HTMLElement>('.evidence-panel')!
    const panelStyle = getComputedStyle(panel)
    const chip = element.querySelector<HTMLElement>('.evidence-kind')!
    const chipStyle = getComputedStyle(chip)
    return {
      paddingInline: Number.parseFloat(cardStyle.paddingLeft),
      borderRadius: Number.parseFloat(cardStyle.borderRadius),
      cardBackground: cardStyle.backgroundColor,
      panelBackground: panelStyle.backgroundColor,
      chipRadius: Number.parseFloat(chipStyle.borderRadius),
      cardOverflow: element.scrollWidth > element.clientWidth + 1,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }
  })

  expect(visual.paddingInline).toBeGreaterThanOrEqual(14)
  expect(visual.borderRadius).toBeGreaterThanOrEqual(12)
  expect(visual.chipRadius).toBeGreaterThanOrEqual(12)
  expect(visual.cardBackground).not.toBe(visual.panelBackground)
  expect(visual.cardOverflow).toBe(false)
  expect(visual.pageOverflow).toBe(false)
})
