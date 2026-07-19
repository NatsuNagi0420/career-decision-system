import { expect, test } from '@playwright/test'
import { installMockApi } from './mockApi'

type CursorContinuityWindow = Window & {
  __careerCursorContinuity?: {
    observer: MutationObserver
    changes: string[]
  }
}

type ThemeRevealWindow = Window & {
  __careerThemeReveal?: {
    animation: Animation
    duration: number
    easing: string
    end: string
    pseudoElement: string
    start: string
  }
  __careerViewTransitionCalls?: number
}

test.beforeEach(async ({ page }) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('career_token', 'e2e-access-token')
    localStorage.setItem('career_user', JSON.stringify({ id: 1, username: 'e2e_student' }))
  })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 15_000 })
})

test('动态颜色、对比度和账户菜单保持完整交互', async ({ page }) => {
  await page.getByRole('tab', { name: '浅色' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light')
  const brandPrimary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary'))

  const blueSeed = page.getByRole('button', { name: '远山蓝' })
  await blueSeed.click()
  await expect(blueSeed).toHaveAttribute('aria-pressed', 'true')
  const customPrimary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary'))
  expect(customPrimary).not.toBe(brandPrimary)

  const contrast = page.getByRole('slider', { name: '主题对比度' })
  await contrast.press('End')
  const storedAfterContrast = await page.evaluate(() => JSON.parse(localStorage.getItem('career-md3-theme-v1') || '{}'))
  expect(storedAfterContrast).toMatchObject({ seedColor: '#2f5f8f', colorSource: 'custom_seed', contrastLevel: 1 })

  await page.getByRole('tab', { name: '深色' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark')
  await expect(page).toHaveURL(/\/settings$/)

  const accountTrigger = page.getByRole('button', { name: 'e2e_student' })
  await accountTrigger.click()
  const menu = page.getByRole('menu', { name: '账户菜单' })
  await expect(menu).toBeVisible()
  const profileItem = menu.getByRole('menuitem', { name: '个人档案' })
  const historyItem = menu.getByRole('menuitem', { name: '历史记录' })
  await expect(profileItem).toBeFocused()
  await expect(historyItem).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '设置' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '退出登录' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(historyItem).toBeFocused()
  await page.keyboard.press('Home')
  await expect(profileItem).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(accountTrigger).toBeFocused()
})

test('theme button reveals the new scheme radially without moving or losing focus', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => {
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function (
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions
    ) {
      const animation = originalAnimate.call(this, keyframes, options)
      const animationOptions = typeof options === 'number' ? { duration: options } : options
      if (animationOptions?.pseudoElement !== '::view-transition-new(root)' || !keyframes || Array.isArray(keyframes)) {
        return animation
      }

      const clipPath = keyframes.clipPath
      const values = Array.isArray(clipPath) ? clipPath.map(String) : [String(clipPath)]
      const duration = Number(animationOptions.duration)
      animation.pause()
      animation.currentTime = duration * 0.45
      ;(window as ThemeRevealWindow).__careerThemeReveal = {
        animation,
        duration,
        easing: String(animationOptions.easing),
        end: values[1] || '',
        pseudoElement: animationOptions.pseudoElement,
        start: values[0] || ''
      }
      return animation
    }
  })

  const root = page.locator('html')
  const themeButton = page.locator('.top-actions md-icon-button').first()
  const boundsBefore = await themeButton.boundingBox()
  expect(boundsBefore).not.toBeNull()
  const themeBefore = await root.getAttribute('data-theme-mode')

  await themeButton.focus()
  await expect(themeButton).toBeFocused()
  await themeButton.press('Enter')

  await expect.poll(() => page.evaluate(() => Boolean(
    (window as ThemeRevealWindow).__careerThemeReveal
  ))).toBe(true)
  await expect.poll(() => root.getAttribute('data-theme-mode')).not.toBe(themeBefore)
  await expect(root).toHaveAttribute('data-theme-transition', 'running')
  await expect(themeButton).toBeFocused()

  const capture = await page.evaluate(() => {
    const reveal = (window as ThemeRevealWindow).__careerThemeReveal
    if (!reveal) throw new Error('Theme reveal animation was not captured')
    return {
      duration: reveal.duration,
      easing: reveal.easing,
      end: reveal.end,
      pseudoElement: reveal.pseudoElement,
      start: reveal.start
    }
  })
  const startMatch = capture.start.match(/^circle\(([\d.]+)px at ([\d.]+)px ([\d.]+)px\)$/)
  const endMatch = capture.end.match(/^circle\(([\d.]+)px at ([\d.]+)px ([\d.]+)px\)$/)
  expect(startMatch).not.toBeNull()
  expect(endMatch).not.toBeNull()

  const expectedX = boundsBefore!.x + boundsBefore!.width / 2
  const expectedY = boundsBefore!.y + boundsBefore!.height / 2
  const actualX = Number(endMatch![2])
  const actualY = Number(endMatch![3])
  const actualRadius = Number(endMatch![1])
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  const expectedRadius = Math.hypot(
    Math.max(expectedX, viewport!.width - expectedX),
    Math.max(expectedY, viewport!.height - expectedY)
  )
  expect(Number(startMatch![1])).toBe(0)
  expect(Math.abs(Number(startMatch![2]) - expectedX)).toBeLessThanOrEqual(1)
  expect(Math.abs(Number(startMatch![3]) - expectedY)).toBeLessThanOrEqual(1)
  expect(Math.abs(actualX - expectedX)).toBeLessThanOrEqual(1)
  expect(Math.abs(actualY - expectedY)).toBeLessThanOrEqual(1)
  expect(actualRadius).toBeGreaterThanOrEqual(expectedRadius - 1)
  expect(capture).toMatchObject({
    duration: 900,
    easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    pseudoElement: '::view-transition-new(root)'
  })

  const boundsDuring = await themeButton.boundingBox()
  expect(boundsDuring).not.toBeNull()
  expect(Math.abs(boundsDuring!.x - boundsBefore!.x)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(boundsDuring!.y - boundsBefore!.y)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(boundsDuring!.width - boundsBefore!.width)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(boundsDuring!.height - boundsBefore!.height)).toBeLessThanOrEqual(0.01)

  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach(`theme-reveal-midpoint-${testInfo.project.name}`, {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }

  await page.evaluate(() => {
    (window as ThemeRevealWindow).__careerThemeReveal?.animation.play()
  })
  await expect(root).not.toHaveAttribute('data-theme-transition', 'running', { timeout: 3_000 })
  await expect(themeButton).toBeFocused()
})

test('theme switching falls back cleanly for reduced motion and unsupported browsers', async ({ page }) => {
  const root = page.locator('html')
  const themeButton = page.locator('.top-actions md-icon-button').first()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => {
    const original = document.startViewTransition?.bind(document)
    ;(window as ThemeRevealWindow).__careerViewTransitionCalls = 0
    if (!original) return
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: ViewTransitionUpdateCallback) => {
        const target = window as ThemeRevealWindow
        target.__careerViewTransitionCalls = (target.__careerViewTransitionCalls || 0) + 1
        return original(callback)
      }
    })
  })
  const reducedThemeBefore = await root.getAttribute('data-theme-mode')
  await themeButton.click()
  await expect.poll(() => root.getAttribute('data-theme-mode')).not.toBe(reducedThemeBefore)
  expect(await page.evaluate(() => (window as ThemeRevealWindow).__careerViewTransitionCalls)).toBe(0)
  await expect(root).not.toHaveAttribute('data-theme-transition')

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined
    })
  })
  const fallbackThemeBefore = await root.getAttribute('data-theme-mode')
  await themeButton.click()
  await expect.poll(() => root.getAttribute('data-theme-mode')).not.toBe(fallbackThemeBefore)
  await expect(root).not.toHaveAttribute('data-theme-transition')
})

