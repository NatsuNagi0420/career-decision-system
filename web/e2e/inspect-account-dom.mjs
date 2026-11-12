import { chromium } from 'playwright';
const token=process.env.CLOUD_TOKEN; const browser=await chromium.launch({channel:'chrome',headless:true}); const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.addInitScript(t=>{localStorage.setItem('career.session.token',t);localStorage.setItem('suinai.onboarding.v1.server.7','completed');},token);
await page.goto('https://agent.suinai.me/',{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(4000); await page.getByText('跳过动画',{exact:false}).click().catch(()=>{}); await page.waitForTimeout(8000);
const info=await page.getByText('demo_video_1103',{exact:true}).first().evaluate(el=>{let a=[];let n=el;for(let i=0;i<4&&n;i++,n=n.parentElement){a.push({tag:n.tagName,cls:n.className,text:n.innerText.slice(0,120)})}return a});
console.log(JSON.stringify(info,null,2)); await browser.close();
