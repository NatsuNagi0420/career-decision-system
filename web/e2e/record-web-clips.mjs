import { chromium } from 'playwright';
import fs from 'fs';
const token = process.env.DEMO_TOKEN;
const dir = 'D:/Project/career-decision-system/video/raw/clips';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function setup() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir, size: { width: 1920, height: 1080 } } });
  const page = await context.newPage();
  await page.addInitScript(t => { localStorage.setItem('career.session.token', t); localStorage.setItem('suinai.onboarding.v1.local.3','completed'); }, token);
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    if (document.getElementById('__fake_cursor')) return;
    const c = document.createElement('div');
    c.id = '__fake_cursor';
    c.style.cssText = 'position:fixed;left:960px;top:540px;width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.92);border:2px solid rgba(40,35,60,.72);box-shadow:0 1px 6px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;transform:translate(-8px,-8px);transition:left .08s linear,top .08s linear,transform .08s linear;';
    document.body.appendChild(c);
    window.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });
    window.addEventListener('mousedown', () => { c.style.background='rgba(120,90,200,.95)'; c.style.transform='translate(-8px,-8px) scale(.72)'; });
    window.addEventListener('mouseup', () => { c.style.background='rgba(255,255,255,.92)'; c.style.transform='translate(-8px,-8px) scale(1)'; });
  });
  return { context, page };
}
async function move(page, x, y, steps=25) { await page.mouse.move(x, y, { steps }); await page.waitForTimeout(350); }
async function slowScroll(page, total, steps=6, pause=350) {
  for (let i=0;i<steps;i++){ await page.mouse.wheel(0, total/steps); await page.waitForTimeout(pause); }
}
async function finish(context, page, name) {
  const video = page.video();
  await context.close();
  const src = await video.path();
  const dest = `${dir}/${name}.webm`;
  fs.renameSync(src, dest);
  console.log('SAVED', dest);
}

// A: workbench jobs
{
  const {context,page} = await setup();
  await move(page, 120, 190);
  await page.getByText('职业工作台',{exact:false}).first().click();
  await page.waitForTimeout(2200);
  await move(page, 560, 195);
  await page.getByRole('tab',{name:'方向与岗位'}).click();
  await page.waitForTimeout(2200);
  await move(page, 960, 620);
  await slowScroll(page, 380, 5, 450);
  await page.waitForTimeout(1200);
  const cat = page.getByText('Caterpillar',{exact:true}).first();
  const box = await cat.boundingBox();
  if (box) await move(page, box.x + box.width/2, box.y + box.height/2);
  await page.waitForTimeout(1200);
  await page.getByText('查看岗位原文').first().click();
  await page.waitForTimeout(2200);
  await slowScroll(page, 650, 7, 450);
  await page.waitForTimeout(1800);
  await slowScroll(page, 480, 5, 500);
  await page.waitForTimeout(2200);
  await finish(context,page,'web-01-jobs');
}

// B: action result -> comparison confirm
{
  const {context,page} = await setup();
  await move(page, 120, 190);
  await page.getByText('职业工作台',{exact:false}).first().click();
  await page.waitForTimeout(1800);
  await move(page, 675, 195);
  await page.getByRole('tab',{name:'成长行动'}).click();
  await page.waitForTimeout(2200);
  await move(page, 960, 700);
  await slowScroll(page, 420, 6, 450);
  await page.waitForTimeout(1200);
  const detail = page.getByText('查看或补充我的结果').first();
  const b = await detail.boundingBox();
  if (b) await move(page, b.x + b.width/2, b.y + b.height/2);
  await page.waitForTimeout(800);
  await detail.click();
  await page.waitForTimeout(1800);
  await slowScroll(page, 260, 4, 500);
  await page.waitForTimeout(1600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  await page.getByText('我是信息管理与信息系统专业',{exact:false}).first().click();
  await page.waitForTimeout(2600);
  await page.evaluate(() => { const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+120); els.forEach(e=>e.scrollTop=e.scrollHeight); });
  await page.waitForTimeout(1500);
  await move(page, 960, 600);
  const exp = page.getByText('查看逐项对照').last();
  const eb = await exp.boundingBox();
  if (eb) await move(page, eb.x + eb.width/2, eb.y + eb.height/2);
  await page.waitForTimeout(800);
  await exp.click();
  await page.waitForTimeout(1800);
  await slowScroll(page, 220, 4, 450);
  await page.waitForTimeout(1200);
  const confirm = page.getByRole('button',{name:'确认更新'}).last();
  const cb = await confirm.boundingBox();
  if (cb) await move(page, cb.x + cb.width/2, cb.y + cb.height/2);
  await page.waitForTimeout(900);
  await confirm.click();
  await page.waitForTimeout(2200);
  await move(page, 900, 760);
  await page.waitForTimeout(2200);
  await finish(context,page,'web-02-action-update');
}

// C: resume + memory
{
  const {context,page} = await setup();
  await page.getByText('我是信息管理与信息系统专业',{exact:false}).first().click();
  await page.waitForTimeout(2600);
  await move(page, 960, 800);
  await page.getByRole('button',{name:'查看简历'}).click();
  await page.waitForTimeout(3000);
  await move(page, 1500, 500);
  await slowScroll(page, 420, 5, 450);
  await page.waitForTimeout(1500);
  await slowScroll(page, -220, 4, 400);
  await page.waitForTimeout(1800);
  await page.getByRole('button',{name:'收起简历预览'}).click();
  await page.waitForTimeout(1200);
  await move(page, 120, 250);
  await page.getByRole('button',{name:'打开穗奈·忆迹场'}).first().click();
  await page.waitForTimeout(3200);
  await move(page, 760, 520);
  await slowScroll(page, 280, 4, 500);
  await page.waitForTimeout(2200);
  await finish(context,page,'web-03-resume-memory');
}

await browser.close();