test('品牌、账户信息和按钮图标保持水平居中', async ({ page }, testInfo) => {
  const expectCenteredContent = async (selector: string, expectedChildren: number) => {
    const metrics = await page.locator(selector).evaluate((element) => {
      const label = element.querySelector<HTMLElement>('.m3-button__label')
      if (!label) return null
      const labelRect = label.getBoundingClientRect()
      const center = labelRect.top + labelRect.height / 2
      const visibleChildren = Array.from(label.children).filter((child) => {
        const rect = child.getBoundingClientRect()
        return getComputedStyle(child).display !== 'none' && rect.width > 0 && rect.height > 0
      })
      return {
        display: getComputedStyle(label).display,
        alignItems: getComputedStyle(label).alignItems,
        offsets: visibleChildren.map((child) => {
          const rect = child.getBoundingClientRect()
          return Math.abs(rect.top + rect.height / 2 - center)
        })
      }
    })

    expect(metrics).not.toBeNull()
    expect(metrics?.display).toBe('inline-flex')
    expect(metrics?.alignItems).toBe('center')
    expect(metrics?.offsets).toHaveLength(expectedChildren)
    expect(Math.max(...(metrics?.offsets || [0]))).toBeLessThanOrEqual(1)
  }

  await expectCenteredContent('md-text-button.brand', 1)
  const brandOffsets = await page.locator('.top-app-bar .brand-identity').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const center = bounds.top + bounds.height / 2
    return Array.from(element.children)
      .filter((child) => getComputedStyle(child).display !== 'none')
      .map((child) => {
        const childBounds = child.getBoundingClientRect()
        return Math.abs(childBounds.top + childBounds.height / 2 - center)
      })
  })
  expect(Math.max(...brandOffsets)).toBeLessThanOrEqual(1)
  await expectCenteredContent('md-text-button.user-profile', testInfo.project.name === 'chromium-360' ? 1 : 3)

  await page.goto('/decision-projects')
  await expect(page.getByRole('heading', { name: '决策项目' })).toBeVisible()
  await expectCenteredContent('md-filled-button:has-text("新建项目")', 1)

  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach('button-alignment', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }
})

test('route pages and explore tabs use tokenized MD3 motion without moving the app shell', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.locator('.dashboard-page')).toBeVisible()
  await page.addStyleTag({
    content: `:root {
      --md-sys-motion-duration-short2: 300ms;
      --md-sys-motion-duration-short4: 500ms;
      --md-sys-motion-duration-medium2: 700ms;
    }`
  })
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter)).toBe('stable')

  const isCompact = testInfo.project.name === 'chromium-360'
  const navbar = page.locator('.top-app-bar')
  const primaryNavigation = page.locator(isCompact ? '.navigation-bar' : '.navigation-rail')
  const exploreDestination = page.locator(
    `${isCompact ? '.bar-destination' : '.rail-destination'}[href="/explore"]`
  )
  const readShellGeometry = async () => Promise.all([navbar, primaryNavigation].map(async (locator) => {
    const bounds = await locator.boundingBox()
    if (!bounds) throw new Error('App shell element is not visible')
    return bounds
  }))
  const expectGeometryStable = (
    before: Awaited<ReturnType<typeof readShellGeometry>>,
    after: Awaited<ReturnType<typeof readShellGeometry>>
  ) => {
    for (let index = 0; index < before.length; index += 1) {
      expect(Math.abs(after[index]!.x - before[index]!.x)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(after[index]!.y - before[index]!.y)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(after[index]!.width - before[index]!.width)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(after[index]!.height - before[index]!.height)).toBeLessThanOrEqual(0.5)
    }
  }

  const shellBefore = await readShellGeometry()
  await page.locator('.main-layout').evaluate((element) => {
    element.setAttribute('data-motion-shell-sentinel', 'true')
  })
  await exploreDestination.click()
  await expect(page).toHaveURL(/\/explore$/)
  const explorePage = page.locator('.product-page').first()
  await expect(explorePage).toHaveClass(/m3-page-enter-active/)
  const routeMotion = await explorePage.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
      properties: style.transitionProperty
    }
  })
  expect(routeMotion.properties).toContain('opacity')
  expect(routeMotion.properties).toContain('transform')
  expect(routeMotion.duration.split(',').map((item) => item.trim())).toEqual(['0.5s', '0.5s'])
  expect(routeMotion.easing).toBe(
    'cubic-bezier(0.05, 0.7, 0.1, 1), cubic-bezier(0.05, 0.7, 0.1, 1)'
  )
  expect(await page.locator('.main-layout').getAttribute('data-motion-shell-sentinel')).toBe('true')
  expectGeometryStable(shellBefore, await readShellGeometry())
  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach(`route-page-motion-${testInfo.project.name}`, {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }
  await expect(explorePage).not.toHaveClass(/m3-page-enter-active/, { timeout: 2_000 })

  const stableElements = [
    page.locator('.product-header'),
    page.locator('.explore-tabs'),
    page.locator('.search-row')
  ]
  const stableBefore = await Promise.all(stableElements.map(async (locator) => {
    const bounds = await locator.boundingBox()
    if (!bounds) throw new Error('Stable explore element is not visible')
    return bounds
  }))
  await explorePage.evaluate((element) => {
    element.setAttribute('data-motion-page-sentinel', 'true')
  })

  const directionsView = page.locator('[data-explore-view="directions"]')
  await page.getByRole('tab', { name: '招聘岗位' }).click()
  await expect(directionsView).toHaveClass(/explore-fade-through-leave-active/)
  const leaveMotion = await directionsView.evaluate((element) => {
    const style = getComputedStyle(element)
    return { duration: style.animationDuration, easing: style.animationTimingFunction }
  })
  expect(leaveMotion).toEqual({
    duration: '0.3s',
    easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)'
  })

  const jobsView = page.locator('[data-explore-view="jobs"]')
  await expect(jobsView).toBeVisible()
  await expect(jobsView).toHaveClass(/explore-fade-through-enter-active/)
  await expect(page).toHaveURL(/\/explore\?tab=jobs$/)
  const enterMotion = await jobsView.evaluate((element) => {
    const style = getComputedStyle(element)
    const groups = Array.from(element.querySelectorAll<HTMLElement>('.explore-motion-group'))
    return {
      duration: style.animationDuration,
      easing: style.animationTimingFunction,
      groupDurations: groups.map((group) => getComputedStyle(group).animationDuration),
      groupDelays: groups.map((group) => getComputedStyle(group).animationDelay)
    }
  })
  expect(enterMotion).toMatchObject({
    duration: '0.7s',
    easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    groupDurations: ['0.5s', '0.5s'],
    groupDelays: ['0s', '0.04s']
  })
  expect(await explorePage.getAttribute('data-motion-page-sentinel')).toBe('true')

  const stableAfter = await Promise.all(stableElements.map(async (locator) => {
    const bounds = await locator.boundingBox()
    if (!bounds) throw new Error('Stable explore element disappeared')
    return bounds
  }))
  expectGeometryStable(stableBefore, stableAfter)
  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach(`explore-fade-through-${testInfo.project.name}`, {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }
  await expect(jobsView).not.toHaveClass(/explore-fade-through-enter-active/, { timeout: 2_000 })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('tab', { name: '职业方向' }).click()
  await expect(page.locator('[data-explore-view="directions"]')).toBeVisible()
  const reducedMotion = await page.locator('[data-explore-view="directions"]').evaluate((element) => {
    const style = getComputedStyle(element)
    return { animationName: style.animationName, transform: style.transform }
  })
  expect(reducedMotion).toEqual({ animationName: 'none', transform: 'none' })
  expect(await explorePage.getAttribute('data-motion-page-sentinel')).toBe('true')
})

