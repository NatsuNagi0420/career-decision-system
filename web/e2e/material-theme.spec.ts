import { expect, test } from '@playwright/test'
import { installMockApi } from './mockApi'

type CursorContinuityWindow = Window & {
  __careerCursorContinuity?: {
    observer: MutationObserver
    changes: string[]
  }
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

  await expectCenteredContent('md-text-button.brand', 2)
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

  await page.mouse.move(bounds!.x + bounds!.width + 32, bounds!.y + bounds!.height / 2)
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
  await expect(cursor).toBeVisible()
  await expect(root).toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
  expect(await themeButton.evaluate((element) => {
    const control = element.shadowRoot?.querySelector<HTMLElement>('.icon-button')
    return control ? getComputedStyle(control).cursor : null
  })).toBe('none')
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
  await expect(accountMenu.locator('md-menu-item').first()).toBeFocused()
  await expect(cursor).toBeVisible()
  await expect(root).toHaveAttribute('data-navigation-magnetic-cursor-visible', '')
  expect(await accountTrigger.evaluate((element) => {
    const control = element.shadowRoot?.querySelector<HTMLElement>('.button')
    return control ? getComputedStyle(control).cursor : null
  })).toBe('none')
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

  await page.getByLabel('向 AI 导师提问').focus()
  await expect(page.getByLabel('向 AI 导师提问')).toBeFocused()
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
  await page.getByRole('button', { name: '技术研发', exact: true }).click()
  await expect(page.getByRole('button', { name: '技术研发', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '数字内容', exact: true })).toBeAttached()
})

test('Web 背景可持久化、独立移除并在失败时回退', async ({ page }) => {
  const backgroundInput = page.locator('input[type="file"][accept*="image/png"]')
  await backgroundInput.setInputFiles({
    name: 'theme-source.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZSmIAAAAASUVORK5CYII=', 'base64')
  })

  await expect(page.getByText('当前 Web 背景')).toBeVisible()
  const storedWithBackground = await page.evaluate(() => JSON.parse(localStorage.getItem('career-md3-theme-v1') || '{}'))
  expect(storedWithBackground.backgroundEnabled).toBe(true)
  expect(storedWithBackground.colorSource).toBe('custom_image')
  const imageSeed = storedWithBackground.seedColor

  await page.reload()
  await expect(page.getByText('当前 Web 背景')).toBeVisible()
  const removeButton = page.getByRole('button', { name: '移除背景', exact: true })
  await removeButton.click()
  const dialog = page.locator('md-dialog[open]')
  await expect(dialog.getByRole('heading', { name: '移除背景' })).toBeVisible()
  await dialog.getByRole('button', { name: '移除背景', exact: true }).click()
  await expect(page.getByText('还没有自定义背景')).toBeVisible()

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
