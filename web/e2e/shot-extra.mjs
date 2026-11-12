import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
for(const [f,name,wait] of [['coldopen.html','coldopen',5200],['coldopen.html','coldopen2',14500],['flow.html','flow',5200]]){
  await page.goto(`file:///D:/Project/career-decision-system/video/assets/${f}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(wait);
  await page.screenshot({path:`D:/Project/career-decision-system/video/raw/anim-${name}.png`});
  console.log(name,'ok');
}
await browser.close();
