import { chromium } from '@playwright/test'

const webBaseUrl = required('WEB_BASE_URL').replace(/\/+$/, '')
const backendBaseUrl = required('BACKEND_BASE_URL').replace(/\/+$/, '')
const browserExecutablePath = required('BROWSER_EXECUTABLE_PATH')
const timeout = Number(process.env.SMOKE_TIMEOUT_SECONDS || 90) * 1000
const suffix = `${Date.now()}`.slice(-10)
const username = `web_smoke_${suffix}`
const phone = `139${suffix.slice(-8)}`
const password = 'StrongPass123'

const browser = await chromium.launch({
  executablePath: browserExecutablePath,
  headless: true,
  args: ['--ignore-certificate-errors']
})

try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 360, height: 800 },
    isMobile: true
  })
  const page = await context.newPage()
  page.setDefaultTimeout(timeout)
  const pageErrors = []
  page.on('pageerror', (error) => {
    pageErrors.push(`${page.url()} :: ${error.stack || error.message}`)
  })

  await page.goto(`${webBaseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('手机号').fill(phone)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByLabel('确认密码').fill(password)
  await page.getByText('我已阅读并同意用户协议和隐私政策').click()
  await page.getByRole('button', { name: '创建并开始引导' }).click()
  await page.waitForURL(/\/onboarding$/)
  await page.locator('.onboarding-panel .el-loading-mask').waitFor({ state: 'hidden' })

  await page.getByLabel(/专业/).fill('软件工程')
  await page.getByLabel(/当前年级/).selectOption('大三')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel(/当前困惑/).fill('验证 Java 后端还是数据分析')
  await page.getByLabel(/已经想到的方向/).fill('Java 后端、数据分析')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel(/项目标题/).fill('Web HTTPS 烟测决策')
  await page.getByRole('button', { name: '完成并开始' }).click()
  await page.waitForURL(/\/decision-projects\/\d+$/)

  const token = await page.evaluate(() => localStorage.getItem('career_token'))
  if (!token) throw new Error('Web registration did not persist an access token.')
  const me = await context.request.get(`${backendBaseUrl}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!me.ok()) throw new Error(`Backend rejected the Web session with HTTP ${me.status()}.`)
  const payload = await me.json()
  if (payload.code !== 0 || payload.data?.username !== username) {
    throw new Error('Web session user did not round-trip through the backend.')
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  )
  if (overflow) throw new Error('Decision workspace has horizontal overflow at 360px.')
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`)

  console.log(`Web HTTPS smoke passed for ${username}.`)
  await context.close()
} finally {
  await browser.close()
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}
