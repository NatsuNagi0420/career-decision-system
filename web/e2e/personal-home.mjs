/** 青穗集 · 私人主页与像素桌面浏览器验收：隔离接口数据，覆盖读写失败、双击、刷新、打印及 4K。 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const BASE = process.argv[2] || "http://127.0.0.1:5174/";
const OUT = resolve(process.argv[3] || "../logs/personal-home-browser");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const failures = [], checks = [], requests = [];
const artifact = (id, artifact_type, content) => ({ id, artifact_type, content, run_id: "r1", title: `演示${id}`, status: "committed", version: 1,
  data_coverage: null, is_provisional: false, generation_mode: "fixture", evidence_quotes: {}, source_refs: [], supersedes_id: null });
const artifacts = [
  artifact("画像分析", "ProfileGapReport", { conclusion: "已确认你有 Python 和 SQL 的课程项目经历。", next_actions: ["补充项目结果"], uncertainties: ["还需补充项目细节"] }),
  artifact("岗位对照", "JobMatchReport", { job_match: { jobs: [{ job_id: 1, title: "初级数据分析", company: "演示目录样本", city: "广州", reference_only: true, matched: ["Python", "SQL"], matched_count: 2, quotes: [{ text: "能用 SQL 完成统计" }] }] } }),
  artifact("学习路线", "LearningPathDraft", { learning_path: { conclusion: "先补项目表达，再练习 SQL。", next_steps: ["整理一次查询结果"], have: [{ text: "Python 基础" }], missing: [{ text: "指标表达" }], practice: [] } }),
  artifact("简历草稿", "ResumeDraft", { resume: { plain: "# 演示简历\n## 技能\n会用 Python 与 SQL", order_reason: "2027 年毕业，教育放在最前", completeness: "4/6 节已有内容", sections: [
    { key: "education", title: "教育背景", empty: false, lines: [{ text: "测试大学 · 计算机专业 · 2027 年毕业" }] },
    { key: "experience", title: "实习与项目", empty: true, ask: "说一段你独立负责的项目经历", lines: [] },
    { key: "skills", title: "技能与工具", empty: false, lines: [{ text: "使用 Python 和 SQL 处理课程项目中的数据。" }] },
  ], improvements: ["补充可以核实的项目结果。"] } }),
];
const initial = () => ({ version: 1, school: "测试大学", major: "计算机科学与技术", graduation_year: 2027, city_targets: ["广州"], summary: "正在探索适合自己的技术方向。", updated_at: "2026-10-20T00:00:00", facts: [
  { id: "f1", dimension: "skills", statement: "会用 Python 和 SQL 处理课程项目数据。", source: "agent", created_at: "2026-10-20T00:00:00" },
  { id: "f2", dimension: "education", statement: "测试大学计算机专业，2027 年毕业。", source: "user", created_at: "2026-10-20T00:00:00" },
] });
async function fixture(viewport, filled = true) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr || 1, reducedMotion: "reduce" });
  const store = { profile: initial(), failWrite: false, failRead: false, conflict: false, delayed: false, writes: 0, consent: false, runs: 0, serial: 2 };
  if (!filled) store.profile = { ...initial(), version: 0, school: "", major: "", graduation_year: null, city_targets: [], summary: "", facts: [] };
  const feed = { projects: [], artifacts: filled ? artifacts : [], obligations: [], tasks: [], pending_approvals: [], runs: filled ? [
    { id: "r1", thread_id: "t1", goal: "根据我刚确认的经历整理适合广州求职方向的简历，并说明目前仍然缺少的项目细节", capability_id: "resume_build", status: "completed", created_at: "2026-10-20T00:00:00", finished_at: "2026-10-20T00:01:00", usage: {}, error: null },
    { id: "r2", thread_id: "t2", goal: "帮我重新梳理计算机专业的实习、课程和个人项目经历", capability_id: "profile_diagnose", status: "completed", created_at: "2026-10-19T00:00:00", finished_at: "2026-10-19T00:01:00", usage: {}, error: null },
  ] : [] };
  if (filled) feed.obligations.push({ id: "o1", run_id: "r1", project_id: null, capability_id: "resume_build", capability_name: "简历生成与优化", intent: "向你确认课程项目的具体任务、负责步骤与可核实成果，再继续更新简历。", status: "open", trigger_kind: "on_return", startable: false, not_before: null });
  await context.addInitScript(() => { localStorage.setItem("career.session.token", "private-fixture-token"); sessionStorage.setItem("career.boot.seen.v1", "1"); localStorage.removeItem("career.lastRun"); localStorage.removeItem("career.research"); });
  await context.route("**/api/v1/**", async route => {
    const req = route.request(); const path = new URL(req.url()).pathname; const method = req.method();
    requests.push(`${method} ${path}`);
    const ok = json => route.fulfill({ json });
    const error = (status, detail) => route.fulfill({ status, json: { detail } });
    if (path === "/api/v1/profile" && method === "GET") return store.failRead ? error(503, "资料暂时读取失败") : ok(store.profile);
    if (path.startsWith("/api/v1/profile") && method !== "GET") {
      store.writes++;
      if (store.delayed) await new Promise(resolve => setTimeout(resolve, 180));
      if (store.failWrite) return error(503, "保存失败，请稍后重试");
      const data = req.postDataJSON();
      const expected = method === "DELETE" ? Number(new URL(req.url()).searchParams.get("expected_version")) : data.expected_version;
      if (store.conflict || expected !== store.profile.version) return error(409, "资料已在其他页面更新，请先重新读取，再保存你的修改。");
      if (path === "/api/v1/profile") store.profile = { ...store.profile, ...data, version: store.profile.version + 1 };
      else {
        const oldId = path.split("/")[5];
        if (method === "PUT" || method === "DELETE") store.profile.facts = store.profile.facts.filter(f => f.id !== oldId);
        if (method !== "DELETE") store.profile.facts.unshift({ id: `f${++store.serial}`, dimension: data.dimension, statement: data.statement, source: "user", created_at: "2026-10-20T00:00:00" });
        store.profile.version++;
      }
      return ok(store.profile);
    }
    if (path === "/api/v1/auth/me") return ok({ id: 1, username: "演示用户", external_ai_consent: store.consent });
    if (path === "/api/v1/capabilities") return ok([{ id: "resume_build", name: "简历生成与优化", domain: "resume" }, { id: "profile_diagnose", name: "画像诊断", domain: "profile" }]);
    if (path === "/api/v1/feed") return ok(feed);
    if (path === "/api/v1/continuations") return ok({ obligation: null, reason: "no_due_obligation" });
    if (path === "/api/v1/auth/ai-consent") { store.consent = req.postDataJSON().granted; return ok({ external_ai_consent: store.consent }); }
    if (path === "/api/v1/auth/logout") return route.fulfill({ status: 204 });
    if (path === "/api/v1/runs" && method === "POST") { store.runs++; return error(409, "页面验收不启动模型任务"); }
    return ok({});
  });
  const page = await context.newPage();
  page.on("pageerror", error => failures.push(error.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator(".welcome h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { context, page, store };
}
async function shot(page, name) { await page.screenshot({ path: resolve(OUT, `${name}.png`) }); }
async function home(page) {
  await page.locator(".desktop-apps").getByRole("button", { name: /个人主页/ }).click();
  await page.locator("#profile-school").waitFor();
}
async function tab(page, name) { await page.getByRole("navigation", { name: "个人主页栏目" }).getByRole("button", { name, exact: true }).click(); }
async function noOverflow(page) {
  const value = await page.evaluate(() => {
    const out = document.querySelector(".desktop-output__body");
    return { root: document.documentElement.scrollWidth <= innerWidth + 1, body: out ? out.scrollWidth <= out.clientWidth + 2 : true };
  });
  assert.deepEqual(value, { root: true, body: true });
}
try {
  for (const vp of [
    { width: 3840, height: 2160, name: "4k-100" }, { width: 2560, height: 1440, dpr: 1.5, name: "4k-150" },
    { width: 1920, height: 1080, dpr: 2, name: "4k-200" }, { width: 1440, height: 900, name: "desktop" },
    { width: 1280, height: 800, name: "laptop" }, { width: 768, height: 1024, name: "tablet" },
    { width: 390, height: 844, name: "mobile" }, { width: 320, height: 680, name: "small-mobile" },
  ]) {
    const { context, page, store } = await fixture(vp);
    assert.equal(await page.evaluate(() => document.fonts.check('12px "Fusion Pixel"', '穗奈个人主页')), true);
    const welcome = await page.locator(".welcome").boundingBox(), composer = await page.locator(".dock").boundingBox();
    if (vp.width > 1040) assert.ok(composer.y - (welcome.y + welcome.height) < 160, "welcome and composer should be nearby");
    await shot(page, `01-welcome-${vp.name}`);
    await home(page); await noOverflow(page);
    const font = await page.locator("#profile-school").evaluate(el => getComputedStyle(el).fontFamily);
    assert.ok(font.startsWith('"Fusion Pixel"'), font);
    await shot(page, `02-home-${vp.name}`);
    for (const title of ["经历与技能", "成果文件", "账号设置"]) { await tab(page, title); await noOverflow(page); }
    await page.getByRole("button", { name: "最近对话", exact: true }).click();
    await page.locator(".track").first().waitFor();
    await shot(page, `03-history-${vp.name}`);
    const sidebar = await page.locator(".sidebar").boundingBox();
    assert.ok(sidebar.x >= 0 && sidebar.x + sidebar.width <= vp.width + 1);
    await page.getByRole("button", { name: "关闭最近对话 ×" }).click();
    await page.locator(".desktop-apps").getByRole("button", { name: /简历文件/ }).click();
    await page.locator(".resume-sheet").waitFor(); await noOverflow(page); await shot(page, `04-resume-${vp.name}`);
    assert.equal(store.writes, 0); assert.equal(store.runs, 0);
    checks.push(`${vp.name}: entry points, pixel font, tabs, history, resume and viewport passed`);
    await context.close();
  }
  {
    const { context, page, store } = await fixture({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "打开个人主页", exact: true }).click();
    await page.locator("#profile-school").waitFor();
    await page.locator("#profile-school").fill("修改后的测试大学");
    store.failWrite = true;
    await page.getByRole("button", { name: "保存基本资料", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "保存失败" }).waitFor();
    assert.equal(await page.locator("#profile-school").inputValue(), "修改后的测试大学");
    store.failWrite = false; store.delayed = true;
    const before = store.writes;
    const button = page.getByRole("button", { name: "保存基本资料", exact: true });
    await button.evaluate(el => { el.click(); el.click(); });
    await page.getByRole("status").filter({ hasText: "基本资料已保存" }).waitFor();
    assert.equal(store.writes - before, 1);
    await page.reload({ waitUntil: "networkidle" }); await home(page);
    assert.equal(await page.locator("#profile-school").inputValue(), "修改后的测试大学");
    await page.locator("#profile-major").fill("冲突时保留的输入"); store.conflict = true;
    await page.getByRole("button", { name: "保存基本资料", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "其他页面更新" }).waitFor();
    assert.equal(await page.locator("#profile-major").inputValue(), "冲突时保留的输入");
    store.conflict = false;
    await page.getByRole("button", { name: "重新读取资料" }).click();
    await page.waitForFunction(() => document.querySelector("#profile-major")?.value === "计算机科学与技术");
    await tab(page, "经历与技能");
    await page.locator("#profile-fact-statement").fill("独立完成 SQL 课程数据库项目并展示查询结果。");
    await page.getByRole("button", { name: "确认并保存", exact: true }).click();
    await page.locator(".personal-fact").filter({ hasText: "独立完成 SQL" }).waitFor();
    const added = page.locator(".personal-fact").filter({ hasText: "独立完成 SQL" });
    await added.getByRole("button", { name: /编辑经历/ }).click();
    await page.locator("#profile-fact-statement").fill("更新后：独立完成 SQL 项目并写下验证步骤。");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    const updated = page.locator(".personal-fact").filter({ hasText: "更新后：独立完成" });
    await updated.waitFor();
    await updated.getByRole("button", { name: /撤回经历/ }).click();
    await updated.getByRole("button", { name: "保留", exact: true }).click();
    assert.equal(await updated.count(), 1);
    await updated.getByRole("button", { name: /撤回经历/ }).click();
    await updated.getByRole("button", { name: "确认撤回", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".personal-factlist")?.textContent.includes("更新后：独立完成"));
    await tab(page, "成果文件");
    await page.locator(".personal-files").getByRole("button", { name: /画像分析/ }).click();
    await page.locator(".personal-report").waitFor();
    await tab(page, "账号设置");
    await page.getByRole("button", { name: "未允许 · 点击授权", exact: true }).click();
    await page.getByRole("button", { name: "已允许 · 点击撤销", exact: true }).waitFor();
    await page.getByRole("button", { name: "已允许 · 点击撤销", exact: true }).click();
    await page.getByRole("button", { name: "未允许 · 点击授权", exact: true }).waitFor();
    await page.locator(".desktop-apps").getByRole("button", { name: /简历文件/ }).click();
    await page.getByLabel("简历姓名", { exact: true }).fill("测试同学");
    await page.getByLabel("简历邮箱", { exact: true }).fill("test@example.invalid");
    assert.equal(await page.locator(".resume-sheet__name").innerText(), "测试同学");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.__resumeCopy = text; } } }));
    await page.getByRole("button", { name: "复制文本", exact: true }).click();
    const copied = await page.evaluate(() => window.__resumeCopy);
    assert.ok(copied.includes("测试同学") && copied.includes("test@example.invalid"));
    assert.ok(!copied.includes("说一段你独立负责的项目经历"));
    await page.getByRole("button", { name: "紧凑", exact: true }).click();
    await shot(page, "05-resume-contact-and-template");
    await page.emulateMedia({ media: "print" });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".resume-sheet")).backgroundColor === "rgb(255, 255, 255)");
    assert.equal(await page.locator(".resume-sheet").isVisible(), true);
    const paperStyle = await page.locator(".resume-sheet").evaluate(el => { const style = getComputedStyle(el); return { background: style.backgroundColor, shadow: style.boxShadow, zoom: style.zoom }; });
    assert.deepEqual(paperStyle, { background: "rgb(255, 255, 255)", shadow: "none", zoom: "1" });
    assert.equal(await page.locator(".resume-bar").isVisible(), false);
    assert.equal(await page.locator(".resume-sheet__empty").isVisible(), false);
    assert.equal(await page.locator(".resume-sheet__name").evaluate(el => getComputedStyle(el).fontFamily.includes("Fusion Pixel")), false);
    await page.pdf({ path: resolve(OUT, "06-resume-print.pdf"), format: "A4", printBackground: true });
    assert.equal(store.runs, 0);
    checks.push("write failure preserves draft; double click writes once; reload persists; conflict does not overwrite; facts add/edit/retract; report viewer; consent toggle; resume contact/template/print passed");
    await context.close();
  }
  {
    const { context, page, store } = await fixture({ width: 390, height: 844 }, false);
    store.failRead = true;
    await page.getByRole("button", { name: "打开个人主页", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "读取失败" }).waitFor();
    store.failRead = false; await page.getByRole("button", { name: "重新读取资料" }).click();
    await page.locator("#profile-school").waitFor();
    assert.equal(await page.locator("#profile-school").inputValue(), "");
    await page.locator(".personal-next .btn").click();
    assert.match(await page.locator("#composer").inputValue(), /一次问我一个问题/);
    assert.equal(store.runs, 0);
    checks.push("read failure retry and empty profile guidance passed; no agent invocation");
    await context.close();
  }
  assert.deepEqual(failures, []);
  writeFileSync(resolve(OUT, "verification.json"), JSON.stringify({ ok: true, mode: "Chrome, isolated API fixtures, no real model calls", failures, checks, requestCount: requests.length }, null, 2));
  console.log(checks.join("\n"));
} catch (error) {
  writeFileSync(resolve(OUT, "failure.json"), JSON.stringify({ message: error.message, stack: error.stack, failures, checks }, null, 2));
  throw error;
} finally { await browser.close(); }
