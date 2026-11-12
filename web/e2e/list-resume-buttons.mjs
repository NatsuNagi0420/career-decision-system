import { chromium } from 'playwright';
const token=process.env.DEMO_TOKEN; const browser=await chromium.launch({channel:'chrome',headless:true}); const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.addInitScript(t=>{localStorage.setItem('career.session.token',t);localStorage.setItem('suinai.onboarding.v1.local.3','completed');},token);
await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(7000);
await page.getByText('我是信息管理与信息系统专业',{exact:false}).first().click(); await page.waitForTimeout(3000);
console.log('查看简历 count', await page.getByRole('button',{name:'查看简历'}).count());
await page.getByRole('button',{name:'查看简历'}).click(); await page.waitForTimeout(2500);
console.log(await page.locator('button').evaluateAll(bs=>bs.map(b=>({t:b.innerText.slice(0,30),a:b.getAttribute('aria-label'),title:b.getAttribute('title'),cls:b.className})).filter(x=>x.a||x.title||x.t.includes('简历'))));
await browser.close();
