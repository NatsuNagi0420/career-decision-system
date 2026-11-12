import { chromium } from 'playwright';
const browser = await chromium.launch({channel:'chrome', headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1000}, userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
const page = await context.newPage();
await page.goto('https://space.bilibili.com/67079745/video',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(6000);
const html = await page.content();
const m = html.match(/BV[0-9A-Za-z]{10}/g) || [];
console.log([...new Set(m)].slice(0,30));
const titles = await page.locator('text=100年前的古人').count();
console.log('titles', titles);
if (titles) { await page.locator('text=100年前的古人').first().click(); await page.waitForTimeout(5000); console.log('url', page.url()); }
await browser.close();
