import { chromium } from 'playwright';
import fs from 'fs';

const token = fs.readFileSync('D:/Project/career-decision-system/tmp/token.txt', 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.addInitScript(t => localStorage.setItem('career.session.token', t), token);
await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const client = await context.newCDPSession(page);
let frames = [];
client.on('Page.screencastFrame', async (e) => {
  frames.push({ ts: e.metadata.timestamp, data: e.data, w: e.metadata.deviceWidth, h: e.metadata.deviceHeight });
  await client.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
});
await client.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 });
const t0 = Date.now();
await page.mouse.move(1200, 700, { steps: 30 });
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 180); await page.waitForTimeout(300); }
await page.waitForTimeout(1500);
await client.send('Page.stopScreencast');
console.log('frames', frames.length, 'elapsed', (Date.now() - t0) / 1000, 'first', frames[0]?.ts, 'last', frames[frames.length - 1]?.ts, 'size', frames[0]?.w, frames[0]?.h);
const diffs = [];
for (let i = 1; i < frames.length; i++) diffs.push((frames[i].ts - frames[i - 1].ts) * 1000);
console.log('dt median', diffs.sort((a,b)=>a-b)[Math.floor(diffs.length/2)], 'min', Math.min(...diffs), 'max', Math.max(...diffs));
fs.mkdirSync('D:/Project/career-decision-system/tmp/cdp-frames', { recursive: true });
for (let i = 0; i < Math.min(frames.length, 20); i++) fs.writeFileSync(`D:/Project/career-decision-system/tmp/cdp-frames/${String(i).padStart(4,'0')}.jpg`, Buffer.from(frames[i].data, 'base64'));
await browser.close();
