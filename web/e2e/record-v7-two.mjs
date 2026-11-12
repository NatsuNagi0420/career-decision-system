import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TOKEN = fs.readFileSync('D:/Project/career-decision-system/tmp/token3.txt', 'utf8').trim();
const RAW = 'D:/Project/career-decision-system/video/09_重录/raw';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript((t) => {
    localStorage.setItem('career.session.token', t);
    localStorage.setItem('suinai.onboarding.v1.local.3', 'completed');
  }, TOKEN);
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(7000);
  await page.evaluate(() => {
    if (document.getElementById('__demo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = `<svg width="30" height="36" viewBox="0 0 30 36"><path d="M3 2 L25 19 L15 21 L20 32 L15 34 L10 23 L3 30 Z" fill="#fff" stroke="#17131f" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
    c.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:36px;z-index:2147483647;pointer-events:none;transform:translate3d(1280px,720px,0);will-change:transform;filter:drop-shadow(0 2px 8px rgba(0,0,0,.45));';
    document.body.appendChild(c);
    let x = 1280, y = 720, tx = x, ty = y;
    window.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
    const tick = () => { x += (tx - x) * .22; y += (ty - y) * .22; c.style.transform = `translate3d(${x}px,${y}px,0)`; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  return { browser, context, page };
}
async function cap(page, name) {
  const dir = path.join(RAW, 'frames', name); fs.mkdirSync(dir, { recursive: true });
  const client = await page.context().newCDPSession(page); let n = 0; const frames = [];
  client.on('Page.screencastFrame', async (e) => {
    const f = path.join(dir, String(n).padStart(5, '0') + '.jpg');
    fs.writeFileSync(f, Buffer.from(e.data, 'base64')); frames.push({ file: f, ts: e.metadata.timestamp }); n++;
    await client.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 });
  return { async stop() { await sleep(200); await client.send('Page.stopScreencast').catch(() => {}); fs.writeFileSync(path.join(RAW, name + '.json'), JSON.stringify(frames)); console.log('CAPTURED', name, frames.length); await client.detach().catch(() => {}); } };
}
const move = async (p, x, y, steps = 26, ms = 250) => { await p.mouse.move(x, y, { steps }); await sleep(ms); };
const scroll = async (p, dy, steps = 26, ms = 22) => { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy / steps); await sleep(ms); } };
const click = async (p, loc) => { await loc.click({ timeout: 2500, force: true }).catch(() => {}); };

async function scene(name, fn) {
  const { browser, context, page } = await setup(); const c = await cap(page, name);
  try { await fn(page); } finally { await c.stop(); await context.close(); await browser.close(); }
}

await scene('comparison', async (page) => {
  await page.getByText('职业工作台', { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
  await sleep(1700);
  await page.getByRole('tab', { name: '方向与岗位' }).click({ timeout: 3000 }).catch(() => {});
  await sleep(2200);
  await move(page, 1300, 700, 30, 700);
  await scroll(page, 500, 28, 22);
  await sleep(1000);
  await move(page, 1000, 560, 30, 700);
  await scroll(page, 320, 24, 22);
  await sleep(1200);
  await move(page, 1500, 700, 28, 600);
  await sleep(900);
});

await scene('action', async (page) => {
  await page.getByText('职业工作台', { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
  await sleep(1600);
  await page.getByRole('tab', { name: '成长行动' }).click({ timeout: 3000 }).catch(() => {});
  await sleep(2200);
  await move(page, 1300, 740, 28, 700);
  await scroll(page, 300, 24, 22);
  await sleep(900);
  await click(page, page.getByText('查看或补充我的结果', { exact: false }).first());
  await sleep(1800);
  await scroll(page, 180, 18, 22);
  await sleep(1000);
  await page.keyboard.press('Escape');
  await sleep(900);
  await page.getByText('我是信息管理与信息系统专业', { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
  await sleep(2200);
  await page.evaluate(() => { [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 140).forEach(e => e.scrollTop = e.scrollHeight); });
  await sleep(1400);
  await click(page, page.getByText('查看逐项对照', { exact: false }).last());
  await sleep(1800);
  await scroll(page, 160, 20, 22);
  await sleep(900);
  await click(page, page.getByRole('button', { name: '确认更新' }).last());
  await sleep(2200);
});
