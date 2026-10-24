/** 青穗集 · 桌面主题只读验收：所有 API 均为模拟，不写共享库、不启动真实任务、不调用模型。 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL('../../logs/game-ui-20261016/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const artifact = (id, type, content) => ({ id, run_id: 'demo-run', artifact_type: type, title: `演示 · ${type}`, status: 'committed', version: 1, data_coverage: null, is_provisional: false, generation_mode: 'stub', content, evidence_quotes: {}, source_refs: [], supersedes_id: null });
const saved = [
  artifact('profile', 'ProfileGapReport', { conclusion: '演示：你已经有 Python 与 SQL 基础，也有一段值得展开的校园项目经历。', next_actions: ['补充校园数据项目里你独立负责的步骤。'], evidence_basis: [{ claim: '已提供数据处理相关经历', quote: '我用 Python 清洗校园活动报名数据，再用 SQL 统计每月参与人数。' }], uncertainties: ['还没有提供项目规模与具体成果。'] }),
  artifact('job', 'JobMatchReport', { conclusion: '演示：可以先了解初级数据分析相关岗位', job_match: { reference_only: true, jobs: [{ title: '初级数据分析', company: '演示公司（非真实招聘）', city: '演示地点', matched_count: 2, matched: ['Python', 'SQL'], reference_only: true, quotes: [{ text: '使用 SQL 完成基础数据查询与统计' }, { text: '能够用 Python 整理结构化数据' }], growth_path: ['了解业务指标', '完成一次分析展示'] }] } }),
  artifact('growth', 'LearningPathDraft', { conclusion: '演示：先把做过的项目说具体，再补业务分析表达', learning_path: { focus: { title: '初级数据分析' }, have: [{ text: '使用 SQL 进行基础查询' }], missing: [{ text: '清晰说明指标口径与分析结论' }], next_steps: ['补充校园项目的任务、过程和结果', '用一页文档展示一次分析过程'], practice: [], practice_missing: ['业务指标表达'] } }),
  artifact('resume', 'ResumeDraft', { resume: { plain: '# 演示简历\n## 技能\nPython / SQL', sections: [{ key: 'education', title: '教育经历', empty: false, lines: [{ text: '演示大学 · 计算机相关专业 · 应届生' }] }, { key: 'skills', title: '专业技能', empty: false, lines: [{ text: 'Python 数据清洗、SQL 基础查询与统计' }] }, { key: 'experience', title: '项目经历', empty: false, lines: [{ text: '校园活动报名数据整理（演示）：使用 Python 清洗数据，使用 SQL 统计每月参与人数。' }] }], improvements: ['补充项目的具体规模与成果，不编造数字。'] } }),
];
const feed = (filled) => ({ runs: [], projects: [], artifacts: filled ? saved : [], obligations: [], tasks: [], pending_approvals: [] });
const writes = [], errors = [], results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function context({ signedIn = false, filled = false, width = 1440, height = 960 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await ctx.addInitScript((sign) => { if (sign) localStorage.setItem('career.session.token', 'local-ui-fixture'); localStorage.removeItem('career.lastRun'); localStorage.removeItem('career.research'); }, signedIn);
  await ctx.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') { writes.push(`${request.method()} ${path}`); await route.fulfill({ status: 409, json: { detail: '主题验收不允许真实写入' } }); return; }
    const json = path.endsWith('/auth/me') ? { id: 1, username: '演示用户', external_ai_consent: false } : path.endsWith('/profile') ? { version: 0, school: '', major: '', graduation_year: null, city_targets: [], summary: '', updated_at: null, facts: [] } : path.endsWith('/capabilities') ? [] : path.endsWith('/feed') ? feed(filled) : path.endsWith('/continuations') ? { obligation: null, reason: 'no_due_obligation' } : {};
    await route.fulfill({ json });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
async function shot(page, name) { await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${name}.png` }); }
try {
  for (const vp of [{ width: 1440, height: 960, label: 'desktop' }, { width: 390, height: 844, label: 'mobile' }]) {
    const { ctx, page } = await context(vp);
    await shot(page, `01-login-${vp.label}`);
    await page.getByRole('button', { name: '第一次来？创建账号' }).click();
    await page.getByLabel('允许使用云端模型协助整理资料', { exact: false }).waitFor();
    await shot(page, `02-register-${vp.label}`);
    assert.equal(await page.locator('#password').getAttribute('autocomplete'), 'new-password');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await ctx.close();
  }
  for (const vp of [{ width: 1440, height: 960, label: 'desktop' }, { width: 1280, height: 800, label: 'laptop' }, { width: 390, height: 844, label: 'mobile' }]) {
    const { ctx, page } = await context({ ...vp, signedIn: true });
    await page.locator('.welcome h1').waitFor();
    await shot(page, `03-welcome-${vp.label}`);
    assert.equal(await page.evaluate(() => document.fonts.check('24px "Fusion Pixel"')), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const name of ['岗位浏览器', '成长手账', '简历文件']) {
      await page.getByRole('navigation', { name: '求职桌面应用' }).getByRole('button', { name: new RegExp(name) }).click();
      await page.locator('.desktop-empty').waitFor();
      await shot(page, `04-empty-${name}-${vp.label}`);
      assert.ok((await page.locator('.desktop-output').boundingBox()).width >= (vp.width < 680 ? 300 : 500));
    }
    await page.locator('.desktop-empty button').click();
    assert.match(await page.locator('#composer').inputValue(), /简历/);
    assert.equal(await page.locator('#composer').evaluate((el) => el === document.activeElement), true);
    await page.getByRole('button', { name: '最近对话', exact: true }).click();
    await page.getByRole('button', { name: '关闭最近对话 ×' }).click();
    if (vp.width >= 680) {
      await page.getByRole('button', { name: '展开消息窗口' }).click();
      assert.equal(await page.getByRole('button', { name: '还原消息窗口' }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: '还原消息窗口' }).click();
    }
    results.push(`${vp.label}: navigation, empty states, editable message, history, font, viewport passed`);
    await ctx.close();
  }
  const { ctx, page } = await context({ signedIn: true, filled: true });
  for (const name of ['岗位浏览器', '成长手账', '简历文件']) {
    await page.getByRole('navigation', { name: '求职桌面应用' }).getByRole('button', { name: new RegExp(name) }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.desktop-empty').count(), 0);
    await shot(page, `05-saved-${name}-stub`);
  }
  await page.getByRole('button', { name: '紧凑', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '紧凑', exact: true }).getAttribute('data-on'), 'true');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/06-resume-print-stub.pdf`, format: 'A4', printBackground: true });
  assert.equal(await page.locator('.desktop-taskbar').isVisible(), false);
  assert.equal(await page.locator('.desktop-output .resume-sheet').isVisible(), true);
  results.push('Saved fixtures: three output windows render; profile is now covered by the personal-home suite, resume template switches and print keeps sheet');
  await ctx.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  writeFileSync(`${OUT}/checks.json`, JSON.stringify({ mode: 'API stubs only; no backend or model called', writes, errors, results }, null, 2), 'utf8');
  console.log(results.join('\n'));
} finally { await browser.close(); }

