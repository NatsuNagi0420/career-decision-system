/** 青穗集 · 登录入口验收：本机Chrome、真实穗奈素材、模拟表单边界与真实账号登录，禁止触发业务任务和云模型。 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const OUT = resolve(process.argv[3] || '../logs/login-refresh-browser');
const USER = process.env.LOGIN_TEST_USER;
const PASSWORD = process.env.LOGIN_TEST_PASSWORD;
mkdirSync(OUT, { recursive: true });
const checks = [], errors = [], blockedWrites = [], formAttempts = [], failedAssets = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let succeeded = false, failure = null, realLogin = null;
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
  await ctx.route('**/api/v1/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' || ['/api/v1/auth/login', '/api/v1/auth/logout'].includes(pathname)) { await route.continue(); return; }
    blockedWrites.push(request.method() + ' ' + pathname);
    await route.fulfill({ status: 409, json: { detail: '登录验收禁止创建业务任务或修改账号资料。' } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/api/')) failedAssets.push({ url: response.url(), status: response.status() }); });
  return { ctx, page };
}
async function ready(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.login-art .suinai-motion-character[data-status="ready"]').waitFor();
  await page.waitForFunction(() => document.querySelector('.login-art canvas')?.dataset.renderer === 'canvas-continuous-mesh');
  await page.evaluate(() => document.fonts.ready);
}
async function layout(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ': no horizontal overflow');
  for (const id of ['username', 'password']) {
    assert.equal(await page.locator('#' + id).isVisible(), true);
    const rect = await page.locator('#' + id).boundingBox();
    assert.ok(rect && rect.width >= 170, name + ': usable input width');
  }
  assert.equal(await page.locator('.login-art').isVisible(), true, name + ': new character is not hidden on mobile');
  assert.equal(await page.locator('.suinai-portrait').count(), 0);
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: true });
}
try {
  for (const vp of [
    { width: 3840, height: 2160, label: "4k" },
    { width: 2560, height: 1440, label: "large-scaled" },
    { width: 1440, height: 900, label: 'desktop' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 390, height: 844, label: 'mobile' },
    { width: 320, height: 680, label: 'small-mobile' },
    { width: 1280, height: 650, label: 'short-desktop' },
  ]) {
    const { ctx, page } = await context({ viewport: { width: vp.width, height: vp.height } });
    await ready(page);
    await layout(page, '01-login-' + vp.label);
    assert.equal(await page.locator('.login-art__motion').isDisabled(), true);
    assert.equal(await page.locator('.login-art canvas').getAttribute('data-motion'), 'off');
    assert.equal(await page.locator('.login-footer a').getAttribute('href'), '?preview=suinai-motion');
    await page.getByRole('button', { name: '第一次来？创建账号', exact: true }).click();
    assert.equal(await page.locator('#consent').isChecked(), false);
    assert.equal(await page.locator('#password').getAttribute('autocomplete'), 'new-password');
    await layout(page, '02-register-' + vp.label);
    checks.push(vp.label + ': login, registration, real character, default consent off, reduced motion, no overflow');
    await ctx.close();
  }
  {
    const { ctx, page } = await context({ reducedMotion: 'no-preference' });
    await ready(page);
    await page.waitForFunction(() => Number(document.querySelector('.login-art canvas')?.dataset.actionTime) > .75);
    assert.equal(await page.locator('.login-art canvas').getAttribute('data-action'), 'A01');
    await page.screenshot({ path: join(OUT, '03-welcome-wave.png') });
    await page.waitForFunction(() => document.querySelector('.login-art canvas')?.dataset.action === 'A02');
    await page.getByRole('button', { name: '暂停穗奈动画', exact: true }).click();
    await page.waitForTimeout(120);
    const paused = await page.locator('.login-art canvas').getAttribute('data-frame');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.login-art canvas').getAttribute('data-frame'), paused);
    assert.equal(await page.evaluate(() => localStorage.getItem('career.suinai.motion')), '0');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.login-art .suinai-motion-character[data-status="ready"]').waitFor();
    assert.equal(await page.getByRole('button', { name: '播放穗奈动画', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '播放穗奈动画', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.login-art canvas')?.dataset.motion === 'on');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '系统已减少动态', exact: true }).waitFor();
    assert.equal(await page.locator('.login-art__motion').isDisabled(), true);
    checks.push('Real motion: greeting settles into idle; pause persists; resume and live reduced-motion changes work');
    await ctx.close();
  }
  {
    const { ctx, page } = await context({ reducedMotion: 'no-preference' });
    await ctx.addInitScript(() => localStorage.setItem('career.motion', '0'));
    await ready(page);
    assert.equal(await page.getByRole('button', { name: '全站动画已暂停', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('.login-art canvas').getAttribute('data-motion'), 'off');
    checks.push('Global pause preference also prevents login animation');
    await ctx.close();
  }
  {
    const { ctx, page } = await context();
    await ctx.route('**/api/v1/auth/login', async route => {
      formAttempts.push({ mode: 'login', simulated: true });
      await new Promise(resolve => setTimeout(resolve, 200));
      await route.fulfill({ status: 401, json: { detail: '用户名或密码不对。' } });
    });
    await ctx.route('**/api/v1/auth/register', async route => {
      const body = route.request().postDataJSON();
      formAttempts.push({ mode: 'register', simulated: true, external_ai_consent: body.external_ai_consent });
      await route.fulfill({ status: 400, json: { detail: '验收用：没有创建真实账号。' } });
    });
    await ready(page);
    await page.locator('#username').fill('login_validation_fixture');
    await page.locator('#password').fill('not-a-real-password');
    await page.getByRole('button', { name: '进入我的桌面', exact: false }).click();
    await page.getByRole('alert').filter({ hasText: '用户名或密码不对。' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('career.session.token')), null);
    await page.getByRole('button', { name: '第一次来？创建账号', exact: true }).click();
    await page.getByRole('button', { name: '创建桌面', exact: false }).click();
    await page.getByRole('alert').filter({ hasText: '验收用：没有创建真实账号。' }).waitFor();
    assert.equal(formAttempts.at(-1).external_ai_consent, false);
    await page.locator('#consent').check();
    await page.getByRole('button', { name: '创建桌面', exact: false }).click();
    await page.waitForFunction(() => !document.querySelector('.auth__submit')?.disabled);
    assert.equal(formAttempts.at(-1).external_ai_consent, true);
    checks.push('SIMULATED API: bad credentials shown, no token fabricated, registration consent sent only as explicitly selected');
    await ctx.close();
  }
  assert.ok(USER && PASSWORD, 'Provide LOGIN_TEST_USER and LOGIN_TEST_PASSWORD for the real-service login check');
  {
    const { ctx, page } = await context({ reducedMotion: 'no-preference' });
    const preflightResponse = await ctx.request.post(BASE + '/api/v1/auth/login', { data: { username: USER, password: PASSWORD } });
    assert.equal(preflightResponse.status(), 200);
    const preflight = await preflightResponse.json();
    let uiToken = null;
    try {
      const nextResponse = await ctx.request.get(BASE + '/api/v1/continuations', { headers: { Authorization: 'Bearer ' + preflight.token } });
      assert.equal(nextResponse.status(), 200);
      const next = await nextResponse.json();
      assert.equal(next.obligation, null, 'Avoid auto-starting an existing due business obligation during login verification');
      await ready(page);
      await page.locator('#username').fill(USER);
      await page.locator('#password').fill(PASSWORD);
      const responseReady = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login' && response.request().method() === 'POST');
      await page.getByRole('button', { name: '进入我的桌面', exact: false }).click();
      const response = await responseReady;
      assert.equal(response.status(), 200);
      const session = await response.json();
      realLogin = { username: session.user.username, status: response.status(), external_ai_consent: session.user.external_ai_consent, noDueObligation: true };
      await page.locator('.app').waitFor();
      await page.locator('.desktop-taskbar__user').filter({ hasText: USER }).waitFor();
      await page.locator('.companion .suinai-motion-character[data-status="ready"]').waitFor();
      uiToken = await page.evaluate(() => localStorage.getItem('career.session.token'));
      assert.ok(uiToken);
      await page.screenshot({ path: join(OUT, '04-real-login-success.png') });
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('.app').waitFor();
      await page.locator('.desktop-taskbar__user').filter({ hasText: USER }).waitFor();
      await page.getByTitle('账号与授权', { exact: true }).click();
      await page.getByRole('button', { name: '退出登录', exact: false }).click();
      await page.getByRole('form', { name: '登录账号', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('career.session.token')), null);
      checks.push('REAL SERVICE: verified account signs in, formal character loads, reload stays signed in, logout returns to the new login page');
    } finally {
      for (const token of [uiToken, preflight.token].filter(Boolean)) {
        await ctx.request.post(BASE + '/api/v1/auth/logout', { headers: { Authorization: 'Bearer ' + token } });
      }
      await ctx.close();
    }
  }
  assert.deepEqual(blockedWrites, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedAssets, []);
  succeeded = true;
  console.log(checks.join('\n'));
} catch (error) {
  failure = { name: error.name, message: error.message };
  throw error;
} finally {
  writeFileSync(join(OUT, 'verification.json'), JSON.stringify({ succeeded, mode: 'Installed Google Chrome; real character assets; form error/consent checks use mocked API; final account login uses the real local service; no business runs or model calls', checks, realLogin, formAttempts, blockedWrites, errors, failedAssets, failure }, null, 2), 'utf8');
  await browser.close();
}
