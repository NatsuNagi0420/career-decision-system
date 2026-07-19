import { expect, test } from '@playwright/test'
import { installMockApi } from './mockApi'

test('登录与注册使用有方向的 MD3 共享轴切换并平滑调整高度', async ({ page }) => {
  await installMockApi(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/login')

  const stage = page.locator('.auth-mode-stage')
  await expect(page.getByRole('heading', { name: '继续你的职业决策' })).toBeVisible()
  await page.getByRole('tab', { name: '注册' }).click()
  await expect(page.getByRole('heading', { name: '创建学生账号' })).toBeVisible()
  await expect(stage).toHaveAttribute('data-direction', 'forward')

  const forwardMotion = await stage.evaluate((element) => ({
    hasHeightAnimation: element.getAnimations().some((animation) =>
      animation.effect?.getKeyframes().some((frame) => typeof frame.height === 'string')
    ),
    hasSharedAxisTransition: Boolean(
      element.querySelector('.auth-mode-enter-active') &&
      element.querySelector('.auth-mode-leave-active')
    )
  }))
  expect(forwardMotion).toEqual({ hasHeightAnimation: true, hasSharedAxisTransition: true })
  await expect.poll(() => stage.evaluate((element) => element.style.height)).toBe('')

  await page.getByRole('tab', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: '继续你的职业决策' })).toBeVisible()
  await expect(stage).toHaveAttribute('data-direction', 'backward')
  await expect.poll(() => stage.evaluate((element) => element.style.height)).toBe('')
})

test('减少动态效果时登录表单直接切换且不保留动画高度', async ({ page }) => {
  await installMockApi(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login')

  const stage = page.locator('.auth-mode-stage')
  await page.getByRole('tab', { name: '注册' }).click()
  await expect(page.getByRole('heading', { name: '创建学生账号' })).toBeVisible()
  await expect(stage).not.toHaveAttribute('style', /height/)
  expect(await stage.evaluate((element) =>
    element.getAnimations().some((animation) =>
      animation.effect?.getKeyframes().some((frame) => typeof frame.height === 'string')
    )
  )).toBe(false)
})

test('设置页从所选模式控件中心辐射切换实际明暗主题', async ({ page }) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()

  const root = page.locator('html')
  const currentScheme = await root.getAttribute('data-theme-mode')
  const targetScheme = currentScheme === 'dark' ? 'light' : 'dark'
  const trigger = page.getByRole('tab', { name: targetScheme === 'dark' ? '深色' : '浅色' })
  const bounds = await trigger.boundingBox()
  expect(bounds).not.toBeNull()

  await trigger.click()
  await expect(root).toHaveAttribute('data-theme-transition', 'running')
  await expect(root).toHaveAttribute('data-theme-mode', targetScheme)
  await expect(trigger).toBeFocused()

  const boundsDuring = await trigger.boundingBox()
  expect(boundsDuring).not.toBeNull()
  const origin = await root.evaluate((element) => ({
    x: Number.parseFloat(element.style.getPropertyValue('--career-theme-transition-x')),
    y: Number.parseFloat(element.style.getPropertyValue('--career-theme-transition-y'))
  }))
  expect(Math.abs(origin.x - (boundsDuring!.x + boundsDuring!.width / 2))).toBeLessThanOrEqual(2)
  expect(Math.abs(origin.y - (boundsDuring!.y + boundsDuring!.height / 2))).toBeLessThanOrEqual(2)
  await expect(root).not.toHaveAttribute('data-theme-transition', 'running', { timeout: 3_000 })
})
