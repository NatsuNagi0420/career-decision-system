import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto('https://www.douyin.com/video/7700090830036395519', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
// close login modal
const close = page.locator('[class*="close"], button[aria-label*="关闭"], .dy-account-close');
console.log('close count', await close.count());
for (let i = 0; i < await close.count(); i++) {
  try { await close.nth(i).click({ timeout: 1000 }); } catch {}
}
await page.waitForTimeout(1000);
const vids = page.locator('video');
console.log('videos', await vids.count());
for (let i = 0; i < await vids.count(); i++) {
  console.log(i, await vids.nth(i).evaluate(el => ({ src: el.currentSrc || el.src, duration: el.duration, paused: el.paused, w: el.videoWidth, h: el.videoHeight })));
}
await page.screenshot({ path: 'D:/Project/career-decision-system/tmp/douyin-closed.png' });
await browser.close();
