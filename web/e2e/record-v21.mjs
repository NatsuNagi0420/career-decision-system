import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Fresh, real UI capture. Start npm run dev with AGENT_DATA_DIR set to the v21 demo-agent directory.
const ROOT = 'D:/Project/career-decision-system';
const OUT = path.join(ROOT, 'video/21_青穗集操作叙事版/capture');
const RAW = path.join(OUT, 'raw');
const token = fs.readFileSync(path.join(ROOT, 'tmp/token3.txt'), 'utf8').trim();
fs.mkdirSync(RAW, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function cursor(page) {
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'capture-cursor';
    el.innerHTML = '<svg width="24" height="29" viewBox="0 0 24 29"><path d="M2 2v22l6-6 4 9 4-2-4-9h9z" fill="#fff" stroke="#47396a" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate3d(960px,540px,0);filter:drop-shadow(0 1px 3px #54446c80)';
    document.body.appendChild(el);
    window.addEventListener('mousemove', e => { el.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)'; });
  });
}

async function setup() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } } });
  const page = await context.newPage();
  const origin = Date.now();
  await page.addInitScript(value => {
    localStorage.setItem('career.session.token', value);
    localStorage.setItem('suinai.onboarding.v1.local.3', 'completed');
  }, token);
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4300);
  if (!(await page.locator('body').innerText()).includes('服务已连接')) throw new Error('Local Agent is not connected');
  await cursor(page);
  return { context, page, origin };
}

async function clickVisible(page, locator, steps = 18) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Clickable element has no bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  await page.waitForTimeout(160);
  await locator.click();
}

async function scroll(page, delta, steps = 5) {
  for (let n = 0; n < steps; n++) {
    await page.mouse.wheel(0, delta / steps);
    await page.waitForTimeout(250);
  }
}

async function scene(name, prepare, action) {
  const { context, page, origin } = await setup();
  let source;
  try {
    await prepare(page);
    const start = (Date.now() - origin) / 1000;
    await action(page);
    const elapsed = (Date.now() - origin) / 1000 - start;
    if (elapsed < 9) await page.waitForTimeout((9 - elapsed) * 1000);
    const duration = (Date.now() - origin) / 1000 - start;
    await page.screenshot({ path: path.join(OUT, name + '-end.png') });
    const video = page.video();
    await context.close();
    source = await video.path();
    const dest = path.join(OUT, name + '.mp4');
    const result = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, start - 0.15)), '-i', source,
      '-t', String(Math.min(14.5, duration + 0.3)), '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', dest], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('ffmpeg: ' + result.stderr);
    const rawDest = path.join(RAW, name + '.webm');
    if (fs.existsSync(rawDest)) fs.unlinkSync(rawDest);
    fs.renameSync(source, rawDest);
    console.log(JSON.stringify({ name, start, duration, dest }));
  } catch (error) {
    await context.close().catch(() => {});
    console.error('FAILED', name, error.message);
    throw error;
  }
}

const selected = new Set(process.argv.slice(2).filter(arg => !arg.startsWith('-')));
const wants = name => selected.size === 0 || selected.has(name);
try {
  if (wants('chat-history-operation')) await scene('chat-history-operation', async () => {}, async page => {
    await clickVisible(page, page.getByText('我是信息管理与信息系统专业，2027 届。做过校园二手交易平台后', { exact: false }).first());
    await page.waitForTimeout(700);
    await clickVisible(page, page.getByRole('button', { name: '关闭简历预览' }));
    await page.waitForTimeout(300);
    await page.mouse.move(900, 515, { steps: 20 });
    await scroll(page, -1300, 6);
    await page.waitForTimeout(600);
    await scroll(page, -650, 4);
  });

  if (wants('job-evidence-operation')) await scene('job-evidence-operation', async page => {
    await page.getByText('职业工作台', { exact: false }).first().click();
    await page.waitForTimeout(600);
  }, async page => {
    await clickVisible(page, page.getByRole('tab', { name: '方向与岗位' }));
    await page.waitForTimeout(650);
    await clickVisible(page, page.getByText('查看岗位原文', { exact: true }).first());
    await page.waitForTimeout(650);
    await page.mouse.move(1060, 640, { steps: 15 });
    await scroll(page, 380, 4);
    await page.waitForTimeout(400);
    await clickVisible(page, page.getByText('查看岗位原文', { exact: true }).first());
    await page.waitForTimeout(250);
    await page.mouse.move(1140, 650, { steps: 15 });
    await scroll(page, 440, 5);
    await page.waitForTimeout(700);
  });

  if (wants('resume-operation')) await scene('resume-operation', async page => {
    await page.getByText('我是信息管理与信息系统专业，2027 届。做过校园二手交易平台后', { exact: false }).first().click();
    await page.waitForTimeout(750);
  }, async page => {
    await clickVisible(page, page.getByRole('button', { name: '简历编辑与导出' }));
    await page.waitForTimeout(450);
    await clickVisible(page, page.getByRole('button', { name: '调整内容' }));
    await page.waitForTimeout(450);
    const bullets = page.getByRole('textbox', { name: '要点 1', exact: true });
    const values = await bullets.evaluateAll(nodes => nodes.map(node => node.value));
    const projectIndex = values.findIndex(value => value.includes('负责商品发布、搜索和订单接口'));
    if (projectIndex < 0) throw new Error('The confirmed project bullet was not found');
    await clickVisible(page, bullets.nth(projectIndex));
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('与两位同学协作完成校园二手交易平台后端，负责商品发布、搜索和订单接口。', { delay: 35 });
    await page.waitForTimeout(450);
    await clickVisible(page, page.getByRole('button', { name: '保存并看 A4 预览' }));
    await page.waitForTimeout(1100);
  });
} finally {
  await browser.close();
}
