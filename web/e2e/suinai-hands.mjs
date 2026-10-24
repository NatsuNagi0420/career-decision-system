/** 青穗集 · 手掌朝向Chrome回归：用人工指端点检查实际像素，保存同一姿态修复前后图；不以“有位移”代替手形验收。 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const OUT = resolve(process.argv[3] || resolve(root, 'logs/suinai-hand-orientation-fix-20261019/browser-hands'));
const baselineDir = resolve(process.argv[4] || resolve(OUT, '../baseline'));
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const fixture = json(resolve(root, 'web/e2e/fixtures/suinai-hand-orientation.json'));
assert.ok(existsSync(resolve(baselineDir, 'manifest.json')), 'Run scripts/verify-suinai-hands.py first to build the original baseline.');
const originals = json(resolve(baselineDir, 'manifest.json')).assets.map(asset => ({ ...asset,
  data: 'data:image/png;base64,' + readFileSync(resolve(baselineDir, asset.file)).toString('base64') }));
mkdirSync(OUT, { recursive: true });
const errors = [], apiCalls = [], results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1250 }, reducedMotion: 'no-preference' });
await context.route(url => url.pathname.startsWith('/api/'), route => { apiCalls.push(route.request().url()); return route.abort(); });
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const cases = [
  { name: 'A01-wave-left-27', id: 'A01', fraction: .27, focus: 'l' },
  { name: 'A01-wave-left-42', id: 'A01', fraction: .42, focus: 'l' },
  { name: 'A01-wave-left-56', id: 'A01', fraction: .56, focus: 'l' },
  { name: 'A01-wave-left-65', id: 'A01', fraction: .65, focus: 'l' },
  { name: 'calibration-wave-right-42', id: 'A01', fraction: .42, focus: 'r', mirrorWave: true },
  { name: 'A05-present-right-42', id: 'A05', fraction: .42, focus: 'r' },
  { name: 'A05-present-right-55', id: 'A05', fraction: .55, focus: 'r' },
  { name: 'A11-open-both-42', id: 'A11', fraction: .42, focus: 'r' },
  { name: 'A15-present-left-42', id: 'A15', fraction: .42, focus: 'l' },
  { name: 'A16-point-left-26', id: 'A16', fraction: .26, focus: 'l' },
  { name: 'A16-point-right-69', id: 'A16', fraction: .69, focus: 'r' },
  { name: 'A12-point-right-extreme-40', id: 'A12', fraction: .4, focus: 'r' },
  { name: 'A08-point-left-extreme-20', id: 'A08', fraction: .2, focus: 'l' },
  { name: 'A09-thinking-right-42', id: 'A09', fraction: .42, focus: 'r' },
  { name: 'A23-fist-left-42', id: 'A23', fraction: .42, focus: 'l' },
  { name: 'A28-fists-both-42', id: 'A28', fraction: .42, focus: 'r' },
  { name: 'A40-fist-right-42', id: 'A40', fraction: .42, focus: 'r' },
];
try {
  await page.goto(BASE + '/?preview=suinai-motion');
  await page.locator('.suinai-motion-character[data-status="ready"]').waitFor();
  await page.evaluate(async ({ fixture, originals }) => {
    const motion = await import('/src/character/suinaiMotion.ts');
    const actions = await import('/src/character/suinaiActions.ts');
    const geometry = await import('/src/character/suinaiGesture.ts');
    const assets = await motion.loadMotionAssets(new AbortController().signal);
    const before = { ...assets, layers: { ...assets.layers } };
    for (const record of originals) {
      const image = new Image(); image.src = record.data; await image.decode();
      before.layers[record.name] = { ...assets.layers[record.name], bounds: record.bounds, image };
    }
    window.__suinaiHandRegression = { motion, actions, geometry, assets, before, fixture };
  }, { fixture, originals });
  for (const item of cases) {
    const result = await page.evaluate(item => {
      const { motion, actions, geometry, assets, before, fixture } = window.__suinaiHandRegression;
      const action = actions.sampleAction(item.id, actions.ACTION_BY_ID[item.id].durationSec * item.fraction);
      if (item.mirrorWave) {
        const source = action.pose.left;
        action.pose = { ...action.pose, body: -action.pose.body, right: { shoulder: -source.shoulder, elbow: -source.elbow, wrist: -source.wrist }, left: { shoulder: 0, elbow: 0, wrist: 0 } };
        action.leftHand = 'H01'; action.rightHand = 'H02';
      }
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1100;
      const ctx = canvas.getContext('2d');
      const frame = { view: 'gesture', handFocus: item.focus, eyeOpen: 1, action, breath: 0, sway: 0 };
      motion.drawSuinaiFrame(ctx, assets, frame);
      const fullAfter = canvas.toDataURL();
      let sideEdgeAlphaPixels = 0;
      for (const x of [0, canvas.width - 20]) {
        const edge = ctx.getImageData(x, 0, 20, canvas.height).data;
        for (let i = 3; i < edge.length; i += 4) if (edge[i] > 80) sideEdgeAlphaPixels++;
      }
      const project = (point, reference) => {
        const side = reference.side, layer = assets.layers[reference.asset];
        const armPose = side === 'l' ? action.pose.left : action.pose.right;
        const rows = geometry.buildArmRows(side, armPose, layer.bounds[1], layer.bounds[3]);
        const end = rows.findIndex(row => row.y >= point[1]);
        const a = rows[Math.max(0, end - 1)], b = rows[end];
        const t = (point[1] - a.y) / (b.y - a.y);
        const p = geometry.armRowPoint(side, a, point[0]), q = geometry.armRowPoint(side, b, point[0]);
        const x = p[0] + (q[0] - p[0]) * t - 758, y = p[1] + (q[1] - p[1]) * t - 575;
        const angle = action.pose.body * Math.PI / 180;
        const wx = 758 + x * Math.cos(angle) - y * Math.sin(angle);
        const wy = 575 + action.pose.lift + x * Math.sin(angle) + y * Math.cos(angle);
        const [vx, vy, vw, vh] = motion.GESTURE_VIEW;
        const scale = Math.min(canvas.width / vw, canvas.height / vh);
        return [(canvas.width - vw * scale) / 2 + (wx - vx) * scale, (canvas.height - vh * scale) / 2 + (wy - vy) * scale];
      };
      const sample = point => {
        const pixels = ctx.getImageData(Math.round(point[0]) - 3, Math.round(point[1]) - 3, 7, 7).data;
        let count = 0, maximum = 0;
        for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 80) count++; maximum = Math.max(maximum, pixels[i]); }
        return { count, maximum };
      };
      const palms = [];
      for (const reference of fixture.palms) {
        if ((reference.side === 'l' ? action.leftHand : action.rightHand) !== reference.hand) continue;
        const wrist = project(reference.wrist, reference), middle = project(reference.expected.middle, reference), thumb = project(reference.expected.thumb, reference);
        const signedArea = (middle[0] - wrist[0]) * (thumb[1] - wrist[1]) - (middle[1] - wrist[1]) * (thumb[0] - wrist[0]);
        palms.push({ asset: reference.asset, signedArea, expectedAreaSign: reference.areaSign, thumbPixels: sample(thumb), middlePixels: sample(middle), wristPixels: sample(wrist) });
      }
      frame.view = 'hands'; motion.drawSuinaiFrame(ctx, assets, frame);
      const handAfter = canvas.toDataURL();
      motion.drawSuinaiFrame(ctx, before, frame); const handBefore = canvas.toDataURL();
      frame.view = 'gesture'; motion.drawSuinaiFrame(ctx, before, frame); const fullBefore = canvas.toDataURL();
      return { name: item.name, action: item.id, fraction: item.fraction, calibrationOnly: !!item.mirrorWave,
        hands: { l: action.leftHand, r: action.rightHand }, palms, sideEdgeAlphaPixels, fullAfter, handAfter, fullBefore, handBefore };
    }, item);
    for (const key of ['fullAfter', 'handAfter', 'fullBefore', 'handBefore']) {
      writeFileSync(resolve(OUT, `${item.name}-${key}.png`), Buffer.from(result[key].split(',')[1], 'base64'));
      delete result[key];
    }
    results.push(result);
    assert.equal(result.sideEdgeAlphaPixels, 0, `${item.name}: fingertips must not touch the camera side edges`);
    for (const palm of result.palms) {
      assert.ok(palm.signedArea * palm.expectedAreaSign > 1500, `${item.name}: ${palm.asset} thumb-side sign`);
      assert.ok(palm.thumbPixels.count >= 4 && palm.thumbPixels.maximum > 140, `${item.name}: actual thumb pixels`);
      assert.ok(palm.middlePixels.count >= 4 && palm.middlePixels.maximum > 140, `${item.name}: actual middle-finger pixels ${JSON.stringify(palm)}`);
      assert.ok(palm.wristPixels.count >= 35, `${item.name}: wrist connection`);
    }
  }
  // Also capture the real UI, not just the isolated deterministic renderer.
  await page.locator('button[data-action="A01"]').click();
  await page.getByRole('button', { name: '动作高点', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.suinai-motion-character canvas')?.dataset.motion === 'off');
  await page.locator('.sm-art').screenshot({ path: resolve(OUT, 'actual-ui-wave-left.png') });
  await page.locator('button[data-action="A05"]').click();
  await page.getByRole('button', { name: '动作高点', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.suinai-motion-character canvas')?.dataset.action === 'A05' && document.querySelector('.suinai-motion-character canvas')?.dataset.motion === 'off');
  await page.locator('.sm-art').screenshot({ path: resolve(OUT, 'actual-ui-present-right.png') });
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  const report = { status: 'passed', browser: 'installed-google-chrome', posesChecked: results.length,
    palmChecks: results.reduce((sum, result) => sum + result.palms.length, 0),
    anatomyScope: 'Reviewed open-palm thumb/middle landmarks and rendered pixels; pointer/fist/thinking screenshots require visual review.',
    results, pageErrors: errors, businessApiCalls: apiCalls };
  writeFileSync(resolve(OUT, 'hand-orientation-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, posesChecked: report.posesChecked, palmChecks: report.palmChecks, out: OUT }, null, 2));
} catch (error) {
  writeFileSync(resolve(OUT, 'hand-orientation-browser.json'), JSON.stringify({ status: 'failed', error: String(error.stack || error), results, pageErrors: errors, businessApiCalls: apiCalls }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
