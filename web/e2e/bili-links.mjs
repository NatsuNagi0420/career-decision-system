import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
const page = await context.newPage();
await page.goto('https://space.bilibili.com/67079745/video', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
const items = await page.locator('a[href*="/video/BV"]').evaluateAll(as => as.map(a => ({href:a.href, text:(a.innerText||'').trim().slice(0,120)})).filter(x=>x.text));
console.log(JSON.stringify(items.slice(0,20), null, 2));
await browser.close();
