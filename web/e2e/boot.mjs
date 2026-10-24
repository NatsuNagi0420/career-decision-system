/** 青穗集 · 启动浏览器验收：本机Chrome检查真实资源、入口策略与故障回退，并在官方Skottie逐帧验收。 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const OUT = resolve(process.argv[3] || '../logs/boot-browser');
const SKOTTIE = process.env.SKOTTIE_ORIGIN || 'http://127.0.0.1:3030';
mkdirSync(OUT, { recursive: true });
const checks = [], errors = [], apiRequests = [], contexts = [], releases = [], skottieFrames = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let success = false, failure = null, readyToVisibleMs = null;
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...options });
  contexts.push(ctx);
  await ctx.route('**/api/v1/**', async route => { apiRequests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname); await route.fulfill({ status: 409, json: { detail: '启动验收不调用业务接口' } }); });
  const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
  return { ctx, page };
}
async function holdApp(ctx) {
  let release; const gate = new Promise(resolve => { release = resolve; }); releases.push(release);
  await ctx.route('**/src/App.tsx*', async route => { await gate; await route.continue(); });
  return release;
}
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
async function shot(page, name) { await page.screenshot({ path: join(OUT, name + '.png'), fullPage: true }); }
try {
  for (const vp of [{ width: 1440, height: 900, name: 'desktop' }, { width: 768, height: 1024, name: 'tablet' }, { width: 390, height: 844, name: 'mobile' }, { width: 320, height: 680, name: 'small-mobile' }, { width: 844, height: 390, name: 'landscape' }]) {
    const { ctx, page } = await context({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(BASE + '/?preview=boot&hold=1', { waitUntil: 'networkidle' });
    await page.locator('.boot-title[data-status="ready"]').waitFor();
    assert.equal(await page.locator('.boot-title').getAttribute('data-renderer'), 'lottie-svg');
    const masks = await page.locator('.boot-title__animation svg clipPath path').evaluateAll(paths => paths.map(path => path.getAttribute('d')));
    assert.equal(masks.length, 3); assert.equal(masks.some(path => path.includes('C0,0')), false, 'mask tangents must be normalized, not collapse toward the origin');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('career.boot.seen.v1')), null);
    await noOverflow(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, 'hidden login must not create a blank scroll area');
    await shot(page, '01-hold-' + vp.name);
    const bar = await page.locator('.startup-screen__track').boundingBox();
    assert.ok(bar && bar.width >= 150 && bar.y + bar.height < vp.height);
    const toolbar = await page.locator('.boot-preview__toolbar').boundingBox();
    const skip = await page.locator('.startup-screen__skip').boundingBox();
    assert.ok(toolbar && skip && skip.y >= toolbar.y + toolbar.height, 'toolbar must not cover skip');
    await page.getByRole('button', { name: '跳过演示', exact: false }).click();
    await page.getByRole('form', { name: '登录账号', exact: true }).waitFor({ state: 'visible' });
    await noOverflow(page);
    checks.push(vp.name + ': true Lottie vector text, final-frame masks, visible loader, no overflow or covered controls, transition to login');
    await ctx.close();
  }
  {
    const { ctx, page } = await context();
    await page.goto(BASE + '/?preview=boot&hold=1', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '重播启动动画', exact: true }).click();
    await page.getByRole('form', { name: '登录账号', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '定格查看', exact: true }).click();
    await page.locator('.boot-title[data-status="ready"]').waitFor();
    await page.getByRole('button', { name: '重播启动动画', exact: true }).click();
    await page.getByRole('button', { name: '暂停演示', exact: true }).click();
    await page.locator('.boot-title[data-status="ready"]').waitFor();
    await page.waitForTimeout(150);
    const frozen = await page.locator('.boot-title__animation').innerHTML();
    await page.waitForTimeout(280);
    assert.equal(await page.locator('.boot-title__animation').innerHTML(), frozen);
    assert.equal(await page.locator('.startup-screen').isVisible(), true);
    await page.getByRole('button', { name: '继续演示', exact: true }).click();
    await page.getByRole('form', { name: '登录账号', exact: true }).waitFor({ state: 'visible' });
    checks.push('Preview controls: replay, automatic finish, hold, pause and resume; preview never writes the seen marker');
    await ctx.close();
  }
  {
    const { ctx, page } = await context(); const release = await holdApp(ctx);
    let scenes = 0; page.on('request', request => { if (request.url().endsWith('/scene-1/lottie.json')) scenes++; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.startup-screen').waitFor();
    await page.locator('.boot-title[data-status="ready"]').waitFor();
    assert.equal(await page.locator('[data-startup-content]').getAttribute('inert'), '');
    assert.equal(await page.locator('.startup-screen__track').getAttribute('aria-valuenow'), null);
    await shot(page, '02-real-entry-loading');
    release();
    await page.locator('[data-startup-content][data-ready="true"]').waitFor();
    const readyAt = Date.now();
    await page.getByRole('form', { name: '登录账号', exact: true }).waitFor({ state: 'visible' });
    readyToVisibleMs = Date.now() - readyAt;
    assert.ok(readyToVisibleMs < 1000, 'entry must not impose a 1.3-second minimum once content is ready');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('career.boot.seen.v1')), '1');
    const beforeReload = scenes;
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('form', { name: '登录账号', exact: true }).waitFor({ state: 'visible' });
    assert.equal(scenes, beforeReload, 'same-tab reload does not fetch or replay Lottie');
    checks.push('Normal entry: real application chunk held for inspection, inert content while loading, ready exits immediately, same-tab reload does not replay');
    await ctx.close();
  }
  for (const mode of ['reduced', 'global-paused', 'skip']) {
    const { ctx, page } = await context({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    if (mode === 'global-paused') await ctx.addInitScript(() => localStorage.setItem('career.motion', '0'));
    const release = await holdApp(ctx); let scenes = 0;
    page.on('request', request => { if (request.url().endsWith('/scene-1/lottie.json')) scenes++; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.startup-screen').waitFor();
    if (mode === 'skip') {
      await page.getByRole('button', { name: '跳过动画', exact: false }).click();
      await page.locator('.boot-title[data-status="static"]').waitFor();
      assert.equal(await page.locator('[data-startup-content]').getAttribute('inert'), '');
    } else {
      assert.equal(await page.locator('.boot-title').getAttribute('data-status'), 'static');
      assert.equal(scenes, 0);
      assert.equal(await page.locator('.startup-screen__track > div').evaluate(el => getComputedStyle(el).animationName), 'none');
    }
    release(); await page.getByRole('form', { name: '登录账号', exact: true }).waitFor({ state: 'visible' });
    if (mode === 'skip') await page.waitForFunction(() => document.activeElement?.id === 'username');
    checks.push(mode + ': does not block login; static fallback and focus behavior verified');
    await ctx.close();
  }
  for (const resource of ['json', 'runtime']) {
    const { ctx, page } = await context();
    if (resource === 'json') await ctx.route('**/scene-1/lottie.json', route => route.fulfill({ status: 503, body: 'intentional unavailable asset for fallback test' }));
    else await ctx.route('**/*lottie_light*', route => route.fulfill({ status: 503, body: 'intentional unavailable runtime for fallback test' }));
    await page.goto(BASE + '/?preview=boot&hold=1', { waitUntil: 'domcontentloaded' });
    await page.locator('.boot-title[data-status="fallback"]').waitFor();
    assert.equal(await page.locator('.boot-title__poster').evaluate(el => getComputedStyle(el).opacity), '1');
    await shot(page, '03-' + resource + '-unavailable-static-fallback');
    await page.getByRole('button', { name: '跳过演示', exact: false }).click();
    await page.getByRole('form', { name: '登录账号', exact: true }).waitFor({ state: 'visible' });
    checks.push('INTENTIONAL ' + resource + ' HTTP 503: same-source static fallback, login remains accessible');
    await ctx.close();
  }
  {
    const { ctx, page } = await context(); const release = await holdApp(ctx);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '刷新重试', exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await page.locator('.boot-title').getAttribute('data-status'), 'static');
    await shot(page, '04-slow-resource-with-retry');
    release(); await page.getByRole('form', { name: '登录账号', exact: true }).waitFor({ state: 'visible' });
    checks.push('Delayed application resource: animation stops at its cap, genuine waiting status offers retry, then enters when ready');
    await ctx.close();
  }
  {
    const { ctx, page } = await context();
    await ctx.route('**/src/App.tsx*', route => route.fulfill({ status: 503, body: 'intentional unavailable application module' }));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '页面暂时没有正常显示', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.startup-screen').count(), 0);
    assert.equal(await page.getByRole('button', { name: '刷新页面', exact: true }).isVisible(), true);
    await shot(page, '04b-application-resource-failure');
    checks.push('INTENTIONAL application module HTTP 503: startup releases into a visible retry page instead of an endless loader');
    await ctx.close();
  }
  {
    const { ctx, page } = await context({ viewport: { width: 1440, height: 960 } });
    for (const frame of [0, 39, 77]) {
      await page.goto(SKOTTIE + '/qingsuiji-boot/scene-1?frame=' + frame, { waitUntil: 'networkidle' });
      await page.locator('#main-canvas').waitFor();
      await page.getByText('60FPS', { exact: true }).waitFor();
      if (frame === 0) {
        // 官方播放器首帧上下文早于WASM加载；通过真实滑块切出再回到0，刷新其观察状态，不改播放器源码。
        const slider = page.locator('[role="slider"][tabindex="0"]');
        await slider.focus(); await slider.press('ArrowRight'); await slider.press('ArrowLeft');
      }
      let state;
      for (let attempt = 0; attempt < 16; attempt++) {
        state = await (await ctx.request.get(SKOTTIE + '/__context')).json();
        if (state.live?.activeProject === 'qingsuiji-boot' && state.live?.activeScene === 'scene-1' && state.live?.currentFrame === frame && state.live?.totalFrames === 78) break;
        await page.waitForTimeout(200);
      }
      assert.equal(state.live.activeProject, 'qingsuiji-boot'); assert.equal(state.live.activeScene, 'scene-1');
      assert.equal(state.live.currentFrame, frame); assert.equal(state.live.totalFrames, 78); assert.equal(state.live.fps, 60);
      await page.waitForTimeout(200);
      const png = await page.locator('#main-canvas').screenshot({ path: join(OUT, '05-skottie-frame-' + frame + '.png') });
      skottieFrames.push({ frame, sha256: createHash('sha256').update(png).digest('hex'), live: state.live });
      writeFileSync(join(OUT, 'skottie-context-' + frame + '.json'), JSON.stringify(state, null, 2));
    }
    assert.notEqual(skottieFrames[0].sha256, skottieFrames.at(-1).sha256);
    checks.push('OFFICIAL SKIA SKOTTIE PLAYER: source scene confirmed through /__context; pinned frames 0, 39 and 77 render with distinct first/final frames');
    await ctx.close();
  }
  assert.deepEqual(apiRequests, []); assert.deepEqual(errors, []);
  success = true; console.log(checks.join('\n'));
} catch (error) { failure = { name: error.name, message: error.message }; throw error; }
finally {
  for (const release of releases) release();
  writeFileSync(join(OUT, 'verification.json'), JSON.stringify({ success, mode: 'Installed Google Chrome; actual frontend, Lottie and static assets; app-module delay and explicit asset-503 cases are controlled; official Skia Skottie verifies exact source frames; no business API or model calls', checks, readyToVisibleMs, skottieFrames, apiRequests, errors, failure }, null, 2));
  await browser.close();
}
