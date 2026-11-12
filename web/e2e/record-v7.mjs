import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TOKEN = fs.readFileSync('D:/Project/career-decision-system/tmp/token3.txt', 'utf8').trim();
const ROOT = 'D:/Project/career-decision-system/video/09_重录';
const RAW = path.join(ROOT, 'raw');
fs.mkdirSync(RAW, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
  });
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
    const ring = document.createElement('div');
    ring.id = '__demo_click';
    ring.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;border-radius:50%;border:2px solid rgba(182,255,59,.9);opacity:0;z-index:2147483646;pointer-events:none;transform:translate3d(0,0,0);';
    document.body.appendChild(ring);
    let x = 1280, y = 720, tx = x, ty = y;
    window.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
    window.addEventListener('mousedown', () => {
      ring.style.opacity = '1';
      ring.style.transition = 'none';
      ring.style.transform = `translate3d(${x - 17}px,${y - 17}px,0) scale(.5)`;
      requestAnimationFrame(() => {
        ring.style.transition = 'transform .45s ease-out, opacity .45s ease-out';
        ring.style.transform = `translate3d(${x - 17}px,${y - 17}px,0) scale(1.6)`;
        ring.style.opacity = '0';
      });
    });
    const tick = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
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
  await client.send('Page.startScreencast', {
    format: 'jpeg', quality: 92, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1,
  });
  return {
    dir,
    async stop() {
      await sleep(250);
      await client.send('Page.stopScreencast').catch(() => {});
      fs.writeFileSync(path.join(RAW, name + '.json'), JSON.stringify(frames, null, 2));
      console.log('CAPTURED', name, frames.length, 'frames', ((frames.at(-1)?.ts - frames[0]?.ts) || 0).toFixed(2) + 's');
      await client.detach().catch(() => {});
    },
  };
}

async function move(page, x, y, steps = 30, wait = 300) {
  await page.mouse.move(x, y, { steps });
  await sleep(wait);
}
async function smoothScroll(page, dy, steps = 30, ms = 22) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(ms);
  }
}
async function clickText(page, text, last = false) {
  const loc = last ? page.getByText(text, { exact: false }).last() : page.getByText(text, { exact: false }).first();
  const b = await loc.boundingBox();
  if (b) await move(page, b.x + b.width / 2, b.y + b.height / 2, 24, 250);
  await loc.click();
}

async function scene(name, fn) {
  const { browser, context, page } = await setup();
  const cap = await startCapture(page, name);
  try {
    await fn(page);
  } finally {
    await cap.stop();
    await context.close();
    await browser.close();
  }
}

// 01: home, calm
await scene('home', async (page) => {
  await move(page, 1260, 760, 40, 900);
  await move(page, 820, 680, 35, 1000);
  await move(page, 700, 500, 35, 900);
  await move(page, 1280, 760, 35, 800);
  await sleep(1800);
});

// 02: chat
await scene('chat', async (page) => {
  await clickText(page, '我是信息管理与信息系统专业');
  await sleep(2600);
  await move(page, 1280, 720, 30, 700);
  await smoothScroll(page, 520, 32, 20);
  await sleep(1000);
  await move(page, 900, 500, 30, 600);
  await smoothScroll(page, -220, 20, 22);
  await sleep(1000);
  await move(page, 1500, 600, 25, 700);
  await sleep(1200);
});

// 03: profile confirm / workbench
await scene('profile', async (page) => {
  await clickText(page, '我是信息管理与信息系统专业');
  await sleep(2400);
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 140);
    els.forEach(e => { e.scrollTop = e.scrollHeight; });
  });
  await sleep(1600);
  const confirm = page.getByRole('button', { name: '确认更新' }).last();
  const b = await confirm.boundingBox();
  if (b) await move(page, b.x + b.width / 2, b.y + b.height / 2, 28, 500);
  await sleep(700);
  await confirm.click().catch(() => {});
  await sleep(2600);
  await move(page, 900, 760, 25, 600);
  await clickText(page, '职业工作台');
  await sleep(2200);
  await move(page, 1180, 700, 30, 900);
});

// 04: comparison
await scene('comparison', async (page) => {
  await clickText(page, '职业工作台');
  await sleep(1800);
  await page.getByRole('tab', { name: '方向与岗位' }).click();
  await sleep(2200);
  await move(page, 1280, 700, 30, 700);
  await smoothScroll(page, 430, 30, 22);
  await sleep(900);
  await move(page, 1000, 560, 30, 700);
  await smoothScroll(page, 300, 24, 22);
  await sleep(1200);
  await move(page, 1500, 700, 30, 600);
  await sleep(1200);
});

// 05: action
await scene('action', async (page) => {
  await clickText(page, '职业工作台');
  await sleep(1600);
  await page.getByRole('tab', { name: '成长行动' }).click();
  await sleep(2200);
  await move(page, 1280, 740, 30, 700);
  await smoothScroll(page, 260, 24, 22);
  await sleep(1000);
  const d = page.getByText('查看或补充我的结果').first();
  const b = await d.boundingBox();
  if (b) await move(page, b.x + b.width / 2, b.y + b.height / 2, 28, 500);
  await sleep(600);
  await d.click();
  await sleep(1800);
  await smoothScroll(page, 180, 20, 22);
  await sleep(1000);
  await page.keyboard.press('Escape');
  await sleep(900);
  await clickText(page, '我是信息管理与信息系统专业');
  await sleep(2400);
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 140);
    els.forEach(e => { e.scrollTop = e.scrollHeight; });
  });
  await sleep(1600);
  const exp = page.getByText('查看逐项对照').last();
  const eb = await exp.boundingBox();
  if (eb) await move(page, eb.x + eb.width / 2, eb.y + eb.height / 2, 28, 500);
  await sleep(600);
  await exp.click().catch(() => {});
  await sleep(1800);
  await smoothScroll(page, 140, 18, 22);
  await sleep(1000);
  const cf = page.getByRole('button', { name: '确认更新' }).last();
  const cb = await cf.boundingBox();
  if (cb) await move(page, cb.x + cb.width / 2, cb.y + cb.height / 2, 26, 500);
  await sleep(600);
  await cf.click().catch(() => {});
  await sleep(2200);
});

// 06: resume
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

// 07: memory
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