test('导航磁吸只移动自定义光标并尊重设备动态偏好', async ({ page }, testInfo) => {
  const isCompact = testInfo.project.name === 'chromium-360'
  const destination = page.locator(`${isCompact ? '.bar-destination' : '.rail-destination'}[href="/explore"]`)
  const cursor = page.locator('.navigation-magnetic-cursor')
  const freePointerTarget = page.locator('.product-header h1')
  const bounds = await destination.boundingBox()
  expect(bounds).not.toBeNull()

  const readGeometry = () => destination.evaluate((element) =>
    [element, ...element.querySelectorAll<HTMLElement>('*')].map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        node: node.tagName,
        className: node.getAttribute('class') || '',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    })
  )
  const expectGeometryUnchanged = async (before: Awaited<ReturnType<typeof readGeometry>>) => {
    const after = await readGeometry()
    expect(after).toHaveLength(before.length)
    for (let index = 0; index < before.length; index += 1) {
      expect(after[index].node).toBe(before[index].node)
      expect(after[index].className).toBe(before[index].className)
      expect(Math.abs(after[index].x - before[index].x)).toBeLessThanOrEqual(0.01)
      expect(Math.abs(after[index].y - before[index].y)).toBeLessThanOrEqual(0.01)
      expect(Math.abs(after[index].width - before[index].width)).toBeLessThanOrEqual(0.01)
      expect(Math.abs(after[index].height - before[index].height)).toBeLessThanOrEqual(0.01)
    }
  }
  const expectCursorGeometry = async (expected: { x: number; y: number; width: number; height: number }) => {
    await expect.poll(async () => {
      const cursorBounds = await cursor.boundingBox()
      if (!cursorBounds) return Number.POSITIVE_INFINITY
      return Math.max(
        Math.abs(cursorBounds.x + cursorBounds.width / 2 - expected.x),
        Math.abs(cursorBounds.y + cursorBounds.height / 2 - expected.y),
        Math.abs(cursorBounds.width - expected.width),
        Math.abs(cursorBounds.height - expected.height)
      )
    }).toBeLessThanOrEqual(1)
  }
  const waitForPaint = () => page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))

  const geometryBefore = await readGeometry()
  const supportsMagnetic = await page.evaluate(() =>
    matchMedia('(min-width: 600px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches
  )
  expect(supportsMagnetic).toBe(!isCompact)

  if (isCompact) {
    await expect(cursor).toHaveAttribute('data-enabled', 'false')
    await page.mouse.move(bounds!.x + bounds!.width * 0.82, bounds!.y + bounds!.height * 0.24)
    await waitForPaint()
    await expect(cursor).toBeHidden()
    await expect(destination).not.toHaveAttribute('data-magnetic-active', 'true')
    expect(await destination.evaluate((element) => getComputedStyle(element).cursor)).not.toBe('none')
    await expectGeometryUnchanged(geometryBefore)
    await destination.click()
    await expect(page).toHaveURL(/\/explore$/)
    await expect(page.locator('.product-header h1')).toBeVisible()
    return
  }

  await expect(cursor).toHaveAttribute('data-enabled', 'true')

  const freePointerBounds = await freePointerTarget.evaluate((element) => {
    const textRange = document.createRange()
    textRange.selectNodeContents(element)
    const rect = textRange.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  expect(freePointerBounds.width).toBeGreaterThan(0)
  const freePointer = {
    x: freePointerBounds.x + freePointerBounds.width / 2,
    y: freePointerBounds.y + freePointerBounds.height / 2
  }
  await page.mouse.move(freePointer.x, freePointer.y)
  await expect(cursor).toBeVisible()
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'false')
  await expect(cursor).toHaveCSS('pointer-events', 'none')
  await expect(cursor).toHaveCSS('mix-blend-mode', 'difference')
  const freeCursorStyle = await cursor.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      borderWidth: Number.parseFloat(style.borderTopWidth),
      transitionProperty: style.transitionProperty
    }
  })
  expect(freeCursorStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(freeCursorStyle.backgroundColor).not.toBe('transparent')
  expect(freeCursorStyle.borderRadius).toBeGreaterThanOrEqual(13)
  expect(freeCursorStyle.borderWidth).toBe(0)
  expect(freeCursorStyle.transitionProperty).not.toContain('transform')
  expect(await destination.evaluate((element) => getComputedStyle(element).cursor)).toBe('none')
  await expectCursorGeometry({ ...freePointer, width: 26, height: 26 })

  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach('magnetic-cursor-text-inversion', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }

  const outsideAttractionPoint = {
    x: bounds!.x + bounds!.width + 24,
    y: bounds!.y + bounds!.height / 2
  }
  await page.mouse.move(outsideAttractionPoint.x, outsideAttractionPoint.y)
  await expect(destination).not.toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'false')
  await expectCursorGeometry({ ...outsideAttractionPoint, width: 26, height: 26 })

  await page.mouse.move(bounds!.x + bounds!.width + 12, bounds!.y + bounds!.height / 2)
  await expect(destination).toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveCSS('opacity', '1')
  await expectCursorGeometry({
    x: bounds!.x + bounds!.width / 2,
    y: bounds!.y + bounds!.height / 2,
    width: bounds!.width,
    height: bounds!.height
  })
  await waitForPaint()
  await expectGeometryUnchanged(geometryBefore)

  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach('navigation-magnetic-cursor', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }

  await page.mouse.move(freePointer.x, freePointer.y)
  await expect(destination).not.toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'false')
  await expect(cursor).toHaveAttribute('data-magnetic-releasing', 'false')
  await expectCursorGeometry({ ...freePointer, width: 26, height: 26 })
  await waitForPaint()
  await expectGeometryUnchanged(geometryBefore)

  const automaticButton = page.locator('.product-header md-text-button').first()
  const automaticButtonBounds = await automaticButton.boundingBox()
  expect(automaticButtonBounds).not.toBeNull()
  await page.mouse.move(
    automaticButtonBounds!.x + automaticButtonBounds!.width / 2,
    automaticButtonBounds!.y + automaticButtonBounds!.height / 2
  )
  await expect(automaticButton).toHaveAttribute('data-magnetic-active', 'true')
  await expectCursorGeometry({
    x: automaticButtonBounds!.x + automaticButtonBounds!.width / 2,
    y: automaticButtonBounds!.y + automaticButtonBounds!.height / 2,
    width: automaticButtonBounds!.width,
    height: automaticButtonBounds!.height
  })

  await page.mouse.move(freePointer.x, freePointer.y)
  await expect(automaticButton).not.toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-releasing', 'false')
  await expectCursorGeometry({ ...freePointer, width: 26, height: 26 })

  const precisionControl = page.getByRole('slider', { name: '主题对比度' })
  const precisionControlBounds = await precisionControl.boundingBox()
  expect(precisionControlBounds).not.toBeNull()
  await page.mouse.move(
    precisionControlBounds!.x + precisionControlBounds!.width / 2,
    precisionControlBounds!.y + precisionControlBounds!.height / 2
  )
  await expect(cursor).toBeHidden()
  await expect(page.locator('html')).not.toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
  expect(await precisionControl.evaluate((element) => getComputedStyle(element).cursor)).not.toBe('none')

  await destination.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(destination).toBeFocused()
  const focusState = await destination.evaluate((element) => ({
    focusVisible: element.matches(':focus-visible'),
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: Number.parseFloat(getComputedStyle(element).outlineWidth)
  }))
  expect(focusState.focusVisible).toBe(true)
  expect(focusState.outlineStyle).not.toBe('none')
  expect(focusState.outlineWidth).toBeGreaterThan(0)
  await expect(cursor).toBeHidden()
  await expect(destination).not.toHaveAttribute('data-magnetic-active', 'true')

  await page.mouse.move(freePointer.x, freePointer.y)
  await expect(destination).not.toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'false')
  await expectCursorGeometry({ ...freePointer, width: 26, height: 26 })
  await waitForPaint()
  await expectGeometryUnchanged(geometryBefore)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(cursor).toHaveAttribute('data-enabled', 'false')
  await expect(cursor).toBeHidden()
  await page.mouse.move(bounds!.x + bounds!.width * 0.82, bounds!.y + bounds!.height * 0.24)
  await expect(destination).not.toHaveAttribute('data-magnetic-active', 'true')
  expect(await destination.evaluate((element) => getComputedStyle(element).cursor)).not.toBe('none')
  await waitForPaint()
  await expectGeometryUnchanged(geometryBefore)

  await destination.click()
  await expect(page).toHaveURL(/\/explore$/)
  await expect(page.locator('.product-header h1')).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(cursor).toHaveAttribute('data-enabled', 'true')
  const nextDestination = page.locator('.rail-destination[href="/decision-projects"]')
  const nextBounds = await nextDestination.boundingBox()
  expect(nextBounds).not.toBeNull()
  const nextAttractionPoint = {
    x: nextBounds!.x + nextBounds!.width + 8,
    y: nextBounds!.y + nextBounds!.height / 2
  }
  await page.mouse.move(nextAttractionPoint.x, nextAttractionPoint.y)
  await expect(nextDestination).toHaveAttribute('data-magnetic-active', 'true')
  await page.mouse.click(nextAttractionPoint.x, nextAttractionPoint.y)
  await expect(page).toHaveURL(/\/decision-projects$/)
  await expect(cursor).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
})

