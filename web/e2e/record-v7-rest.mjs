import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TOKEN = fs.readFileSync('D:/Project/career-decision-system/tmp/token3.txt', 'utf8').trim();
const ROOT = 'D:/Project/career-decision-system/video/09_重录';
const RAW = path.join(ROOT, 'raw');
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
  await sleep(7500);
  await page.evaluate(() => {
    if (document.getElementById('__demo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = `<svg width="30" height="36" viewBox="0 0 30 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 2 L25 19 L15 21 L20 32 L15 34 L10 23 L3 30 Z" fill="#ffffff" stroke="#17131f" stroke-width="2.2" stroke-linejoin="round"/>
    </svg>`;
    c.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:36px;z-index:2147483647;pointer-events:none;transform:translate3d(1280px,720px,0);will-change:transform;filter:drop-shadow(0 2px 8px rgba(0,0,0,.45));';
    document.body.appendChild(c);
    let x = 1280, y = 720, tx = x, ty = y;
    window.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
    const tick = () => {
      x += (tx - x) * 0.22; y += (ty - y) * 0.22;
      c.style.transform = `translate3d(${x}px,${y}px,0)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return { browser, context, page };
}

async function startCapture(page, name) {
  const dir = path.join(RAW, 'frames', name);
  fs.mkdirSync(dir, { recursive: true });
  const client = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0;
  client.on('Page.screencastFrame', async (e) => {
    const file = path.join(dir, String(n).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(e.data, 'base64'));
    frames.push({ file, ts: e.metadata.timestamp });
    n += 1;
    await client.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 });
  return {
    async stop() {
      await sleep(250);
      await client.send('Page.stopScreencast').catch(() => {});
      fs.writeFileSync(path.join(RAW, name + '.json'), JSON.stringify(frames, null, 2));
      console.log('CAPTURED', name, frames.length, 'frames');
      await client.detach().catch(() => {});
    },
  };
}

async function move(page, x, y, steps = 30, wait = 300) {
  await page.mouse.move(x, y, { steps });
  await sleep(wait);
}
async function smoothScroll(page, dy, steps = 26, ms = 22) {
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(ms); }
}
async function clickText(page, text) {
  const loc = page.getByText(text, { exact: false }).first();
  const b = await loc.boundingBox();
  if (b) await move(page, b.x + b.width / 2, b.y + b.height / 2, 24, 250);
  await loc.click();
}
async function scene(name, fn) {
  const { browser, context, page } = await setup();
  const cap = await startCapture(page, name);
  try { await fn(page); } finally { await cap.stop(); await context.close(); await browser.close(); }
}

await scene('resume', async (page) => {
  await clickText(page, '我是信息管理与信息系统专业');
  await sleep(2400);
  await move(page, 1180, 740, 28, 500);
  await page.getByRole('button', { name: '查看简历' }).click().catch(() => {});
  await sleep(2800);
  await move(page, 1780, 600, 30, 900);
  await smoothScroll(page, 300, 24, 22);
  await sleep(1400);
  await move(page, 1260, 520, 26, 900);
  await sleep(900);
  await page.getByRole('button', { name: '关闭简历预览' }).click().catch(() => {});
  await sleep(1200);
});

await scene('memory', async (page) => {
  await page.getByRole('button', { name: '打开穗奈·忆迹场' }).first().click().catch(() => {});
  await sleep(3000);
  await move(page, 1000, 600, 30, 800);
  await smoothScroll(page, 260, 24, 22);
  await sleep(1000);
  await move(page, 1400, 700, 28, 800);
  await sleep(1000);
  await smoothScroll(page, -120, 16, 22);
  await sleep(1400);
});

