import { chromium } from 'playwright';
const token=process.env.CLOUD_TOKEN; const browser=await chromium.launch({channel:'chrome',headless:true}); const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.addInitScript(t=>{localStorage.setItem('career.session.token',t);localStorage.setItem('suinai.onboarding.v1.server.7','completed');},token);
await page.goto('https://agent.suinai.me/',{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(4000); await page.getByText('跳过动画',{exact:false}).click().catch(()=>{}); await page.waitForTimeout(9000);
await page.getByText('我是信息管理与信息系统专业',{exact:false}).first().click(); await page.waitForTimeout(3500);
console.log('TEXT TAIL',(await page.locator('body').innerText()).slice(-2500));
console.log('buttons', (await page.locator('button').allInnerTexts()).filter(x=>x.includes('执行')||x.includes('本轮')||x.includes('简历')).slice(0,20));
await page.screenshot({path:'D:\\Project\\career-decision-system\\video\\raw\\cloud-chat.png',fullPage:false}); await browser.close();
