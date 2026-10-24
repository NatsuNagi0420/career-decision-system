/** 青穗集 · Live2D 浏览器回归脚本：仅本地演示，不访问业务 API，不写入求职资料。 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const BASE=process.argv[2]||'http://127.0.0.1:5174';
const OUT=resolve(process.argv[3]||'../logs/live2d-20261018/automated');
mkdirSync(OUT,{recursive:true});
const errors=[],calls=[],checks=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function open({width=1440,height=1080,reducedMotion='no-preference',modelFailure=false,coreFailure=false}={}) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion});
  await context.route('**/api/**',async route=>{calls.push(route.request().url());await route.abort();});
  if(modelFailure) await context.route('**/Haru.moc3',route=>route.fulfill({status:404,body:'missing model'}));
  if(coreFailure) await context.route('**/core/live2dcubismcore.min.js',route=>route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${BASE}/?preview=live2d`);
  return {page,context};
}
try {
  const {page,context}=await open();
  const character=page.locator('.live2d-character'),canvas=character.locator('canvas');
  await page.waitForFunction(()=>document.querySelector('.live2d-character')?.dataset.status==='ready');
  await page.getByRole('button',{name:'轻轻点头',exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:'轻轻点头',exact:true}).isEnabled(),true);
  await page.screenshot({path:`${OUT}/01-desktop.png`,fullPage:true});
  const a=await canvas.getAttribute('data-frame');await pause(200);assert.notEqual(await canvas.getAttribute('data-frame'),a);
  checks.push('Real MOC3 renders, model parameters are detected and animation advances.');
  for(const [id,name] of [['idle','自然待机'],['listening','认真倾听'],['thinking','分析思考'],['explaining','解释建议'],['success','完成反馈'],['concern','温和关切']]) {
    await page.getByRole('group',{name:'Live2D 交互状态'}).getByRole('button',{name:new RegExp(name)}).click();
    assert.equal(await canvas.getAttribute('data-state'),id);
  }
  await page.getByRole('group',{name:'Live2D 交互状态'}).getByRole('button',{name:/自然待机/}).click();
  await page.getByRole('button',{name:'轻轻点头',exact:true}).click();await pause(300);
  assert.ok(Number(await canvas.getAttribute('data-motion-peak'))>1);
  checks.push('Six states and an authored parameter nod are functional.');
  await page.getByRole('button',{name:'暂停动画 Ⅱ',exact:true}).click();await pause(80);
  const frozen=await canvas.getAttribute('data-frame');await pause(250);assert.equal(await canvas.getAttribute('data-frame'),frozen);
  await page.getByRole('button',{name:'播放动画 ▷',exact:true}).click();
  await page.getByLabel('输入本地演示消息').fill('帮我整理项目经历');assert.equal(await canvas.getAttribute('data-state'),'listening');
  await page.getByRole('button',{name:'试演 →',exact:true}).click();assert.equal(await canvas.getAttribute('data-state'),'thinking');
  await page.waitForFunction(()=>document.querySelector('.live2d-character canvas')?.dataset.state==='explaining');
  await page.getByRole('button',{name:'模拟任务完成',exact:true}).click();assert.equal(await canvas.getAttribute('data-state'),'success');
  assert.equal(await page.getByText('模拟完成 · 没有生成或导出文件',{exact:true}).isVisible(),true);
  checks.push('Pause/resume, composing, simulated analysis, explanation and clearly labelled completion work.');
  await context.close();
  for(const width of [390,320]) {
    const item=await open({width,height:844,reducedMotion:'reduce'});
    await item.page.waitForFunction(()=>document.querySelector('.live2d-character')?.dataset.status==='ready');
    assert.equal(await item.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await item.page.locator('.live2d-character').getAttribute('data-motion'),'off');
    assert.equal(await item.page.getByRole('button',{name:'系统已减少动态效果',exact:true}).isDisabled(),true);
    await item.page.screenshot({path:`${OUT}/mobile-${width}.png`,fullPage:true});
    await item.context.close();
  }
  checks.push('320px / 390px layouts do not overflow; reduced motion disables autoplay.');
  for(const mode of ['modelFailure','coreFailure']) {
    const item=await open({[mode]:true});
    await item.page.locator('.live2d-character[data-status="error"]').waitFor();
    assert.equal(await item.page.getByRole('button',{name:'重新加载角色',exact:true}).isVisible(),true);
    if(mode==='modelFailure') await item.context.unroute('**/Haru.moc3');else await item.context.unroute('**/core/live2dcubismcore.min.js');
    await item.page.getByRole('button',{name:'重新加载角色',exact:true}).click();
    await item.page.waitForFunction(()=>document.querySelector('.live2d-character')?.dataset.status==='ready');
    await item.context.close();
  }
  checks.push('Missing Core/model produces a visible error; retry succeeds without a pixel fallback.');
  assert.deepEqual(calls,[]);assert.deepEqual(errors,[]);
  writeFileSync(`${OUT}/operation.log`,['status=passed',...checks,'Business API calls=0; page errors=0'].join('\n')+'\n');
  console.log(checks.join('\n'));
} catch(error) {
  writeFileSync(`${OUT}/operation.log`,JSON.stringify({status:'failed',message:String(error),errors,calls,checks},null,2));throw error;
} finally { await browser.close(); }

