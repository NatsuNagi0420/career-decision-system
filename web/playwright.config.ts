import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://127.0.0.1:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium-1440',
      use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'chromium-360',
      use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 360, height: 800 }, isMobile: true }
    },
    {
      name: 'chromium-600',
      use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 600, height: 960 } }
    },
    {
      name: 'chromium-840-dark',
      use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 840, height: 1080 }, colorScheme: 'dark' }
    }
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: baseURL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
})
