import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto('https://space.bilibili.com/67079745/video', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'D:/Project/career-decision-system/tmp/bili-space.png', fullPage: false });
console.log('title', await page.title());
const text = await page.locator('body').innerText();
console.log(text.slice(0, 3000));
await browser.close();
