import { chromium } from 'playwright';
const browser = await chromium.launch({channel:'chrome', headless:true});
const ctx = await browser.newContext({viewport:{width:1440,height:1000}, userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
const page = await ctx.newPage();
await page.goto('https://www.bilibili.com',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(3000);
const data = await page.evaluate(async () => {
  const q = encodeURIComponent('100年前的古人 玄离199');
  const r = await fetch(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${q}`, {credentials:'include'});
  return {status:r.status, text:(await r.text()).slice(0,4000)};
});
console.log(data.status); console.log(data.text);
await browser.close();