test('大尺寸磁吸按钮点击时不播放扩散回弹动画', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-360', '移动端使用原生光标')

  await page.evaluate(() => {
    const button = document.createElement('md-filled-button')
    button.id = 'large-magnetic-button-fixture'
    button.textContent = '大尺寸磁吸操作'
    button.style.cssText = [
      'position:fixed',
      'z-index:1500',
      'left:240px',
      'top:170px',
      'width:min(360px, calc(100vw - 280px))',
      '--md-filled-button-container-height:96px'
    ].join(';')
    button.dataset.clickCount = '0'
    button.addEventListener('click', () => {
      button.dataset.clickCount = String(Number(button.dataset.clickCount || 0) + 1)
    })
    document.body.append(button)
  })

  const button = page.locator('#large-magnetic-button-fixture')
  const cursor = page.locator('.navigation-magnetic-cursor')
  const boundsBefore = await button.boundingBox()
  expect(boundsBefore).not.toBeNull()
  expect(boundsBefore!.height).toBeGreaterThanOrEqual(90)

  const center = {
    x: boundsBefore!.x + boundsBefore!.width / 2,
    y: boundsBefore!.y + boundsBefore!.height / 2
  }
  await page.mouse.move(center.x, center.y)
  await expect(button).toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'true')
  await expect.poll(async () => {
    const cursorBounds = await cursor.boundingBox()
    if (!cursorBounds) return Number.POSITIVE_INFINITY
    return Math.max(
      Math.abs(cursorBounds.x - boundsBefore!.x),
      Math.abs(cursorBounds.y - boundsBefore!.y),
      Math.abs(cursorBounds.width - boundsBefore!.width),
      Math.abs(cursorBounds.height - boundsBefore!.height)
    )
  }).toBeLessThanOrEqual(1)

  const rippleBefore = await button.evaluate((element) => {
    const ripple = element.shadowRoot?.querySelector<HTMLElement>('md-ripple')
    return ripple
      ? Number.parseFloat(getComputedStyle(ripple).getPropertyValue('--md-ripple-pressed-opacity'))
      : null
  })
  expect(rippleBefore).toBe(0)

  const cursorBefore = await cursor.boundingBox()
  expect(cursorBefore).not.toBeNull()
  await page.mouse.down()
  await page.waitForTimeout(140)

  const pressedVisual = await button.evaluate((element) => {
    const ripple = element.shadowRoot?.querySelector<HTMLElement>('md-ripple')
    const surface = ripple?.shadowRoot?.querySelector<HTMLElement>('.surface')
    const bounds = element.getBoundingClientRect()
    return {
      afterOpacity: surface ? Number.parseFloat(getComputedStyle(surface, '::after').opacity) : null,
      height: bounds.height,
      transform: getComputedStyle(element).transform,
      width: bounds.width,
      x: bounds.x,
      y: bounds.y
    }
  })
  const cursorPressed = await cursor.boundingBox()
  expect(pressedVisual.afterOpacity).toBe(0)
  expect(pressedVisual.transform).toBe('none')
  expect(Math.abs(pressedVisual.x - boundsBefore!.x)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(pressedVisual.y - boundsBefore!.y)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(pressedVisual.width - boundsBefore!.width)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(pressedVisual.height - boundsBefore!.height)).toBeLessThanOrEqual(0.01)
  expect(cursorPressed).not.toBeNull()
  expect(Math.abs(cursorPressed!.x - cursorBefore!.x)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(cursorPressed!.y - cursorBefore!.y)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(cursorPressed!.width - cursorBefore!.width)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(cursorPressed!.height - cursorBefore!.height)).toBeLessThanOrEqual(0.01)

  await page.mouse.up()
  await expect(button).toHaveAttribute('data-click-count', '1')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'true')
})

