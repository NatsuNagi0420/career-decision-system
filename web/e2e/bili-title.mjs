import { chromium } from 'playwright';
const browser = await chromium.launch({channel:'chrome', headless:true});
const ctx = await browser.newContext({viewport:{width:1440,height:1000}, userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
const page = await ctx.newPage();
await page.goto('https://space.bilibili.com/67079745/video',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(6000);
const loc = page.getByText('100年前的古人', {exact:false}).first();
console.log('count', await loc.count());
if (await loc.count()) {
  const info = await loc.evaluate(el => {
    let a = el.closest('a'); let p=el;
    for(let i=0;i<5 && !a && p;i++){p=p.parentElement; a=p?.querySelector?.('a')}
    return {tag:el.tagName, html:el.outerHTML.slice(0,500), href:a?.href, parent:el.parentElement?.outerHTML.slice(0,800)};
  });
  console.log(JSON.stringify(info,null,2));
}
await browser.close();
