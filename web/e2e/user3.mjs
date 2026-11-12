import { chromium } from 'playwright';
import fs from 'fs';
const token=fs.readFileSync('D:/Project/career-decision-system/tmp/token3.txt','utf8').trim();
const b=await chromium.launch({channel:'chrome',headless:true}); const c=await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1}); const p=await c.newPage();
await p.addInitScript(t=>{localStorage.setItem('career.session.token',t);localStorage.setItem('suinai.onboarding.v1.local.3','completed');},token);
await p.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(7000);
console.log((await p.locator('body').innerText()).slice(0,1500));
await p.screenshot({path:'D:/Project/career-decision-system/tmp/user3.png'}); await b.close();
