/** 青穗集 · 正式穗奈真实接口烟测：只在独立测试服务创建合成账号，验证画像确认与简历反馈，不调用云模型。 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://127.0.0.1:5197';
const OUT = resolve(process.argv[3] || fileURLToPath(new URL('../../logs/suinai-main-integration/live/', import.meta.url)));
mkdirSync(OUT, { recursive: true });
const username = 'companion_ui_' + Date.now();
const authResponse = await fetch(BASE + '/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password: 'test-only-' + randomBytes(16).toString('hex'), external_ai_consent: true }) });
const authText = await authResponse.text();
assert.equal(authResponse.status, 201, authResponse.ok ? "created" : authText);
const auth = JSON.parse(authText);
assert.equal(auth.user.external_ai_consent, true);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference' });
await ctx.addInitScript(token => {
  localStorage.setItem('career.session.token', token);
  window.__companionObserved = [];
  let last = '';
  new MutationObserver(() => {
    const panel = document.querySelector('#suinai-companion'), canvas = panel?.querySelector('canvas');
    if (!panel || !canvas) return;
    const phase = panel.dataset.phase, action = canvas.dataset.action, cue = panel.dataset.cue;
    const key = [phase, action, cue].join('|');
    if (key !== last) { last = key; window.__companionObserved.push({ phase, action, cue }); }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-phase', 'data-action'] });
}, auth.token);
const page = await ctx.newPage(); page.setDefaultTimeout(20000);
const errors = [], checks = [], snapshots = [];
page.on('pageerror', error => errors.push(error.message));
const panel = page.locator('#suinai-companion');
async function currentSnapshot() {
  const id = await page.evaluate(() => localStorage.getItem('career.lastRun'));
  const response = await fetch(BASE + '/api/v1/runs/' + id, { headers: { Authorization: 'Bearer ' + auth.token } });
  assert.equal(response.status, 200); const data = await response.json(); snapshots.push(data); return data;
}
async function send(goal) {
  await page.locator('#composer').fill(goal); await page.getByTitle('交给穗奈', { exact: true }).click();
}
async function shot(name) { await page.screenshot({ path: resolve(OUT, name + '.png'), fullPage: true }); }
try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await panel.locator('.suinai-motion-character[data-status="ready"]').waitFor();
  await send('先补我的经历和画像：我是一名计算机专业的应届生，会Python和SQL，做过校园活动报名数据清洗项目，负责清洗数据并统计报名人数。');
  await page.waitForFunction(() => document.querySelector('#suinai-companion')?.dataset.phase === 'confirmation');
  assert.equal(await panel.getAttribute('data-requested-action'), 'A37');
  const before = await currentSnapshot(); assert.equal(before.run.capability_id, 'profile_diagnose');
  assert.equal(before.run.status, 'awaiting_approval'); assert.ok(before.pending_approval_id);
  await shot('01-real-profile-confirmation');
  await page.getByRole('button', { name: '采纳并写入', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#suinai-companion .companion__status')?.textContent?.includes('本次画像信息已保存'));
  const confirmed = await currentSnapshot(); assert.equal(confirmed.run.status, 'completed');
  assert.ok(confirmed.proposals.some(proposal => proposal.status === 'applied' && proposal.result));
  await shot('02-real-profile-applied');
  checks.push('Actual registration/auth/API/SSE: profile facts require confirmation and only an applied server result reports saved.');
  await send('帮我根据现在已经确认的经历写一份简历，不要虚构经历和成果。');
  await page.waitForFunction(() => document.querySelector('#suinai-companion')?.dataset.phase === 'result');
  const resume = await currentSnapshot(); assert.equal(resume.run.capability_id, 'resume_build'); assert.equal(resume.run.status, 'completed');
  assert.ok(resume.artifacts.some(artifact => artifact.artifact_type === 'ResumeDraft' && artifact.content.resume));
  const action = await panel.getAttribute('data-requested-action'); assert.ok(['A33', 'A12'].includes(action)); assert.notEqual(action, 'A36');
  await shot('03-real-resume-result');
  checks.push('Actual resume draft reaches the existing template UI; companion reflects its verified/provisional state and does not claim file export.');
  const observed = await page.evaluate(() => window.__companionObserved);
  assert.ok(observed.some(cue => cue.phase === 'working'));
  assert.ok(observed.some(cue => cue.action === 'A37'));
  assert.ok(observed.some(cue => cue.action === 'A13'));
  assert.deepEqual(errors, []);
  writeFileSync(resolve(OUT, 'verification.json'), JSON.stringify({ mode: 'REAL isolated API/auth/SSE/database; scripted LOCAL model responses, synthetic account consent, NOT a cloud-model quality test', username, checks, errors, observed, snapshots }, null, 2));
  console.log(checks.join('\n'));
} catch (error) {
  await shot('failure').catch(() => {});
  await currentSnapshot().catch(() => {});
  writeFileSync(resolve(OUT, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, checks, errors, snapshots, observed: await page.evaluate(() => window.__companionObserved).catch(() => []) }, null, 2)); throw error;
} finally { await ctx.close(); await browser.close(); }
