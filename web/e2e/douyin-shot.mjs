import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto('https://www.douyin.com/video/7700090830036395519', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'D:/Project/career-decision-system/tmp/douyin-page.png', fullPage: false });
console.log('title:', await page.title());
console.log('url:', page.url());
console.log('text:', (await page.locator('body').innerText()).slice(0, 1000));
await browser.close();