test('磁吸点击保持目标可用且不会闪回系统光标', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-360', '移动端使用原生光标')

  const cursor = page.locator('.navigation-magnetic-cursor')
  const root = page.locator('html')
  const startContinuityObservation = () => page.evaluate(() => {
    const cursorElement = document.querySelector<HTMLElement>('.navigation-magnetic-cursor')
    if (!cursorElement) throw new Error('Magnetic cursor is missing')
    const changes: string[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (!record.attributeName) continue
        const target = record.target as Element
        changes.push(`${record.attributeName}:${record.oldValue}->${target.getAttribute(record.attributeName)}`)
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-navigation-magnetic-cursor-visible']
    })
    observer.observe(cursorElement, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-visible']
    })
    ;(window as CursorContinuityWindow).__careerCursorContinuity = { observer, changes }
  })
  const stopContinuityObservation = () => page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const state = (window as CursorContinuityWindow).__careerCursorContinuity
    if (!state) return ['continuity-observer-missing']
    state.observer.disconnect()
    delete (window as CursorContinuityWindow).__careerCursorContinuity
    return state.changes
  })

  await page.evaluate(() => {
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function (
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions
    ) {
      const animation = originalAnimate.call(this, keyframes, options)
      const animationOptions = typeof options === 'number' ? { duration: options } : options
      if (animationOptions?.pseudoElement !== '::view-transition-new(root)' || !keyframes || Array.isArray(keyframes)) {
        return animation
      }

      const clipPath = keyframes.clipPath
      const values = Array.isArray(clipPath) ? clipPath.map(String) : [String(clipPath)]
      const duration = Number(animationOptions.duration)
      animation.pause()
      animation.currentTime = duration * 0.45
      ;(window as ThemeRevealWindow).__careerThemeReveal = {
        animation,
        duration,
        easing: String(animationOptions.easing),
        end: values[1] || '',
        pseudoElement: animationOptions.pseudoElement,
        start: values[0] || ''
      }
      return animation
    }
  })

  const themeButton = page.locator('.top-actions md-icon-button').first()
  const themeBounds = await themeButton.boundingBox()
  expect(themeBounds).not.toBeNull()
  const themePoint = {
    x: themeBounds!.x + themeBounds!.width / 2,
    y: themeBounds!.y + themeBounds!.height / 2
  }
  await page.mouse.move(themePoint.x, themePoint.y)
  await expect(themeButton).toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toBeVisible()
  expect(await themeButton.evaluate((element) => {
    const control = element.shadowRoot?.querySelector<HTMLElement>('.icon-button')
    return control ? getComputedStyle(control).cursor : null
  })).toBe('none')

  const previousTheme = await root.getAttribute('data-theme-mode')
  await startContinuityObservation()
  await page.mouse.click(themePoint.x, themePoint.y)
  await expect.poll(() => root.getAttribute('data-theme-mode')).not.toBe(previousTheme)
  await expect(root).toHaveAttribute('data-theme-transition', 'running')
  await expect(root).toHaveAttribute('data-theme-transition-cursor', 'custom')
  await expect.poll(() => page.evaluate(() => Boolean(
    (window as ThemeRevealWindow).__careerThemeReveal
  ))).toBe(true)
  await expect(cursor).toBeVisible()
  await expect(root).toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
  expect(await themeButton.evaluate((element) => {
    const control = element.shadowRoot?.querySelector<HTMLElement>('.icon-button')
    return control ? getComputedStyle(control).cursor : null
  })).toBe('none')

  const transitionAccountTrigger = page.locator('md-text-button.user-profile')
  const transitionAccountBounds = await transitionAccountTrigger.boundingBox()
  expect(transitionAccountBounds).not.toBeNull()
  await page.mouse.move(
    transitionAccountBounds!.x + transitionAccountBounds!.width / 2,
    transitionAccountBounds!.y + transitionAccountBounds!.height / 2
  )
  await expect(transitionAccountTrigger).toHaveAttribute('data-magnetic-active', 'true')
  const cursorLock = await page.evaluate(() => {
    const rootElement = document.documentElement
    const account = document.querySelector<HTMLElement>('md-text-button.user-profile')
    const control = account?.shadowRoot?.querySelector<HTMLElement>('.button')
    return {
      account: account ? getComputedStyle(account).cursor : null,
      body: getComputedStyle(document.body).cursor,
      html: getComputedStyle(rootElement).cursor,
      shadowControl: control ? getComputedStyle(control).cursor : null,
      shadowLockCount: account?.shadowRoot?.querySelectorAll(
        'style[data-career-theme-cursor-lock="true"]'
      ).length ?? 0,
      viewTransition: getComputedStyle(rootElement, '::view-transition').cursor,
      viewTransitionNew: getComputedStyle(rootElement, '::view-transition-new(root)').cursor,
      viewTransitionOld: getComputedStyle(rootElement, '::view-transition-old(root)').cursor
    }
  })
  expect(cursorLock).toMatchObject({
    account: 'none',
    body: 'none',
    html: 'none',
    shadowControl: 'none',
    viewTransition: 'none',
    viewTransitionNew: 'none',
    viewTransitionOld: 'none'
  })
  expect(cursorLock.shadowLockCount).toBeGreaterThan(0)

  await page.evaluate(() => {
    (window as ThemeRevealWindow).__careerThemeReveal?.animation.play()
  })
  await expect(root).not.toHaveAttribute('data-theme-transition', 'running', { timeout: 3_000 })
  expect(await transitionAccountTrigger.evaluate((element) =>
    element.shadowRoot?.querySelectorAll('style[data-career-theme-cursor-lock="true"]').length ?? 0
  )).toBe(0)
  expect(await stopContinuityObservation()).toEqual([])

  const accountTrigger = page.locator('md-text-button.user-profile')
  const accountBounds = await accountTrigger.boundingBox()
  expect(accountBounds).not.toBeNull()
  const accountPoint = {
    x: accountBounds!.x + accountBounds!.width / 2,
    y: accountBounds!.y + accountBounds!.height + 2
  }
  expect(accountPoint.y).toBeGreaterThan(accountBounds!.y + accountBounds!.height)
  expect(accountPoint.y).toBeLessThan(64)
  await page.mouse.move(accountPoint.x, accountPoint.y)
  await expect(accountTrigger).toHaveAttribute('data-magnetic-active', 'true')

  await startContinuityObservation()
  await page.mouse.click(accountPoint.x, accountPoint.y)
  await expect(accountTrigger).toHaveAttribute('data-aria-expanded', 'true')
  const accountMenu = page.locator('.account-menu')
  await expect(accountMenu).toBeVisible()
  const firstMenuItem = accountMenu.locator('md-menu-item').first()
  await expect(firstMenuItem).toBeFocused()
  await expect(cursor).toBeVisible()
  await expect(root).toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
  expect(await accountTrigger.evaluate((element) => {
    const control = element.shadowRoot?.querySelector<HTMLElement>('.button')
    return control ? getComputedStyle(control).cursor : null
  })).toBe('none')

  const firstMenuItemBounds = await firstMenuItem.boundingBox()
  expect(firstMenuItemBounds).not.toBeNull()
  await page.mouse.move(
    firstMenuItemBounds!.x + firstMenuItemBounds!.width / 2,
    firstMenuItemBounds!.y + firstMenuItemBounds!.height / 2
  )
  await expect(firstMenuItem).toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'true')
  const menuItemCursor = await firstMenuItem.evaluate((element) => {
    const interactive = element.shadowRoot?.querySelector<HTMLElement>('.list-item')
    return {
      cursor: interactive ? getComputedStyle(interactive).cursor : null,
      injectedStyles: element.shadowRoot?.querySelectorAll(
        'style[data-career-magnetic-cursor="true"]'
      ).length ?? 0
    }
  })
  expect(menuItemCursor.cursor).toBe('none')
  expect(menuItemCursor.injectedStyles).toBeGreaterThan(0)
  expect(await stopContinuityObservation()).toEqual([])
})

