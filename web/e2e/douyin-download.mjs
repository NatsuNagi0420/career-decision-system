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
const src = await page.locator('video').first().evaluate(el => el.currentSrc || el.src);
console.log('src?', src.slice(0, 80));
const b64 = await page.evaluate(async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch ' + r.status);
  const b = await r.arrayBuffer();
  let s = '';
  const bytes = new Uint8Array(b);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}, src);
fs.writeFileSync('D:/Project/career-decision-system/tmp/douyin-ref.mp4', Buffer.from(b64, 'base64'));
console.log('bytes', fs.statSync('D:/Project/career-decision-system/tmp/douyin-ref.mp4').size);
await browser.close();
