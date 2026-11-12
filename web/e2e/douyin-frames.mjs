import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto('https://www.douyin.com/video/7700090830036395519', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.evaluate(() => {
  document.querySelectorAll('[class*="login"], [class*="Login"], [class*="modal"], [class*="Modal"]').forEach(el => el.remove());
});
await page.waitForTimeout(1000);
const video = page.locator('video').first();
await video.evaluate(async el => { el.muted = true; await el.play().catch(() => {}); });
for (const t of [0, 4, 8, 12, 16, 20, 24, 28, 32]) {
  await video.evaluate(async (el, t) => {
    el.pause();
    el.currentTime = t;
    await new Promise(r => { if (Math.abs(el.currentTime - t) < 0.05) r(); else el.addEventListener('seeked', r, { once: true }); });
    await new Promise(r => setTimeout(r, 250));
  }, t);
  await video.screenshot({ path: `D:/Project/career-decision-system/tmp/douyin-${t}.png` });
}
await browser.close();
console.log('done');