test('AI 助手保持在磁吸光标下方且示例问题可以完整滚动', async ({ page }, testInfo) => {
  const isCompact = testInfo.project.name === 'chromium-360'
  const cursor = page.locator('.navigation-magnetic-cursor')
  const mentorFab = page.locator('md-fab.mentor-fab')
  const fabBounds = await mentorFab.boundingBox()
  expect(fabBounds).not.toBeNull()

  if (!isCompact) {
    await page.mouse.move(
      fabBounds!.x + fabBounds!.width / 2,
      fabBounds!.y + fabBounds!.height / 2
    )
    await expect(mentorFab).toHaveAttribute('data-magnetic-active', 'true')
    await expect(cursor).toBeVisible()
    expect(await cursor.evaluate((element) => element.parentElement === document.body)).toBe(true)
    const fabLayering = await page.evaluate(() => ({
      cursor: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('.navigation-magnetic-cursor')!).zIndex, 10),
      fab: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('md-fab.mentor-fab')!).zIndex, 10)
    }))
    expect(fabLayering.cursor).toBeGreaterThan(fabLayering.fab)
  }

  await page.getByRole('button', { name: '打开 AI 导师' }).click()
  const mentorPanel = page.getByRole('region', { name: 'AI 导师' })
  const questions = page.getByRole('group', { name: '示例问题' })
  const lastQuestion = questions
    .locator('md-text-button')
    .filter({ hasText: '怎样避免盲目选择？' })
  await expect(mentorPanel).toBeVisible()
  await expect(questions).toBeVisible()
  await expect(mentorPanel.locator('.mentor-title [data-assistant-state="default"]')).toBeVisible()

  await page.getByLabel('向 AI 导师提问').focus()
  await expect(page.getByLabel('向 AI 导师提问')).toBeFocused()
  await expect(mentorPanel.locator('.mentor-title [data-assistant-state="listening"]')).toBeVisible()
  const footerSpacing = await page.evaluate(() => {
    const questionsElement = document.querySelector<HTMLElement>('.quick-questions')
    const textAreaElement = document.querySelector<HTMLElement>('.mentor-input-field')
    if (!questionsElement || !textAreaElement) return null
    const questionsBounds = questionsElement.getBoundingClientRect()
    const textAreaBounds = textAreaElement.getBoundingClientRect()
    return textAreaBounds.top - questionsBounds.bottom
  })
  expect(footerSpacing).not.toBeNull()
  expect(footerSpacing).toBeGreaterThanOrEqual(4)

  const initialOverflow = await questions.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    scrollLeft: element.scrollLeft
  }))
  expect(initialOverflow.scrollWidth).toBeGreaterThan(initialOverflow.clientWidth)
  expect(initialOverflow.scrollLeft).toBe(0)

  await questions.hover()
  await page.mouse.wheel(0, 600)
  await expect.poll(() => questions.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await questions.evaluate((element) => { element.scrollLeft = element.scrollWidth })
  await expect.poll(() => questions.evaluate((element) =>
    Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth))
  )).toBeLessThanOrEqual(1)

  const finalVisibility = await lastQuestion.evaluate((element) => {
    const container = element.closest<HTMLElement>('.quick-questions')!
    const containerBounds = container.getBoundingClientRect()
    const targetBounds = element.getBoundingClientRect()
    const label = element.querySelector<HTMLElement>('.m3-button__label')
    return {
      containerLeft: containerBounds.left,
      containerRight: containerBounds.right,
      targetLeft: targetBounds.left,
      targetRight: targetBounds.right,
      labelClientWidth: label?.clientWidth ?? 0,
      labelScrollWidth: label?.scrollWidth ?? 0
    }
  })
  expect(finalVisibility.targetLeft).toBeGreaterThanOrEqual(finalVisibility.containerLeft - 1)
  expect(finalVisibility.targetRight).toBeLessThanOrEqual(finalVisibility.containerRight + 1)
  expect(finalVisibility.labelScrollWidth).toBeLessThanOrEqual(finalVisibility.labelClientWidth + 1)

  if (!isCompact) {
    const targetBounds = await lastQuestion.boundingBox()
    expect(targetBounds).not.toBeNull()
    await page.mouse.move(
      targetBounds!.x + targetBounds!.width / 2,
      targetBounds!.y + targetBounds!.height / 2
    )
    await expect(lastQuestion).toHaveAttribute('data-magnetic-active', 'true')
    await expect(cursor).toHaveAttribute('data-magnetic-active', 'true')
    await expect.poll(async () => {
      const cursorBounds = await cursor.boundingBox()
      if (!cursorBounds) return Number.POSITIVE_INFINITY
      return Math.max(
        Math.abs(cursorBounds.x - targetBounds!.x),
        Math.abs(cursorBounds.y - targetBounds!.y),
        Math.abs(cursorBounds.width - targetBounds!.width),
        Math.abs(cursorBounds.height - targetBounds!.height)
      )
    }).toBeLessThanOrEqual(1)
    await expect(page.locator('body')).toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
    expect(await lastQuestion.evaluate((element) => {
      const control = element.shadowRoot?.querySelector<HTMLElement>('.button')
      return control ? getComputedStyle(control).cursor : null
    })).toBe('none')
    const panelLayering = await page.evaluate(() => ({
      cursor: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('.navigation-magnetic-cursor')!).zIndex, 10),
      panel: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('.mentor-panel')!).zIndex, 10)
    }))
    expect(panelLayering.cursor).toBeGreaterThan(panelLayering.panel)
  }

  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach('ai-assistant-magnetic-cursor', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }
})

test('青穗集品牌资源在登录页和导航栏按视口正确呈现', async ({ page }, testInfo) => {
  await page.goto('/login')
  await expect(page).toHaveTitle('青穗集 · 职业决策与行动')
  const wordmark = page.locator('.auth-brand img[alt="青穗集"]')
  await expect(wordmark).toBeVisible()
  await expect.poll(() => wordmark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)

  const showcase = page.getByRole('complementary', { name: '青穗集品牌介绍' })
  if ((page.viewportSize()?.width ?? 0) > 820) {
    await expect(showcase).toBeVisible()
    await expect(showcase.locator('img')).toHaveAttribute('alt', '青穗集与 AI 导师穗奈')
  } else {
    await expect(showcase).toBeHidden()
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

  await page.goto('/settings')
  await expect(page.locator('.top-app-bar img[alt="青穗集"]')).toBeVisible()
})

test('AI 助手区分模型身份直接回答与可展开教练建议', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '打开 AI 导师' }).click()
  const input = page.getByLabel('向 AI 导师提问')
  const sendButton = page.getByRole('button', { name: '发送' })

  await input.fill('你是什么模型？')
  await sendButton.click()

  const directResponse = page.locator('[data-response-mode="direct"]').filter({
    hasText: '具体底层模型由当前服务配置决定'
  }).last()
  await expect(directResponse).toBeVisible()
  const directMeta = directResponse.locator('.response-meta')
  await expect(directMeta).toHaveAttribute('data-used-personal-context', 'false')
  await expect(directMeta).toContainText('规则建议')
  await expect(directMeta).toContainText('未使用个人上下文')
  await expect(directResponse).not.toContainText('e2e-unverified-provider-model')
  await expect(directResponse.locator('.response-confidence')).toHaveCount(0)
  await expect(directResponse.locator('.coaching-details')).toHaveCount(0)
  await expect(directResponse.locator('.next-step')).toHaveCount(0)
  await expect(directResponse.locator('.response-actions')).toHaveCount(0)

  await input.fill('请基于我的档案给出职业决策建议')
  await sendButton.click()

  const coachingResponse = page.locator('[data-response-mode="coaching"]').filter({
    hasText: '先明确目标岗位'
  }).last()
  const coachingMeta = coachingResponse.locator('.response-meta')
  const coachingDetails = coachingResponse.locator('details.coaching-details')
  const detailsTrigger = coachingDetails.locator('summary')
  await expect(coachingResponse).toBeVisible()
  await expect(coachingMeta).toHaveAttribute('data-used-personal-context', 'true')
  await expect(coachingMeta).toContainText('模型生成')
  await expect(coachingMeta).toContainText('已结合个人上下文')
  await expect(coachingResponse.locator('.response-confidence')).toHaveCount(0)
  await expect(coachingResponse.locator('.next-step')).toContainText('完善目标岗位，并补充一条课程项目证据。')
  await expect(coachingResponse.getByRole('button', { name: '完善个人档案' })).toBeVisible()
  await expect(detailsTrigger).toContainText('为什么这样回答')
  await expect(detailsTrigger).toContainText('依据 1 项 · 待确认 1 项')
  await expect(coachingDetails).not.toHaveAttribute('open', '')
  await expect(coachingResponse.getByText('档案显示尚未填写目标岗位。', { exact: true })).toBeHidden()
  await expect(coachingResponse.getByText('现有档案还不足以判断具体岗位匹配度。', { exact: true })).toBeHidden()

  await detailsTrigger.click()
  await expect(coachingDetails).toHaveAttribute('open', '')
  await expect(coachingResponse.getByText('档案显示尚未填写目标岗位。', { exact: true })).toBeVisible()
  await expect(coachingResponse.getByText('现有档案还不足以判断具体岗位匹配度。', { exact: true })).toBeVisible()

  await detailsTrigger.click()
  await expect(coachingDetails).not.toHaveAttribute('open', '')
  await expect(coachingResponse.getByText('档案显示尚未填写目标岗位。', { exact: true })).toBeHidden()

  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach('ai-assistant-response-modes', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }
})

