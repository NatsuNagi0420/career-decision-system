import { expect, test } from '@playwright/test'
import { installMockApi } from './mockApi'

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1440', '精细指针交互只需在桌面项目验证')
  await installMockApi(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 15_000 })
})

test('磁吸反色保留头像原色并把精密滑动操作置于最高优先级', async ({ page }, testInfo) => {
  const cursor = page.locator('.navigation-magnetic-cursor')
  const accountTrigger = page.locator('.user-profile')
  const avatar = page.locator('.user-profile img')
  const heading = page.getByRole('heading', { name: '设置' })
  const [accountBounds, avatarBounds, headingBounds] = await Promise.all([
    accountTrigger.boundingBox(),
    avatar.boundingBox(),
    heading.boundingBox()
  ])
  expect(accountBounds).not.toBeNull()
  expect(avatarBounds).not.toBeNull()
  expect(headingBounds).not.toBeNull()
  await expect.poll(() => avatar.evaluate((element) => (
    element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0
  ))).toBe(true)

  await page.mouse.move(
    headingBounds!.x + headingBounds!.width / 2,
    headingBounds!.y + headingBounds!.height / 2
  )
  const opaqueAvatarCenter = {
    x: avatarBounds!.x + avatarBounds!.width * 0.25,
    y: avatarBounds!.y + avatarBounds!.height * 0.25,
    width: avatarBounds!.width * 0.5,
    height: avatarBounds!.height * 0.5
  }
  const avatarBefore = await page.screenshot({ clip: opaqueAvatarCenter })

  await page.mouse.move(
    accountBounds!.x + accountBounds!.width / 2,
    accountBounds!.y + accountBounds!.height / 2
  )
  await expect(accountTrigger).toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-preserved-media', '1')
  await expect.poll(() => cursor.evaluate((element) => getComputedStyle(element).maskImage)).not.toBe('none')
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  const avatarDuringMagnetism = await page.screenshot({ clip: opaqueAvatarCenter })
  if (!avatarDuringMagnetism.equals(avatarBefore)) {
    await testInfo.attach('avatar-before', { body: avatarBefore, contentType: 'image/png' })
    await testInfo.attach('avatar-during-magnetism', { body: avatarDuringMagnetism, contentType: 'image/png' })
    await testInfo.attach('cursor-mask', {
      body: await cursor.evaluate((element) => JSON.stringify({
        bounds: element.getBoundingClientRect().toJSON(),
        mask: getComputedStyle(element).maskImage
      }, null, 2)),
      contentType: 'application/json'
    })
  }
  expect(avatarDuringMagnetism.equals(avatarBefore)).toBe(true)

  const slider = page.getByRole('slider', { name: '主题对比度' })
  const sliderBounds = await slider.boundingBox()
  expect(sliderBounds).not.toBeNull()
  await page.mouse.move(
    sliderBounds!.x + sliderBounds!.width / 2,
    sliderBounds!.y + sliderBounds!.height / 2
  )
  await expect(accountTrigger).not.toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toBeHidden()
  await expect(page.locator('html')).not.toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
})

test('横向滚动条会立即解除附近问题按钮的磁吸状态', async ({ page }) => {
  const cursor = page.locator('.navigation-magnetic-cursor')
  await page.getByRole('button', { name: '打开 AI 导师' }).click()
  const scroller = page.getByRole('group', { name: '示例问题' })
  const question = scroller.locator('md-text-button').first()
  const questionBounds = await question.boundingBox()
  expect(questionBounds).not.toBeNull()

  await page.mouse.move(
    questionBounds!.x + questionBounds!.width / 2,
    questionBounds!.y + questionBounds!.height / 2
  )
  await expect(question).toHaveAttribute('data-magnetic-active', 'true')

  const scrollbar = await scroller.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.bottom - Math.max(4, (element.offsetHeight - element.clientHeight) / 2),
      overflow: element.scrollWidth - element.clientWidth
    }
  })
  expect(scrollbar.overflow).toBeGreaterThan(0)
  await page.mouse.move(scrollbar.x, scrollbar.y)

  await expect(question).not.toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toBeHidden()
  await expect(page.locator('html')).not.toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
})
