import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
for(const s of ['architecture','compare','context','checkpoint','stale','evidence','three']){
  await page.goto(`file:///D:/Project/career-decision-system/video/assets/animations.html?scene=${s}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(5500);
  await page.screenshot({path:`D:/Project/career-decision-system/video/raw/anim-${s}.png`});
  console.log(s,'ok');
}
await browser.close();