test('职业方向分类条将滚轮输入转换为单一横向滚动', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-360', '触屏环境使用原生触控横向滚动')

  const directionCategories = [
    '技术研发', '数据分析', '产品设计', '人工智能', '网络安全', '云计算平台',
    '游戏开发', '智能硬件', '金融科技', '医疗科技', '科研工程', '数字内容'
  ]
  const directions = directionCategories.map((category, index) => ({
    id: 800 + index,
    code: `e2e-direction-${index}`,
    name: `${category}方向`,
    category,
    summary: `用于验证${category}分类条横向滚动。`,
    typicalWork: ['分析问题', '完成验证'],
    commonSkills: ['沟通', '分析'],
    growthPath: ['入门', '进阶'],
    misconceptions: ['只看职位名称'],
    majorTags: ['计算机类'],
    industryTags: [category],
    workTypes: ['协作'],
    custom: false,
    favorite: false,
    updatedAt: '2026-07-12T10:00:00'
  }))

  await page.route('**/api/v1/career-directions**', async (route) => {
    const selectedCategory = new URL(route.request().url()).searchParams.get('category')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: selectedCategory
          ? directions.filter((item) => item.category === selectedCategory)
          : directions,
        timestamp: Date.now(),
        traceId: 'e2e-direction-scroll'
      })
    })
  })

  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: '职业探索' })).toBeVisible()
  await page.addStyleTag({
    content: `:root {
      --md-sys-motion-duration-short4: 500ms;
      --md-sys-motion-duration-medium2: 700ms;
    }`
  })

  const readViewportGeometry = () => page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>('.main-layout')?.getBoundingClientRect()
    return {
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      layoutLeft: layout?.left ?? null,
      layoutWidth: layout?.width ?? null,
      scrollbarGutter: getComputedStyle(document.documentElement).scrollbarGutter
    }
  })
  const viewportBeforeFiltering = await readViewportGeometry()
  expect(viewportBeforeFiltering.scrollbarGutter).toBe('stable')

  const strip = page.getByRole('group', { name: '职业方向分类' })
  await expect(strip).toBeVisible()
  const initialState = await strip.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    scrollLeft: element.scrollLeft,
    overflowY: getComputedStyle(element).overflowY
  }))
  expect(initialState.scrollWidth).toBeGreaterThan(initialState.clientWidth)
  expect(initialState.scrollLeft).toBe(0)
  expect(initialState.overflowY).toBe('hidden')

  const cursor = page.locator('.navigation-magnetic-cursor')
  await expect(cursor).toHaveAttribute('data-enabled', 'true')
  const firstCategory = strip.locator('md-filter-chip').nth(1)
  const firstCategoryButton = page.getByRole('button', { name: '技术研发', exact: true })
  const categoryBounds = await firstCategoryButton.boundingBox()
  expect(categoryBounds).not.toBeNull()
  await page.mouse.move(
    categoryBounds!.x + categoryBounds!.width / 2,
    categoryBounds!.y + categoryBounds!.height / 2
  )
  await expect(firstCategory).toHaveAttribute('data-magnetic-active', 'true')
  await expect(cursor).toHaveAttribute('data-magnetic-active', 'true')
  const pageScrollBefore = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 560)

  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(pageScrollBefore)

  await strip.evaluate((element) => { element.scrollLeft = 0 })
  const directionCards = page.locator('.direction-card')
  await expect(directionCards).toHaveCount(directionCategories.length)
  await page.getByRole('button', { name: '技术研发', exact: true }).click()
  await expect(page.getByRole('button', { name: '技术研发', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.direction-list-leave-active')).not.toHaveCount(0)
  await expect(page.locator('.direction-list-leave-active')).toHaveCount(0)
  await expect(directionCards).toHaveCount(1)
  expect(await readViewportGeometry()).toEqual(viewportBeforeFiltering)

  await page.getByRole('button', { name: '全部', exact: true }).click()
  await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.direction-card.direction-list-enter-active').first()).toBeVisible()
  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach(`direction-list-restoring-${testInfo.project.name}`, {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }
  await expect(page.locator('.direction-list-enter-active')).toHaveCount(0)
  await expect(directionCards).toHaveCount(directionCategories.length)
  expect(await readViewportGeometry()).toEqual(viewportBeforeFiltering)
  await expect(page.getByRole('button', { name: '数字内容', exact: true })).toBeAttached()
})

test('Web 背景真实可见、遮罩语义正确并可持久化', async ({ page }, testInfo) => {
  const waitForPaint = () => page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  const readBackgroundGutter = async () => {
    await page.evaluate(() => window.scrollTo(0, 0))
    await waitForPaint()
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('Viewport is unavailable')
    const image = await page.screenshot({
      clip: {
        x: viewport.width - 18,
        y: 80,
        width: 6,
        height: Math.min(440, viewport.height - 180)
      },
      scale: 'css'
    })
    return page.evaluate(async (source) => {
      const screenshot = new Image()
      await new Promise<void>((resolve, reject) => {
        screenshot.onload = () => resolve()
        screenshot.onerror = () => reject(new Error('Unable to decode screenshot'))
        screenshot.src = source
      })
      const canvas = document.createElement('canvas')
      canvas.width = screenshot.naturalWidth
      canvas.height = screenshot.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Unable to inspect screenshot pixels')
      context.drawImage(screenshot, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let red = 0
      let green = 0
      let blue = 0
      for (let index = 0; index < pixels.length; index += 4) {
        red += pixels[index] ?? 0
        green += pixels[index + 1] ?? 0
        blue += pixels[index + 2] ?? 0
      }
      const count = pixels.length / 4
      return {
        red: red / count,
        green: green / count,
        blue: blue / count,
        luminance: (red * 0.2126 + green * 0.7152 + blue * 0.0722) / count
      }
    }, `data:image/png;base64,${image.toString('base64')}`)
  }
  const averageColorDifference = (
    first: Awaited<ReturnType<typeof readBackgroundGutter>>,
    second: Awaited<ReturnType<typeof readBackgroundGutter>>
  ) => (
    Math.abs(first.red - second.red) +
    Math.abs(first.green - second.green) +
    Math.abs(first.blue - second.blue)
  ) / 3

  const backgroundInput = page.locator('input[type="file"][accept*="image/png"]')
  const colorfulPng = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to create test image')
    const swatches = ['#ff1744', '#00c853', '#2962ff', '#ffd600']
    swatches.forEach((color, index) => {
      context.fillStyle = color
      context.fillRect((index % 2) * 48, Math.floor(index / 2) * 48, 48, 48)
    })
    context.fillStyle = '#ffffff'
    context.fillRect(44, 0, 8, 96)
    context.fillStyle = '#111111'
    context.fillRect(0, 44, 96, 8)
    return canvas.toDataURL('image/png').split(',')[1] || ''
  })
  await backgroundInput.setInputFiles({
    name: 'color-quadrants.png',
    mimeType: 'image/png',
    buffer: Buffer.from(colorfulPng, 'base64')
  })

  await expect(page.getByText('当前 Web 背景')).toBeVisible()
  const appBackground = page.locator('.app-background')
  const backgroundScrim = page.locator('.app-background__scrim')
  await expect(appBackground).toBeVisible()
  const initialComposition = await appBackground.evaluate(async (element) => {
    const background = getComputedStyle(element)
    const pageLayer = document.querySelector<HTMLElement>('.app-content')
    const mainLayout = document.querySelector<HTMLElement>('.main-layout')
    const match = background.backgroundImage.match(/url\(["']?(blob:[^"')]+)["']?\)/)
    const source = match?.[1] || ''
    const image = new Image()
    if (source) {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Unable to load background blob URL'))
        image.src = source
      })
    }
    const colorAlpha = (color: string) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d')!
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return context.getImageData(0, 0, 1, 1).data[3]! / 255
    }
    const rect = element.getBoundingClientRect()
    const hitTarget = document.elementFromPoint(window.innerWidth - 18, 100)
    return {
      backgroundImage: background.backgroundImage,
      position: background.position,
      pointerEvents: background.pointerEvents,
      backgroundZIndex: Number.parseInt(background.zIndex, 10),
      pageLayerZIndex: Number.parseInt(getComputedStyle(pageLayer!).zIndex, 10),
      canvasAlpha: colorAlpha(getComputedStyle(mainLayout!).backgroundColor),
      width: rect.width,
      height: rect.height,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      hitBackground: Boolean(hitTarget && element.contains(hitTarget))
    }
  })
  expect(initialComposition.backgroundImage).toMatch(/^url\(["']?blob:/)
  expect(initialComposition.position).toBe('fixed')
  expect(initialComposition.pointerEvents).toBe('none')
  expect(initialComposition.backgroundZIndex).toBe(0)
  expect(initialComposition.pageLayerZIndex).toBeGreaterThan(initialComposition.backgroundZIndex)
  expect(initialComposition.canvasAlpha).toBeCloseTo(0.72, 2)
  expect(initialComposition.width).toBe(page.viewportSize()?.width)
  expect(initialComposition.height).toBe(page.viewportSize()?.height)
  expect(initialComposition.imageWidth).toBeGreaterThan(1)
  expect(initialComposition.imageHeight).toBeGreaterThan(1)
  expect(initialComposition.hitBackground).toBe(false)

  const storedWithBackground = await page.evaluate(() => JSON.parse(localStorage.getItem('career-md3-theme-v1') || '{}'))
  expect(storedWithBackground.backgroundEnabled).toBe(true)
  expect(storedWithBackground.colorSource).toBe('custom_image')
  const imageSeed = storedWithBackground.seedColor

  const scrimSlider = page.getByRole('slider', { name: '背景遮罩' })
  await scrimSlider.press('Home')
  await expect.poll(() => scrimSlider.evaluate((element) => Number((element as HTMLElement & { value: number }).value))).toBe(0.2)
  await expect.poll(() => backgroundScrim.evaluate((element) => Number(getComputedStyle(element).opacity))).toBe(0.2)
  const lowScrimPixels = await readBackgroundGutter()
  if (process.env.E2E_CAPTURE === '1') {
    await testInfo.attach('web-background-low-scrim', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
  }

  await scrimSlider.press('End')
  await expect.poll(() => scrimSlider.evaluate((element) => Number((element as HTMLElement & { value: number }).value))).toBe(0.8)
  await expect.poll(() => backgroundScrim.evaluate((element) => Number(getComputedStyle(element).opacity))).toBe(0.8)
  const highScrimPixels = await readBackgroundGutter()
  expect(averageColorDifference(lowScrimPixels, highScrimPixels)).toBeGreaterThan(4)
  expect(lowScrimPixels.luminance - highScrimPixels.luminance).toBeGreaterThan(2)

  await scrimSlider.press('Home')
  await expect.poll(async () => {
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('career-md3-theme-v1') || '{}'))
    return stored.backgroundScrim
  }).toBe(0.2)
  const persistedPixelsBeforeReload = await readBackgroundGutter()
  await page.reload()
  await expect(page.getByText('当前 Web 背景')).toBeVisible()
  await expect(appBackground).toBeVisible()
  await expect(appBackground).toHaveCSS('pointer-events', 'none')
  await expect(appBackground).toHaveCSS('z-index', '0')
  await expect(backgroundScrim).toHaveCSS('opacity', '0.2')
  await expect(appBackground).toHaveCSS('background-image', /^url\(["']?blob:/)
  const storedAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('career-md3-theme-v1') || '{}'))
  expect(storedAfterReload).toMatchObject({ backgroundEnabled: true, backgroundScrim: 0.2 })
  const persistedPixelsAfterReload = await readBackgroundGutter()
  expect(averageColorDifference(persistedPixelsBeforeReload, persistedPixelsAfterReload)).toBeLessThan(1)

  const expectStandaloneCanvas = async (path: string, selector: string) => {
    await page.goto(path)
    const standalonePage = page.locator(selector)
    await expect(standalonePage).toBeVisible()
    await expect(appBackground).toBeVisible()
    await expect(appBackground).toHaveCSS('background-image', /^url\(["']?blob:/)
    const canvasAlpha = await standalonePage.evaluate((element) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d')!
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = getComputedStyle(element).backgroundColor
      context.fillRect(0, 0, 1, 1)
      return context.getImageData(0, 0, 1, 1).data[3]! / 255
    })
    expect(canvasAlpha).toBeCloseTo(0.72, 2)
  }
  await expectStandaloneCanvas('/login', '.auth-page')
  await expectStandaloneCanvas('/onboarding', '.onboarding-page')
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(appBackground).toBeVisible()

  const supportsMagnetic = await page.evaluate(() =>
    matchMedia('(min-width: 600px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches
  )
  if (supportsMagnetic) {
    const destination = page.locator('.rail-destination[href="/explore"]')
    const cursor = page.locator('.navigation-magnetic-cursor')
    const bounds = await destination.boundingBox()
    expect(bounds).not.toBeNull()
    const attractionPoint = {
      x: bounds!.x + bounds!.width + 8,
      y: bounds!.y + bounds!.height / 2
    }
    await page.mouse.move(attractionPoint.x, attractionPoint.y)
    await expect(destination).toHaveAttribute('data-magnetic-active', 'true')
    await expect(cursor).toHaveAttribute('data-magnetic-active', 'true')
    await expect(cursor).toHaveCSS('pointer-events', 'none')
    await page.mouse.click(attractionPoint.x, attractionPoint.y)
    await expect(page).toHaveURL(/\/explore$/)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
    await expect(appBackground).toBeVisible()
  }

  const removeButton = page.getByRole('button', { name: '移除背景', exact: true })
  await removeButton.click()
  const dialog = page.locator('md-dialog[open]')
  await expect(dialog.getByRole('heading', { name: '移除背景' })).toBeVisible()
  await dialog.getByRole('button', { name: '移除背景', exact: true }).click()
  await expect(page.getByText('还没有自定义背景')).toBeVisible()
  await expect(appBackground).toHaveCount(0)

  const storedWithoutBackground = await page.evaluate(() => JSON.parse(localStorage.getItem('career-md3-theme-v1') || '{}'))
  expect(storedWithoutBackground.backgroundEnabled).toBe(false)
  expect(storedWithoutBackground.seedColor).toBe(imageSeed)
  expect(storedWithoutBackground.colorSource).toBe('custom_image')

  await backgroundInput.setInputFiles({
    name: 'unsupported.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('not-an-image')
  })
  await expect(page.getByRole('status')).toContainText('背景仅支持 JPEG、PNG 或 WebP 图片')
  await expect(page.getByText('还没有自定义背景')).toBeVisible()
})
