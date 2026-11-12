import { chromium } from 'playwright'; import fs from 'fs';
const dir='D:/Project/career-decision-system/video/raw/anim-clips';
const scenes=[['architecture',10],['compare',10],['context',12],['checkpoint',12],['stale',10],['evidence',10],['three',10]];
const browser=await chromium.launch({channel:'chrome',headless:true});
for(const [name,secs] of scenes){
  const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir,size:{width:1920,height:1080}}});
  const page=await context.newPage();
  await page.goto(`file:///D:/Project/career-decision-system/video/assets/animations.html?scene=${name}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(secs*1000);
  const v=page.video(); await context.close(); const src=await v.path(); const dest=`${dir}/${name}.webm`; fs.renameSync(src,dest); console.log('SAVED',dest);
}
await browser.close();
