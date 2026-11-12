import { chromium } from 'playwright'; import fs from 'fs';
const dir='D:/Project/career-decision-system/video/raw/anim-clips';
const scenes=[['coldopen.html','coldopen',27],['animations.html?scene=three','three',10],['animations.html?scene=evidence','evidence',10],['animations.html?scene=architecture','architecture',11],['animations.html?scene=compare','compare',11],['animations.html?scene=context','context',12],['animations.html?scene=checkpoint','checkpoint',12],['animations.html?scene=stale','stale',10],['flow.html','flow',11]];
const browser=await chromium.launch({channel:'chrome',headless:true});
for(const [file,name,secs] of scenes){
  const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir,size:{width:1920,height:1080}}});
  const page=await context.newPage();
  await page.goto(`file:///D:/Project/career-decision-system/video/assets/${file}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(secs*1000);
  const v=page.video(); await context.close(); const src=await v.path(); const dest=`${dir}/${name}.webm`; fs.renameSync(src,dest); console.log('SAVED',dest);
}
await browser.close();
