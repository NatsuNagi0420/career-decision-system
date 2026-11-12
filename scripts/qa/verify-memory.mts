/** 青穗集 · 识海真实界面验收：隔离账号/数据库与模型替身，用 Chrome 验证窗口交互及截图。 */
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../../agent/src/http.js";
import { loadConfig } from "../../agent/src/config.js";
import { Store, now, id } from "../../agent/src/store.js";
import type { Model } from "../../agent/src/types.js";
const root = resolve(import.meta.dirname, "../.."), logs = join(root, "logs/memory-system-20261030");
await mkdir(logs, { recursive: true });
const data = await mkdtemp(join(logs, "ui-data-"));
const require = createRequire(join(root, "web/package.json")), { chromium } = require("playwright") as typeof import("../../web/node_modules/playwright/index.js");
const config = loadConfig({ AGENT_PORT: "8118", AGENT_DATA_DIR: data, AGENT_MEMORY_BACKGROUND: "false" });
const store = new Store(join(data, "agent.sqlite"));
const model: Model = { async complete() { return { text: "仅为隔离测试的回复。", tool_calls: [], input_tokens: 1, output_tokens: 1, finish_reason: "stop" }; } };
const ctx = createApp({ config, store, modelFactory: () => model, staticDir: join(root, "web/dist"), assetsDir: join(root, "assets/web"), sandbox: { async health() { return { available: false, provider: "docker", image: "test-only", isolation_tested: false, message: "隔离界面测试" }; }, async execute() { throw Error("测试禁止执行命令"); } } });
const session = ctx.auth.register("memory_ui_test", "Synthetic-only-2026", true);
const profile = await ctx.profiles.save(session.user, { name: "隔离测试模型", mode: "custom", base_url: "https://example.invalid/v1", model: "fixture-only", api_key: "synthetic-only-ui-key" });
profile.capabilities = { chat: true, tools: true, stream: false, tested_at: now(), note: "仅测试" }; store.saveProfile(profile, null);
const conversation = store.createConversation(session.user.id, profile.id, "识海界面隔离测试");
const samples = [
  ["experience", "我用 React 和 TypeScript 完成过校园二手平台，负责搜索页面和接口联调。"],
  ["skill", "我能用 TypeScript 编写组件，处理表单校验和请求异常。"],
  ["goal", "我想找前端开发实习，优先看有代码评审的团队。"],
  ["preference", "我暂时只考虑上海的岗位，每周能投入十个小时学习。"],
  ["plan", "我准备先完善二手平台的测试，再整理成简历项目经历。"],
  ["anchor", "请一直记住，我不希望在简历里编造自己没做过的工作。"],
] as const;
for (const [kind, text] of samples) {
  const message = store.message(conversation.id, null, "user", text);
  ctx.runtime.memory.observe(session.user.id, conversation.id, [{ kind, text, evidence: [{ source_id: "message." + message.id, quote: text }] }]);
}
ctx.runtime.memory.recall(session.user.id, conversation.id, id(), "帮我把 React 二手平台的项目经历写进前端实习简历，推荐上海岗位。");
await ctx.app.listen({ host: "127.0.0.1", port: 8118 });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors: string[] = [], checks: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text()); });
  await page.addInitScript(({ token, cid, uid, pid }) => {
    localStorage.setItem("career.session.token", token);
    localStorage.setItem("agent.conversation." + uid, cid);
    localStorage.setItem("agent.selectedModel", pid);
    localStorage.setItem("career.boot.seen", "1");
  }, { token: session.token, cid: conversation.id, uid: session.user.id, pid: profile.id });
  await page.goto("http://127.0.0.1:8118/");
  await page.getByRole("button", { name: "打开穗奈识海", exact: true }).first().click();
  const sea = page.getByRole("dialog", { name: "穗奈识海", exact: true });
  await sea.getByRole("heading", { name: "穗奈的识海" }).waitFor();
  await sea.locator(".memory-sea__item").first().waitFor();
  assert.equal(await sea.locator(".memory-sea__item").count(), 6); checks.push("真实 API 读取六类记忆");
  await sea.locator('.memory-nebula[data-renderer="webgl"]').waitFor();
  await sea.getByRole("button", { name: "记忆设置", exact: true }).click();
  const syncCheckbox = sea.getByRole("checkbox", { name: "随官方账号同步", exact: true });
  await syncCheckbox.uncheck({ timeout: 8000 });
  await page.waitForFunction(async () => { const token = localStorage.getItem("career.session.token"); const response = await fetch("/api/v1/agent/memory", {headers:{Authorization:"Bearer " + token}}); return (await response.json()).settings.sync_enabled === false; });
  await syncCheckbox.check(); await sea.getByRole("button", { name: "记忆设置", exact: true }).click({ timeout: 5000 }); checks.push("账号记忆同步开关可保存");
  const canvas = page.locator("#suinai-memory-window .memory-nebula__canvas");
  await page.waitForFunction(() => Boolean(document.querySelector<HTMLCanvasElement>(".memory-nebula__canvas")?.dataset.camera));
  assert.equal(await canvas.getAttribute("data-nodes"), "6"); checks.push("WebGL 实际渲染三维粒子星云与六个记忆星体");
  const orbit = sea.getByRole("button", { name: "自动漫游识海", exact: true });
  if (await orbit.getAttribute("aria-pressed") === "true") await orbit.click();
  await page.screenshot({ path: join(logs, "memory-sea-desktop.png"), animations: "disabled" });
  const beforeDrag = await canvas.getAttribute("data-camera"), bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .73);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .55 + 140, bounds.y + bounds.height * .73 - 70, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction(previous => document.querySelector<HTMLCanvasElement>(".memory-nebula__canvas")?.dataset.camera !== previous, beforeDrag);
  checks.push("鼠标拖动实际改变三维相机方位");
  await page.screenshot({ path: join(logs, "memory-sea-rotated.png"), animations: "disabled" });
  await sea.getByRole("button", { name: "重置识海视角", exact: true }).click();
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>(".memory-nebula__canvas")?.dataset.camera === "0.00,12.00,118.00");
  const beforeZoom = await canvas.getAttribute("data-camera");
  await sea.getByRole("button", { name: "放大识海", exact: true }).click();
  await page.waitForFunction(previous => document.querySelector<HTMLCanvasElement>(".memory-nebula__canvas")?.dataset.camera !== previous, beforeZoom);
  checks.push("视角缩放和复位生效");
  await sea.getByRole("button", { name: "重置识海视角", exact: true }).click();
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>(".memory-nebula__canvas")?.dataset.camera === "0.00,12.00,118.00");
  await page.waitForTimeout(400);
  const label = sea.locator(".memory-nebula__label:visible").first(); await label.waitFor();
  const pickedId = await label.getAttribute("data-memory-id"), box = (await label.boundingBox())!;
  await page.mouse.click(box.x - 3, box.y - 3);
  await page.screenshot({ path: join(logs, "memory-sea-picking.png"), animations: "disabled" });
  await sea.locator(`.memory-nebula__label[data-memory-id="${pickedId}"][data-selected="true"]`).waitFor();
  await sea.getByRole("heading", { name: "原话与出处", exact: true }).waitFor(); checks.push("直接点击三维星体可打开对应记忆详情");
  await sea.getByRole("button", { name: "← 返回记忆", exact: true }).click();
  await sea.locator(".memory-sea__item").filter({ hasText: "React 和 TypeScript" }).click();
  await sea.getByRole("heading", { name: "原话与出处" }).waitFor();
  await sea.locator(".memory-sea__sources summary").first().click();
  assert.match(await sea.locator("blockquote").first().innerText(), /校园二手平台/); checks.push("节点原话可展开");
  await sea.getByRole("button", { name: "改一下", exact: true }).click();
  await sea.getByRole("textbox", { name: "正确的记忆内容" }).fill("我用 React 和 TypeScript 完成校园二手平台，亲自实现搜索页面。");
  await sea.getByRole("button", { name: "保存改正", exact: true }).click();
  await sea.getByRole("heading", { name: "我用 React 和 TypeScript 完成校园二手平台，亲自实现搜索页面。", exact: true }).waitFor(); checks.push("改正记忆后显示新内容");
  await page.screenshot({ path: join(logs, "memory-sea-evidence.png"), animations: "disabled" });
  await sea.getByRole("button", { name: "归档", exact: true }).click();
  await sea.getByRole("button", { name: "已归档", exact: true }).click();
  await sea.locator(".memory-sea__item").filter({ hasText: "亲自实现搜索页面" }).waitFor(); checks.push("归档后仍可查找与恢复");
  await sea.getByRole("button", { name: "文档", exact: true }).click();
  await sea.locator(".memory-sea__documents summary").first().click();
  assert.equal(await sea.locator(".memory-sea__documents details").count(), 7); checks.push("七类即时记忆文档");
  await sea.getByRole("button", { name: "回想", exact: true }).click();
  await sea.locator(".memory-sea__recalls section").first().waitFor(); checks.push("回想记录包含实际检索的问题与节点");
  await sea.getByRole("button", { name: "记忆", exact: true }).click();
  await sea.getByRole("button", { name: "全部", exact: true }).click();
  await sea.getByRole("button", { name: "重置识海视角", exact: true }).click();
  await sea.getByRole("button", { name: "自动漫游识海", exact: true }).click();
  await page.waitForTimeout(300);
  await sea.screenshot({ path: join(logs, "memory-sea-preview.png"), animations: "disabled" });
  await sea.getByRole("button", { name: "最小化工作台", exact: true }).click();
  const stoppedCamera = await canvas.getAttribute("data-camera");
  await page.waitForTimeout(150);
  assert.equal(await canvas.getAttribute("data-camera"), stoppedCamera); checks.push("最小化后停止三维渲染");
  await page.getByRole("button", { name: "打开穗奈识海", exact: true }).first().click();
  await page.waitForFunction(previous => document.querySelector<HTMLCanvasElement>(".memory-nebula__canvas")?.dataset.camera !== previous, stoppedCamera);
  checks.push("恢复窗口后继续渲染");
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(logs, "memory-sea-4k.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(logs, "memory-sea-mobile.png"), animations: "disabled" });
  assert.equal(await sea.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true); checks.push("4K 与手机尺寸均无横向溢出");
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(join(logs, "ui-verification.json"), JSON.stringify({ checks, errors, synthetic_data: true, screenshots: ["memory-sea-desktop.png", "memory-sea-preview.png", "memory-sea-rotated.png", "memory-sea-evidence.png", "memory-sea-4k.png", "memory-sea-mobile.png"] }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
} catch (cause) { await writeFile(join(logs,"ui-failure.json"),JSON.stringify({error:String(cause),checks,errors,settings:ctx.runtime.memory.settings(session.user.id)},null,2)); throw cause; } finally { await browser.close(); await ctx.app.close(); store.close(); }

