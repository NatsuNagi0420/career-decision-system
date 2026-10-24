/** 青穗集 · 正式陪伴浏览器验收：受控API/SSE与真实素材验证任务联动；使用本机Chrome，不调用云模型。 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const OUT = resolve(process.argv[3] || fileURLToPath(new URL('../../logs/suinai-main-integration/browser/', import.meta.url)));
mkdirSync(OUT, { recursive: true });
const checks = [], errors = [], requests = [], observed = [], runs = new Map();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference' });
let capability = 'profile_diagnose', serial = 0, failCreate = false, failManifest = false;
const usage = { prompt: 0, completion: 0, reasoning: 0, cached: 0 };
function publish(run, frames) {
  for (const payload of frames) run.events.push({ run_id: run.id, thread_id: 't-' + run.id, event_id: run.id + '-e' + run.events.length,
    seq: run.events.length, occurred_at: '2026-10-19T13:00:00Z', ...payload });
  for (const notify of run.waiters.splice(0)) notify();
}
function artifact(run, type, status = 'draft') {
  return { id: 'a-' + run.id, run_id: run.id, artifact_type: type, title: '联动测试成果（模拟）', status, version: 1,
    data_coverage: 1, is_provisional: false, generation_mode: 'browser_stub', evidence_quotes: {}, source_refs: [], supersedes_id: null,
    content: type === 'ResumeDraft' ? { resume: { plain: '演示简历', sections: [{ key: 'education', title: '教育经历', empty: false, lines: [{ text: '测试大学（模拟）' }] }] } } : { conclusion: '联动模拟，不证明业务或模型质量。' } };
}
function createRun(goal) {
  const id = 'companion-stub-' + ++serial;
  const run = { id, events: [], waiters: [], streamFailure: false, snapshot: {
    run: { id, thread_id: 't-' + id, status: 'running', goal, capability_id: capability, risk_tier: 'R1', entry_point: 'user', model_used: null,
      steps_used: 1, usage, error: null, created_at: '2026-10-19T13:00:00Z', finished_at: null }, pending_approval_id: null, artifacts: [], proposals: [] } };
  runs.set(id, run); publish(run, [{ kind: 'run_started', goal, capability_id: capability }]); return run;
}
function awaitApproval(run) {
  run.snapshot.run.status = 'awaiting_approval'; run.snapshot.pending_approval_id = 'approval-' + run.id;
  run.snapshot.artifacts = [artifact(run, 'ProfileGapReport', 'pending_approval')];
  run.snapshot.proposals = [{ id: 'p-' + run.id, proposal_type: 'ProfileFactBatch', title: '保存测试画像', rationale: '仅测试确认流程', status: 'pending',
    payload: { facts: [{ dimension: 'skill', statement: '测试：会使用SQL' }] }, acceptance_criteria: [], source_refs: [], result: null, error: null }];
  publish(run, [{ kind: 'artifact_created', artifact_id: 'a-' + run.id, artifact_type: 'ProfileGapReport', title: '待核对画像', version: 1, is_provisional: false },
    { kind: 'proposal_created', proposal_id: 'p-' + run.id, proposal_type: 'ProfileFactBatch', title: '保存测试画像', rationale: '仅测试', risk_tier: 'R1', acceptance_criteria: [] },
    { kind: 'approval_required', approval_id: 'approval-' + run.id, proposal_id: 'p-' + run.id, expires_at: '2099-10-19T13:00:00Z' }]);
}
function finishApproval(run, approved) {
  run.snapshot.run.status = approved ? 'completed' : 'cancelled'; run.snapshot.pending_approval_id = null;
  run.snapshot.proposals[0].status = approved ? 'applied' : 'rejected'; run.snapshot.proposals[0].result = approved ? { count: 1 } : { feedback: '' };
  run.snapshot.artifacts[0].status = approved ? 'committed' : 'rejected';
  publish(run, [{ kind: 'approval_resolved', approval_id: 'approval-' + run.id, status: approved ? 'approved' : 'rejected' },
    { kind: 'run_completed', status: approved ? 'completed' : 'cancelled' }]);
}
await ctx.addInitScript(() => localStorage.setItem('career.session.token', 'companion-api-stub'));
await ctx.route('**/brand/suinai-motion-v03/manifest.json', async route => {
  if (failManifest) { return route.fulfill({ status: 503, body: 'asset retry test' }); }
  await route.continue();
});
await ctx.route('**/api/v1/**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  requests.push({ method: request.method(), path });
  const json = value => route.fulfill({ json: value });
  if (path.endsWith('/auth/me')) return json({ id: 1, username: '联动测试用户', external_ai_consent: false });
  if (path.endsWith('/capabilities')) return json([]);
  if (path.endsWith('/continuations')) return json({ obligation: null, reason: 'no_due_obligation' });
  if (path.endsWith('/feed')) return json({ runs: [...runs.values()].reverse().map(r => r.snapshot.run), projects: [], artifacts: [...runs.values()].flatMap(r => r.snapshot.artifacts), tasks: [], obligations: [], pending_approvals: [] });
  if (path.endsWith('/runs') && request.method() === 'POST') {
    if (failCreate) { failCreate = false; return route.fulfill({ status: 503, json: { detail: '模拟提交失败' } }); }
    const run = createRun(request.postDataJSON().goal); return route.fulfill({ status: 202, json: { run_id: run.id } });
  }
  const id = /^\/api\/v1\/runs\/([^/]+)/.exec(path)?.[1], run = runs.get(id);
  if (!run) return route.fulfill({ status: 404, json: { detail: 'unexpected stub endpoint' } });
  if (path.endsWith('/decision')) { run.snapshot.run.status = 'running'; run.snapshot.pending_approval_id = null; return route.fulfill({ status: 202, json: { run_id: id } }); }
  if (path.endsWith('/events')) {
    if (run.streamFailure) return route.fulfill({ status: 503, body: 'simulated connection loss' });
    const after = Number(url.searchParams.get('after_seq') ?? -1);
    if (!run.events.some(frame => frame.seq > after)) await new Promise(resolve => run.waiters.push(resolve));
    try { return await route.fulfill({ headers: { 'Content-Type': 'text/event-stream' }, body: run.events.filter(frame => frame.seq > after).map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') }); }
    catch { return; /* Switching conversations intentionally aborts the old stream. */ }
  }
  return json(run.snapshot);
});
const page = await ctx.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
const companion = page.locator('#suinai-companion'), canvas = companion.locator('canvas');
async function waitAction(action) {
  await page.waitForFunction(action => document.querySelector('#suinai-companion canvas')?.dataset.action === action, action);
  observed.push({ action, phase: await companion.getAttribute('data-phase'), cue: await companion.getAttribute('data-cue') });
}
const shot = name => page.screenshot({ path: resolve(OUT, name + '.png'), fullPage: true });
async function send(cap, goal = '这是用于联动测试的输入') {
  capability = cap; const previous = serial;
  await page.locator('#composer').fill(goal); await page.getByTitle('交给穗奈', { exact: true }).click();
  await page.waitForFunction(old => document.querySelector('#suinai-companion')?.dataset.cue?.startsWith('companion-stub-' + (old + 1) + ':'), previous);
  return [...runs.values()].at(-1);
}
async function newConversation() {
  await page.getByRole('button', { name: '最近对话', exact: true }).click();
  await page.getByRole('button', { name: '新对话', exact: true }).click(); await waitAction('A02');
}
try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await companion.locator('.suinai-motion-character[data-status="ready"]').waitFor(); await waitAction('A02');
  assert.equal(await companion.locator('.suinai-portrait').count(), 0);
  const pixels = await canvas.evaluate(el => { const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  assert.ok(pixels > 100000, 'actual character alpha pixels: ' + pixels); await shot('01-main-idle');
  await page.locator('#composer').fill('我想先聊聊自己的经历'); await waitAction('A03');
  assert.equal(requests.filter(r => r.method === 'POST').length, 0);
  await page.waitForTimeout(650); await shot('02-listening'); assert.ok(Number(await canvas.getAttribute('data-action-time')) > .3);
  await page.locator('#composer').fill(''); await waitAction('A02');
  checks.push('Main page shows actual new character pixels; unsent input listens without API writes.');

  const profile = await send('profile_diagnose'); await waitAction('A09');
  await page.locator('#composer').fill('不会重复提交'); await page.locator('#composer').press('Enter');
  assert.equal(serial, 1, 'Enter while busy must not create a second run'); await page.locator('#composer').fill('');
  awaitApproval(profile); await waitAction('A37'); await shot('03-confirmation'); assert.match(await companion.textContent(), /你确认后/);
  await page.getByRole('button', { name: '采纳并写入', exact: true }).click();
  await page.waitForTimeout(100); assert.notEqual(await canvas.getAttribute('data-action'), 'A13');
  finishApproval(profile, true); await waitAction('A13'); await shot('04-confirmed-write');
  await waitAction('A02'); assert.equal(await companion.getAttribute('data-phase'), 'result');
  const key = await companion.getAttribute('data-cue');
  await page.getByRole('navigation', { name: '求职桌面应用' }).getByRole('button', { name: /我的档案/ }).click();
  await page.getByRole('navigation', { name: '求职桌面应用' }).getByRole('button', { name: /穗奈消息/ }).click();
  assert.equal(await companion.getAttribute('data-cue'), key); assert.equal(await canvas.getAttribute('data-action'), 'A02');
  checks.push('Profile processing -> approval -> server-applied write; one-shot settles and navigation does not replay success.');

  const resume = await send('resume_build', '帮我根据已确认的经历写简历'); await waitAction('A31'); await shot('05-resume-working');
  resume.snapshot.run.status = 'completed'; resume.snapshot.artifacts = [artifact(resume, 'ResumeDraft')];
  publish(resume, [{ kind: 'artifact_created', artifact_id: 'a-' + resume.id, artifact_type: 'ResumeDraft', title: '简历草稿', version: 1, is_provisional: false }, { kind: 'run_completed', status: 'completed' }]);
  await waitAction('A33'); assert.match(await companion.textContent(), /还没有导出文件/); await shot('06-resume-draft');
  await page.getByRole('button', { name: '暂停穗奈动画', exact: true }).click();
  await page.waitForTimeout(100); const pausedAt = await canvas.getAttribute('data-action-time');
  await page.waitForTimeout(350); assert.equal(await canvas.getAttribute('data-action-time'), pausedAt);
  await page.reload({ waitUntil: 'networkidle' }); await companion.locator('.suinai-motion-character[data-status="ready"]').waitFor();
  await page.getByRole('button', { name: '播放穗奈动画', exact: true }).waitFor(); await waitAction('A02');
  assert.equal(await page.evaluate(() => localStorage.getItem('career.suinai.motion')), '0');
  await page.getByRole('button', { name: '播放穗奈动画', exact: true }).click();
  await page.locator('#composer').fill('接下来我还有一个问题'); await waitAction('A03');
  await page.locator('#composer').fill(''); await waitAction('A02');
  checks.push('Resume is a draft, not an upload/export; pause freezes the clock, survives reload, and history never re-celebrates.');

  const declined = await send('profile_diagnose', '再整理一条需要确认的经历'); await waitAction('A09'); awaitApproval(declined); await waitAction('A37');
  await page.getByRole('button', { name: '拒绝', exact: true }).click(); finishApproval(declined, false);
  await page.waitForFunction(() => document.querySelector('#suinai-companion')?.dataset.phase === 'cancelled'); await waitAction('A02');
  assert.match(await companion.textContent(), /没有执行写入/); await shot('07-declined');
  const failed = await send('resume_build'); await waitAction('A31'); failed.snapshot.run.status = 'failed'; failed.snapshot.run.error = 'finalize: 模拟写入冲突';
  publish(failed, [{ kind: 'run_failed', error: failed.snapshot.run.error }]); await waitAction('A39'); assert.match(await companion.textContent(), /收尾写入/); await shot('08-task-failure');
  checks.push('Refusal is cancelled, not failed; actual failed events show concern and the real failure stage.');

  const disconnected = await send('job_match'); await waitAction('A14'); disconnected.streamFailure = true;
  await page.waitForFunction(() => document.querySelector('#suinai-companion .companion__status')?.textContent?.includes('连接暂时中断'), undefined, { timeout: 15000 });
  assert.equal(disconnected.snapshot.run.status, 'running'); assert.match(await companion.textContent(), /不代表后台任务已经失败/); await shot('09-disconnected');
  const postsBeforeReconnect = requests.filter(request => request.method === 'POST' && request.path.endsWith('/runs')).length;
  disconnected.streamFailure = false; disconnected.snapshot.run.status = 'completed'; disconnected.snapshot.artifacts = [artifact(disconnected, 'JobMatchReport')];
  publish(disconnected, [{ kind: 'run_completed', status: 'completed' }]);
  await page.getByRole('button', { name: '重新连接进度', exact: true }).click(); await waitAction('A15');
  assert.equal(requests.filter(request => request.method === 'POST' && request.path.endsWith('/runs')).length, postsBeforeReconnect);
  checks.push('Reconnect consumes existing progress without creating or charging for a new task.');
  await newConversation(); failCreate = true; await page.locator('#composer').fill('这次模拟提交失败'); await page.getByTitle('交给穗奈', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#suinai-companion .companion__status')?.textContent?.includes('提交尚未确认'));
  checks.push('SSE exhaustion is visible without inventing backend failure; an unacknowledged submission is distinct.');

  await newConversation(); const stale = await send('resume_build'); await waitAction('A31');
  await newConversation(); stale.snapshot.run.status = 'failed'; publish(stale, [{ kind: 'run_failed', error: 'late old run' }]);
  await page.waitForTimeout(400); await waitAction('A02'); assert.equal(await companion.getAttribute('data-phase'), 'idle');
  checks.push('Late events from an abandoned conversation cannot contaminate the current companion.');
  await page.getByRole('button', { name: '展开消息窗口', exact: true }).click();
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: /打开穗奈陪伴窗口/ }).waitFor(); assert.equal(await companion.isVisible(), false);
    await page.getByRole('button', { name: /打开穗奈陪伴窗口/ }).click(); await companion.waitFor({ state: 'visible' }); await waitAction('A02');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const box = await companion.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
    await shot('10-small-screen-' + width); await page.keyboard.press('Escape'); assert.equal(await companion.isVisible(), false);
    await page.waitForTimeout(100); const hiddenFrame = await canvas.getAttribute('data-frame'); await page.waitForTimeout(250);
    assert.equal(await canvas.getAttribute('data-frame'), hiddenFrame, 'hidden window must stop RAF');
  }
  await page.setViewportSize({ width: 1440, height: 960 }); await page.getByRole('button', { name: '还原消息窗口', exact: true }).click(); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '系统已减少动态', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: '系统已减少动态', exact: true }).isDisabled(), true);
  await page.waitForTimeout(150); const reducedFrame = await canvas.getAttribute('data-frame'); await page.waitForTimeout(250); assert.equal(await canvas.getAttribute('data-frame'), reducedFrame);
  await shot('11-reduced-motion'); await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('Tablet/mobile open/close without overflow; hidden and reduced-motion canvases stop repainting.');

  failManifest = true; await page.reload({ waitUntil: 'networkidle' });
  await companion.locator('.suinai-motion-character[data-status="error"]').waitFor(); await shot('12-asset-failure');
  await page.locator('#composer').fill('素材失败不阻止我输入'); assert.equal(await page.locator('#composer').inputValue(), '素材失败不阻止我输入');
  failManifest = false; await page.getByRole('button', { name: '重新加载素材', exact: true }).click(); await companion.locator('.suinai-motion-character[data-status="ready"]').waitFor();
  await waitAction('A03'); await shot('13-asset-recovered');
  checks.push('Asset failure stays inside the character, preserves input and can be retried.');
  assert.deepEqual(errors, []);
  writeFileSync(resolve(OUT, 'verification.json'), JSON.stringify({ mode: 'Controlled API/SSE stubs + actual assets in installed Chrome. Not a backend/model quality test.', checks, errors, requests, observed }, null, 2));
  console.log(checks.join('\n'));
} catch (error) {
  await shot('failure').catch(() => {});
  writeFileSync(resolve(OUT, 'failure.json'), JSON.stringify({ message: String(error), stack: error.stack, checks, errors, requests, observed }, null, 2)); throw error;
} finally {
  for (const run of runs.values()) for (const notify of run.waiters.splice(0)) notify();
  await ctx.close(); await browser.close();
}
