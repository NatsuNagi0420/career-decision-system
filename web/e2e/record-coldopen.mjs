import { chromium } from 'playwright'; import fs from 'fs';
const dir='D:/Project/career-decision-system/video/raw/anim-clips';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir,size:{width:1920,height:1080}}});
const page=await context.newPage();
await page.goto('file:///D:/Project/career-decision-system/video/assets/coldopen.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(36000);
const v=page.video(); await context.close(); const src=await v.path(); fs.renameSync(src,`${dir}/coldopen.webm`); console.log('SAVED coldopen');
await browser.close();
