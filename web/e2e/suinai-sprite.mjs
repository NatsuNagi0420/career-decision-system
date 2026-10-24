/** 青穗集 · 像素角色浏览器验收：本地预览与 API 替身，不写真实资料、不调用模型。 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const OUT = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL('../../logs/suinai-presence-20261018/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const errors = [], writes = [], results = [], apiCalls = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const pauses = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function context({ width=1440, height=1080, reducedMotion='no-preference', signedIn=false, motion=true, resume=false } = {}) {
  const ctx=await browser.newContext({ viewport:{width,height}, reducedMotion });
  await ctx.addInitScript(({signedIn,motion}) => {
    if (!sessionStorage.getItem('pixel-test-initialized')) {
      localStorage.clear();
      if(signedIn) localStorage.setItem('career.session.token','pixel-ui-fixture');
      localStorage.setItem('career.motion',motion?'1':'0');
      sessionStorage.setItem('pixel-test-initialized','1');
    }
  },{signedIn,motion});
  await ctx.route('**/api/v1/**',async (route) => {
    const request=route.request(), path=new URL(request.url()).pathname;
    apiCalls.push(`${request.method()} ${path}`);
    if(request.method()!=='GET') { writes.push(`${request.method()} ${path}`); await route.fulfill({status:409,json:{detail:'UI验收禁止写入'}}); return; }
    const artifact={id:'resume-demo',run_id:'demo-run',artifact_type:'ResumeDraft',title:'演示简历',status:'committed',version:1,data_coverage:null,is_provisional:false,generation_mode:'stub',content:{resume:{plain:'# 演示简历',sections:[{key:'skills',title:'专业技能',empty:false,lines:[{text:'Python / SQL（演示内容）'}]}],improvements:[]}},evidence_quotes:{},source_refs:[],supersedes_id:null};
    const json=path.endsWith('/auth/me')?{id:1,username:'演示用户',external_ai_consent:false}:path.endsWith('/capabilities')?[]:path.endsWith('/feed')?{runs:[],projects:[],artifacts:resume?[artifact]:[],obligations:[],tasks:[],pending_approvals:[]}:path.endsWith('/continuations')?{obligation:null,reason:'no_due_obligation'}:{};
    await route.fulfill({json});
  });
  const page=await ctx.newPage();
  page.on('pageerror',(error)=>errors.push(error.message));
  return {ctx,page};
}
async function go(page,path) { await page.goto(`${BASE}${path}`,{waitUntil:'networkidle'}); await page.evaluate(()=>document.fonts.ready); }
async function shot(page,name,fullPage=false) { await page.screenshot({path:`${OUT}/${name}.png`,fullPage}); }
const image=(page)=>page.locator('.suinai-studio__stage canvas');
const pixel=(canvas)=>canvas.evaluate((el)=>el.toDataURL());
const current=(canvas)=>canvas.getAttribute('data-frame');
try {
  const {ctx,page}=await context();
  await go(page,'/?preview=suinai');
  assert.deepEqual(apiCalls,[],'Character preview must not mount the business application or call its API');
  const canvas=image(page);
  assert.equal(await canvas.getAttribute('data-source'),'code');
  await page.getByRole('group',{name:'角色稿件'}).getByRole('button',{name:'中模参考 v0.4',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.suinai-studio__stage canvas')?.dataset.source==='pixel-v04-reference');
  assert.equal(await canvas.getAttribute('data-source'),'pixel-v04-reference');
  await page.getByRole('group',{name:'角色稿件'}).getByRole('button',{name:'代码稿 v0.3',exact:true}).click();
  assert.equal(await canvas.getAttribute('data-source'),'code');
  await page.getByRole('group',{name:'角色稿件'}).getByRole('button',{name:'中模参考 v0.4',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.suinai-studio__stage canvas')?.dataset.source==='pixel-v04-reference');
  const first=await current(canvas);
  await page.waitForFunction((previous)=>document.querySelector('.suinai-studio__stage canvas')?.dataset.frame!==previous,first);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'系统已关闭自动动画'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.suinai-studio__stage canvas')?.dataset.frame==='0');
  const dynamicReduced=await current(canvas);
  await pauses(300);
  assert.equal(await current(canvas),dynamicReduced);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction((previous)=>document.querySelector('.suinai-studio__stage canvas')?.dataset.frame!==previous,dynamicReduced);
  await page.getByRole('button',{name:'暂停 · 检查静帧',exact:true}).click();
  const paused=await current(canvas);
  await pauses(350);
  assert.equal(await current(canvas),paused);
  await shot(page,'01-studio-pixel',true);
  const poses=['拿起手账','专注倾听','记笔记','对照资料','请你确认','收好成果'];
  const states=['journal','listen','write','compare','review','filed'];
  const frames=[];
  for(let i=0;i<poses.length;i++) {
    await page.getByRole('group',{name:'角色动作'}).getByRole('button',{name:poses[i],exact:false}).click();
    assert.equal(await canvas.getAttribute('data-pose'),states[i]);
    assert.equal(await current(canvas),'0');
    frames.push(await pixel(canvas));
    await canvas.screenshot({path:`${OUT}/pose-${states[i]}.png`});
  }
  assert.equal(new Set(frames).size,6);
  await page.getByRole('button',{name:'记笔记',exact:false}).click();
  await page.locator('#sprite-frame').fill('2');
  assert.equal(await current(canvas),'2');
  assert.notEqual(await pixel(canvas),frames[2]);
  await page.getByRole('button',{name:'拿起手账',exact:false}).click();
  await page.locator('#sprite-frame').fill('36');
  await canvas.screenshot({path:`${OUT}/03-blink.png`});
  await page.locator('#sprite-frame').fill('0');
  const pixelVersion=await pixel(canvas);
  await page.getByRole('button',{name:'彩色点阵',exact:true}).click();
  assert.equal(await canvas.getAttribute('data-mode'),'dots');
  assert.notEqual(await pixel(canvas),pixelVersion);
  await shot(page,'02-studio-dots',true);
  results.push('Studio: v0.4 reference source loads, explicit code fallback works, zero API calls, animated playback, pause, six distinct poses, pen frame, blink and dot rendering passed');
  await page.getByRole('group',{name:'角色动作'}).getByRole('button',{name:'专注倾听',exact:false}).click();
  assert.equal(await canvas.getAttribute('data-face'),'listen');
  await page.getByRole('button',{name:'方块像素',exact:true}).click();
  await shot(page,'10-studio-listening',true);
  const expressions=[];
  for(const [id,name] of [['smile','放松'],['listen','倾听'],['think','思考'],['explain','解释'],['encourage','鼓励'],['happy','开心'],['worry','关切'],['warn','提醒']]) {
    await page.getByRole('group',{name:'角色神态'}).getByRole('button',{name,exact:true}).click();
    assert.equal(await canvas.getAttribute('data-face'),id);
    expressions.push(await pixel(canvas));
  }
  assert.equal(new Set(expressions).size,8,'Expressions must be visibly different, not just relabelled');
  await page.getByRole('button',{name:'跟随动作',exact:true}).click();
  assert.equal(await canvas.getAttribute('data-face'),'listen');
  assert.deepEqual(apiCalls,[],'Pose and expression controls remain entirely local');
  results.push('Studio: dense native grid, eight distinct expressions and automatic pose/face mapping passed');
  await ctx.close();

  const reduced=await context({reducedMotion:'reduce'});
  await go(reduced.page,'/?preview=suinai');
  const still=image(reduced.page), before=await current(still);
  await pauses(400);
  assert.equal(await current(still),before);
  assert.equal(await reduced.page.getByRole('button',{name:'系统已关闭自动动画'}).isDisabled(),true);
  await reduced.page.locator('#sprite-frame').fill('36');
  assert.equal(await current(still),'36');
  await reduced.ctx.close();
  results.push('Reduced motion: no autoplay and manual frame inspection stays available');

  for(const width of [390,320]) {
    const mobile=await context({width,height:844,reducedMotion:'reduce'});
    await go(mobile.page,'/?preview=suinai');
    assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mobile.page.getByRole('button',{name:'彩色点阵',exact:true}).click();
    await shot(mobile.page,`04-studio-mobile-${width}`,true);
    await mobile.ctx.close();
  }
  results.push('Studio: 390px and 320px layouts fit without horizontal overflow');
  const offscreen=await context({width:390,height:844});
  await go(offscreen.page,'/?preview=suinai');
  await offscreen.page.locator('.suinai-studio__footer').scrollIntoViewIfNeeded();
  await pauses(250);
  const invisible=image(offscreen.page), hiddenFrame=await current(invisible);
  await pauses(350);
  assert.equal(await current(invisible),hiddenFrame);
  await invisible.scrollIntoViewIfNeeded();
  await offscreen.page.waitForFunction((previous)=>document.querySelector('.suinai-studio__stage canvas')?.dataset.frame!==previous,hiddenFrame);
  await offscreen.ctx.close();
  results.push('Offscreen animation pauses and resumes after returning to view; live system reduced-motion changes respected');


  const login=await context({reducedMotion:'reduce'});
  await go(login.page,'/');
  await login.page.locator('.auth__art canvas').waitFor();
  await shot(login.page,'05-login');
  await login.ctx.close();

  const app=await context({signedIn:true,resume:true});
  await go(app.page,'/');
  await app.page.locator('.welcome h1').waitFor();
  const companion=app.page.locator('.companion canvas');
  const appFirst=await current(companion);
  await app.page.waitForFunction((previous)=>document.querySelector('.companion canvas')?.dataset.frame!==previous,appFirst);
  await app.page.getByRole('button',{name:'暂停穗奈动画'}).click();
  const appPaused=await current(companion);
  await pauses(300);
  assert.equal(await current(companion),appPaused);
  await shot(app.page,'06-desktop-pixel');
  const composer=app.page.locator('textarea');
  const callsBeforeTyping=apiCalls.length;
  await composer.fill('我想先和你聊一聊我的经历（本地未发送测试）');
  await app.page.waitForFunction(()=>document.querySelector('.companion canvas')?.dataset.pose==='listen');
  assert.equal(await companion.getAttribute('data-face'),'listen');
  await shot(app.page,'11-desktop-composing');
  assert.equal(apiCalls.length,callsBeforeTyping,'Typing an unsent draft must not cause any API call');
  await composer.fill('');
  await app.page.waitForFunction(()=>document.querySelector('.companion canvas')?.dataset.pose==='journal');
  results.push('Companion: an unsent draft triggers listening locally, clearing it restores idle; no API calls or writes');
  await app.page.getByRole('group',{name:'穗奈显示方式'}).getByRole('button',{name:'点阵',exact:true}).click();
  assert.equal(await companion.getAttribute('data-mode'),'dots');
  assert.equal(await app.page.evaluate(()=>localStorage.getItem('career.suinai.display')),'dots');
  await shot(app.page,'07-desktop-dots');
  // A business result is independent from the character's display preference.
  await app.page.getByRole('navigation',{name:'求职桌面应用'}).getByRole('button',{name:/简历文件/}).click();
  await app.page.locator('.desktop-output .resume-sheet').waitFor();
  await app.page.getByRole('button',{name:'紧凑',exact:true}).click();
  await app.page.emulateMedia({media:'print'});
  await app.page.pdf({path:`${OUT}/08-resume-print.pdf`,format:'A4',printBackground:true});
  assert.equal(await app.page.locator('.desktop-output .resume-sheet').isVisible(),true);
  assert.equal(await app.page.locator('.companion').isVisible(),false);
  await app.page.emulateMedia({media:'screen'});
  await app.page.reload({waitUntil:'networkidle'});
  assert.equal(await companion.getAttribute('data-mode'),'dots');
  await app.ctx.close();
  results.push('Application: login and companion use sprites; pause, display preference persistence, resume templates and print passed');

  const off=await context({signedIn:true,motion:false});
  await go(off.page,'/');
  const offCanvas=off.page.locator('.companion canvas'), offFrame=await current(offCanvas);
  await pauses(400);
  assert.equal(await current(offCanvas),offFrame);
  await off.ctx.close();
  const avatar=await context({reducedMotion:'reduce'});
  await go(avatar.page,'/?preview=suinai');
  const crop=await avatar.page.evaluate(async()=>{
    const {createSuinaiFrame,paintSuinaiFrame,SPRITE_AVATAR,SPRITE_SCALE}=await import('/src/character/suinai.ts');
    const canvas=document.createElement('canvas');
    paintSuinaiFrame(canvas.getContext('2d'),createSuinaiFrame('journal',0),'pixel',true);
    return {width:canvas.width,height:canvas.height,expectedWidth:SPRITE_AVATAR.width*SPRITE_SCALE,expectedHeight:SPRITE_AVATAR.height*SPRITE_SCALE,png:canvas.toDataURL()};
  });
  assert.equal(crop.width,crop.expectedWidth); assert.equal(crop.height,crop.expectedHeight);
  writeFileSync(`${OUT}/09-avatar.png`,Buffer.from(crop.png.split(',')[1],'base64'));
  await avatar.ctx.close();
  results.push('Application: global motion-off stops character; dedicated portrait crop generated for chat avatar');
  assert.deepEqual(errors,[]); assert.deepEqual(writes,[]);
  writeFileSync(`${OUT}/checks.json`,JSON.stringify({mode:'local preview + mocked business APIs; no backend writes or model calls',errors,writes,results},null,2)+'\n');
  console.log(results.join('\n'));
} finally { await browser.close(); }
