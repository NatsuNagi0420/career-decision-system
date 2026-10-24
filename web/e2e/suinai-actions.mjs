/** 青穗集 · 穗奈v03浏览器验收：40场景实际像素、眼神裁剪、播放/打断/连播、移动端与失败重试；使用本机Chrome。 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const OUT = resolve(process.argv[3] || resolve(root, 'logs/suinai-actions-v03-20261019/browser'));
const pack = resolve(root, 'docs/品牌形象/Live2D原画/06-Cubism制作/穗奈_v03_动作与绑定包');
mkdirSync(OUT, { recursive: true });
const actions = JSON.parse(readFileSync(resolve(pack, 'action-map.json'), 'utf8')).motions;
const checks = [], errors = [], businessCalls = [], measurements = {};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1250 }, reducedMotion: 'no-preference' });
await context.route(url => url.pathname.startsWith('/api/'), route => { businessCalls.push(route.request().url()); return route.abort(); });
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const canvas = page.locator('.suinai-motion-character canvas');
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const waitAction = id => page.waitForFunction(id => document.querySelector('.suinai-motion-character canvas')?.dataset.action === id, id);
const pose = () => canvas.evaluate(element => ({ action: element.dataset.action, gesture: element.dataset.gesture, expression: element.dataset.expression,
  leftHand: element.dataset.leftHand, rightHand: element.dataset.rightHand, wrists: [JSON.parse(element.dataset.leftWrist), JSON.parse(element.dataset.rightWrist)], time: Number(element.dataset.actionTime) }));
const select = async id => { await page.locator(`button[data-action="${id}"]`).click(); await waitAction(id); };
const scrub = async fraction => {
  const slider = page.getByRole('slider', { name: '动作进度', exact: true });
  await slider.fill(String(fraction));
  await page.waitForFunction(value => document.querySelector('.suinai-motion-character canvas')?.dataset.motion === 'off' && Math.abs(Number(document.querySelector('#suinai-action-progress')?.value) - value) < .001, fraction);
};
try {
  await page.goto(BASE + '/?preview=suinai-motion');
  await page.locator('.suinai-motion-character[data-status="ready"]').waitFor();
  assert.equal(await page.locator('button[data-action]').count(), 40);
  const gestureView = await page.evaluate(async () => (await import('/src/character/suinaiMotion.ts')).GESTURE_VIEW);
  await page.getByRole('button', { name: '自动眨眼 · 开', exact: true }).click();
  for (const action of actions) {
    await select(action.id); await page.getByRole('button', { name: '动作高点', exact: true }).click();
    await page.waitForFunction(id => document.querySelector('canvas')?.dataset.action === id && document.querySelector('canvas')?.dataset.motion === 'off', action.id);
    const info = await pose();
    assert.ok(Math.abs(info.time - .42 * JSON.parse(readFileSync(resolve(pack, action.file), 'utf8')).Meta.Duration) < .006, `${action.id} exact seek`);
    const alpha = await canvas.evaluate((element, { points, view }) => {
      const [vx, vy, vw, vh] = view;
      const scale = Math.min(element.width / vw, element.height / vh), dx = (element.width - vw * scale) / 2, dy = (element.height - vh * scale) / 2;
      const ctx = element.getContext('2d');
      return points.map(([x, y]) => {
        const px = Math.round(dx + (x - vx) * scale), py = Math.round(dy + (y - vy) * scale);
        const pixels = ctx.getImageData(px - 22, py - 22, 44, 44).data;
        let count = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 90) count++; return count;
      });
    }, { points: info.wrists, view: gestureView });
    assert.ok(alpha.every(value => value > 60), `${action.id} actual drawn wrists must remain connected`);
    measurements[action.id] = { ...info, wristAlphaPixels: alpha, substitution: action.substitution };
    await canvas.screenshot({ path: `${OUT}/${action.id}-peak.png` });
    await scrub(1);
    const ending = await pose();
    if (action.playback === 'one_shot_then_idle') assert.ok(ending.wrists.every((point, index) => distance(point, [[946, 730], [570, 730]][index]) < .00001), `${action.id} settles to neutral`);
    if (action.playback === 'enter_then_hold') assert.equal(await canvas.getAttribute('data-action-status'), 'holding');
  }
  checks.push('All 40 scene buttons render actual wrist pixels at exact seek positions; one-shots settle and held actions remain held.');

  await page.getByRole('group', { name: '动作分类', exact: true }).getByRole('button', { name: '简历', exact: true }).click();
  assert.equal(await page.locator('button[data-action]').count(), 7);
  await page.getByRole('searchbox', { name: '查找动作' }).fill('不存在的动作');
  assert.equal(await page.locator('button[data-action]').count(), 0);
  assert.equal(await page.getByText('没有找到这个动作，换个关键词试试。').isVisible(), true);
  await page.getByRole('searchbox', { name: '查找动作' }).fill('');
  await page.getByRole('group', { name: '动作分类', exact: true }).getByRole('button', { name: '全部', exact: true }).click();
  await select('A10'); assert.match(await page.locator('.sm-warning').textContent(), /不呈现写字/);
  checks.push('Category/search filters work; missing-prop substitutions are visible instead of claiming writing animation.');

  await select('A01'); await page.getByRole('button', { name: '动作高点', exact: true }).click();
  await page.locator('.sm-stage').screenshot({ path: `${OUT}/stage-wave.png` });
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: true });
  for (const id of ['A09', 'A16', 'A24', 'A28', 'A39']) {
    await select(id); await page.getByRole('button', { name: '动作高点', exact: true }).click();
    await page.locator('.sm-art').screenshot({ path: `${OUT}/${id}-stage.png` });
  }
  await page.getByRole('group', { name: '角色视角' }).getByRole('button', { name: '手部近景', exact: true }).click();
  assert.equal(await canvas.getAttribute('data-view'), 'hands');
  await select('A01'); await page.getByRole('button', { name: '动作高点', exact: true }).click();
  await canvas.screenshot({ path: `${OUT}/hands-wave-left.png` });
  const leftHandPixels = await canvas.evaluate(element => element.toDataURL());
  await page.getByRole('group', { name: '手部跟随' }).getByRole('button', { name: '角色右手', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.handFocus === 'r');
  assert.notEqual(await canvas.evaluate(element => element.toDataURL()), leftHandPixels);
  await canvas.screenshot({ path: `${OUT}/hands-relaxed-right.png` });
  await page.getByRole('group', { name: '手部跟随' }).getByRole('button', { name: '跟随动作', exact: true }).click();
  checks.push('Hand close-up tracks the raised wrist rather than cropping fingers; left/right inspection changes the actual camera pixels.');
  await page.getByRole('group', { name: '角色视角' }).getByRole('button', { name: '表情近景', exact: true }).click();
  for (let index = 1; index <= 12; index++) {
    const id = `E${String(index).padStart(2, '0')}`;
    await page.getByRole('combobox', { name: '表情定格' }).selectOption(id);
    await page.waitForFunction(id => document.querySelector('canvas')?.dataset.expression === id, id);
    await canvas.screenshot({ path: `${OUT}/${id}-face.png` });
  }
  await page.getByRole('combobox', { name: '表情定格' }).selectOption('auto');
  await select('A02'); await page.getByRole('button', { name: '动作高点', exact: true }).click();
  const eyes = page.getByRole('slider', { name: '眼睛开合', exact: true });
  await eyes.fill('1'); const open = await canvas.evaluate(element => element.toDataURL());
  await eyes.fill('0'); await page.waitForFunction(() => document.querySelector('canvas')?.dataset.eyeOpen === '0.000');
  const closed = await canvas.evaluate(element => element.toDataURL()); assert.notEqual(open, closed);
  await eyes.fill('1');
  checks.push('Twelve expression stills and face camera render; opening/closing eyes changes actual pixels, not just labels.');

  const eyeClip = await page.evaluate(async () => {
    const { loadMotionAssets, drawSuinaiFrame } = await import('/src/character/suinaiMotion.ts');
    const { sampleAction } = await import('/src/character/suinaiActions.ts');
    const assets = await loadMotionAssets(new AbortController().signal), target = document.createElement('canvas');
    target.width = 500; target.height = 500; const ctx = target.getContext('2d'), results = [];
    for (const x of [-3.2, 0, 3.2]) for (const y of [-2.5, 0, 2.5]) {
      const frame = sampleAction('A02', 1); frame.pose.gazeX = x; frame.pose.gazeY = y;
      drawSuinaiFrame(ctx, assets, { view: 'face', eyeOpen: 1, action: frame, breath: 0, sway: 0 });
      for (const side of ['l', 'r']) {
        const spec = assets.manifest.eyes[side], buffer = assets.buffers[side].iris;
        const mask = document.createElement('canvas'); mask.width = buffer.width; mask.height = buffer.height;
        const layer = assets.layers[spec.iris_clip_mask];
        mask.getContext('2d').drawImage(layer.image, layer.bounds[0] - spec.bounds[0], layer.bounds[1] - spec.bounds[1]);
        const a = buffer.getContext('2d').getImageData(0, 0, buffer.width, buffer.height).data;
        const b = mask.getContext('2d').getImageData(0, 0, mask.width, mask.height).data;
        let outside = 0, nonempty = 0;
        for (let i = 3; i < a.length; i += 4) { if (!b[i] && a[i]) outside++; if (a[i]) nonempty++; }
        results.push({ side, x, y, outside, nonempty });
      }
    }
    return results;
  });
  assert.ok(eyeClip.every(state => state.outside === 0 && state.nonempty > 20));
  writeFileSync(`${OUT}/eye-clip-verification.json`, JSON.stringify(eyeClip, null, 2) + '\n');
  checks.push('Actual renderer tested at 18 gaze extrema: moving irises remain nonempty and have zero pixels outside their explicit masks.');

  await page.getByRole('group', { name: '角色视角' }).getByRole('button', { name: '完整动作', exact: true }).click();
  await select('A01'); await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.actionTime) > .8);
  const first = await pose(); await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.actionTime) > 1.2);
  assert.ok(distance(first.wrists[0], (await pose()).wrists[0]) > 10);
  await page.getByRole('button', { name: 'Ⅱ 暂停动作', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.motion === 'off');
  await page.waitForTimeout(80);
  const frozen = await canvas.evaluate(element => ({ time: element.dataset.actionTime, frame: element.dataset.frame, png: element.toDataURL() }));
  await page.waitForTimeout(250);
  assert.deepEqual(await canvas.evaluate(element => ({ time: element.dataset.actionTime, frame: element.dataset.frame, png: element.toDataURL() })), frozen);
  await page.getByRole('button', { name: '▷ 继续播放', exact: true }).click();
  await page.waitForFunction(time => Number(document.querySelector('canvas')?.dataset.actionTime) > Number(time) + .12, frozen.time);
  await select('A39'); await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.actionTime) > .5);
  assert.equal((await pose()).expression, 'E08');
  await page.getByRole('button', { name: '↻ 重播这个动作', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.actionTime) < .3);
  checks.push('Autoplay moves real arms; pause freezes both clock and pixels; resume, interrupt and replay work.');

  await page.getByRole('button', { name: '精选连播 · 8个 →', exact: true }).click();
  for (const id of ['A01', 'A03', 'A09', 'A11', 'A16', 'A24', 'A28', 'A29', 'A02']) await waitAction(id);
  assert.equal(await page.getByRole('button', { name: '精选连播 · 8个 →', exact: true }).getAttribute('aria-pressed'), 'false');
  checks.push('Eight-scene showcase plays through held and one-shot actions, then returns to quiet idle without repeating celebrations.');

  // Parse authored motion data with the actual vendored Cubism SDK, not only a handwritten JSON checker.
  const sdkPage = await context.newPage(); await sdkPage.goto(BASE + '/?preview=suinai-motion');
  await sdkPage.addScriptTag({ url: BASE + '/live2d/core/live2dcubismcore.min.js' });
  const motionFiles = actions.map(action => ({ id: action.id, json: JSON.parse(readFileSync(resolve(pack, action.file), 'utf8')) }));
  const expressionFiles = Array.from({ length: 12 }, (_, index) => { const id = `E${String(index + 1).padStart(2, '0')}`; return { id, json: JSON.parse(readFileSync(resolve(pack, `expressions/${id}.exp3.json`), 'utf8')) }; });
  const sdk = await sdkPage.evaluate(async ({ files, expressions }) => {
    const { CubismFramework } = await import('/vendor/live2d/framework/src/live2dcubismframework.ts');
    const { CubismMotion } = await import('/vendor/live2d/framework/src/motion/cubismmotion.ts');
    const { CubismExpressionMotion } = await import('/vendor/live2d/framework/src/motion/cubismexpressionmotion.ts');
    await import('/vendor/live2d/framework/src/rendering/cubismrenderer_webgl.ts');
    CubismFramework.startUp(); CubismFramework.initialize();
    const results = [], parsedExpressions = [];
    try {
      for (const { id, json } of files) {
        const bytes = new TextEncoder().encode(JSON.stringify(json));
        const motion = CubismMotion.create(bytes.buffer, bytes.byteLength, undefined, undefined, true);
        results.push({ id, duration: motion.getLoopDuration(), curves: json.Curves.length });
        motion.release();
      }
      for (const { id, json } of expressions) {
        const bytes = new TextEncoder().encode(JSON.stringify(json));
        const expression = CubismExpressionMotion.create(bytes.buffer, bytes.byteLength);
        parsedExpressions.push({ id, parameters: expression.getExpressionParameters().length });
        expression.release();
      }
    } finally { CubismFramework.dispose(); }
    return { motions: results, expressions: parsedExpressions };
  }, { files: motionFiles, expressions: expressionFiles });
  assert.equal(sdk.expressions.length, 12); assert.ok(sdk.expressions.every(value => value.parameters === 7));
  assert.equal(sdk.motions.length, 40); assert.ok(sdk.motions.every((result, index) => Math.abs(result.duration - motionFiles[index].json.Meta.Duration) < .0001));
  writeFileSync(`${OUT}/cubism-sdk-parse.json`, JSON.stringify({ modelRigVerified: false, actualSdkMotionParse: 'passed', actualSdkExpressionParse: 'passed', ...sdk }, null, 2) + '\n');
  await sdkPage.close(); checks.push('All 40 authored motion3 and 12 exp3 files parse with the real vendored Cubism SDK; this verifies animation format, not an unbuilt Suinai model.');

  for (const width of [320, 390, 768]) {
    const small = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const target = await small.newPage(); target.on('pageerror', error => errors.push(error.message));
    await target.goto(BASE + '/?preview=suinai-motion'); await target.locator('.suinai-motion-character[data-status="ready"]').waitFor();
    assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await target.getByRole('button', { name: '↻ 重播这个动作', exact: true }).isEnabled(), false);
    assert.equal(await target.getByRole('slider', { name: '动作进度', exact: true }).isEnabled(), false);
    await target.screenshot({ path: `${OUT}/mobile-${width}.png`, fullPage: true }); await small.close();
  }
  checks.push('320/390/768px layouts fit; reduced-motion stops procedural animation and disables playback/scrubbing.');

  const failing = await context.newPage();
  await failing.route('**/brand/suinai-motion-v03/manifest.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":99}' }));
  await failing.goto(BASE + '/?preview=suinai-motion'); await failing.getByRole('alert').waitFor();
  assert.match(await failing.getByRole('alert').textContent(), /版本不一致/);
  await failing.unroute('**/brand/suinai-motion-v03/manifest.json');
  await failing.getByRole('button', { name: '重新加载素材', exact: true }).click();
  await failing.locator('.suinai-motion-character[data-status="ready"]').waitFor(); await failing.close();
  checks.push('Malformed manifests produce a readable error and retry succeeds; no business APIs are called by the studio.');
  assert.deepEqual(errors, []); assert.deepEqual(businessCalls, []);
  writeFileSync(`${OUT}/verification.json`, JSON.stringify({ status: 'passed', checks, measurements, pageErrors: errors, businessCalls }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', scenes: Object.keys(measurements).length, checks, out: OUT }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${OUT}/verification.json`, JSON.stringify({ status: 'failed', error: String(error.stack || error), checks, measurements, pageErrors: errors, businessCalls }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }

