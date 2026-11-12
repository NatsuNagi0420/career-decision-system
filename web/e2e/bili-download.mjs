import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch({channel:'chrome', headless:true});
const ctx = await browser.newContext({viewport:{width:1440,height:900}, userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
const page = await ctx.newPage();
await page.goto('https://www.bilibili.com',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(2000);
const info = await page.evaluate(async () => {
  const v = await (await fetch('https://api.bilibili.com/x/web-interface/view?bvid=BV1rLxg6AE2p',{credentials:'include'})).json();
  const cid = v.data.cid;
  const p = await (await fetch(`https://api.bilibili.com/x/player/playurl?bvid=BV1rLxg6AE2p&cid=${cid}&qn=64&fnval=1&fourk=0`,{credentials:'include'})).json();
  return {title:v.data.title, duration:v.data.duration, cid, url:p.data?.durl?.[0]?.url || p.data?.dash?.video?.[0]?.baseUrl, quality:p.data?.quality, accept:p.data?.accept_description};
});
console.log(JSON.stringify(info,null,2).slice(0,2000));
if (info.url) {
  const b64 = await page.evaluate(async (url) => {
    const r = await fetch(url,{credentials:'include'});
    if(!r.ok) throw new Error('fetch '+r.status);
    const b = await r.arrayBuffer(); const bytes=new Uint8Array(b); let s=''; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) s+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    return btoa(s);
  }, info.url);
  fs.writeFileSync('D:/Project/career-decision-system/tmp/xuanli-ref.mp4', Buffer.from(b64,'base64'));
  console.log('bytes', fs.statSync('D:/Project/career-decision-system/tmp/xuanli-ref.mp4').size);
}
await browser.close();
