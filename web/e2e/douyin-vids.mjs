import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({viewport:{width:1440,height:900}, userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
const page = await context.newPage();
await page.goto('https://www.douyin.com/video/7700090830036395519', {waitUntil:'domcontentloaded', timeout:60000});
await page.waitForTimeout(8000);
const vids = await page.locator('video').evaluateAll(els => els.map(el => ({src: el.currentSrc || el.src, duration: el.duration, paused: el.paused, w: el.videoWidth, h: el.videoHeight})));
console.log(JSON.stringify(vids,null,2));
await browser.close();
