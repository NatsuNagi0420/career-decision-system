import { chromium } from 'playwright';
const b=await chromium.launch({channel:'chrome',headless:true}); const c=await b.newContext({viewport:{width:1600,height:1000}}); const p=await c.newPage();
try{await p.goto('https://agent.suinai.me',{waitUntil:'domcontentloaded',timeout:30000}); await p.waitForTimeout(6000); console.log((await p.locator('body').innerText()).slice(0,1500)); await p.screenshot({path:'D:/Project/career-decision-system/tmp/cloud-landing.png'});}catch(e){console.log('ERR',e.message)}
await b.close();
