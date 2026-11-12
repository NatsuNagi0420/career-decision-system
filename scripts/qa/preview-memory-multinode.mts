/** 青穗集 · 识海多节点视觉预览：隔离账号、隔离 SQLite 与合成记忆，只生成验收截图。 */
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { createApp } from "../../agent/src/http.js";
import { loadConfig } from "../../agent/src/config.js";
import { Store, id, now } from "../../agent/src/store.js";
import type { MemoryKind } from "../../agent/src/memory-contract.js";
import type { Model } from "../../agent/src/types.js";

const root = resolve(import.meta.dirname, "../.."), logs = join(root, "logs/memory-system-20261030");
await mkdir(logs, { recursive: true });
const data = await mkdtemp(join(logs, "multi-node-preview-"));
const require = createRequire(join(root, "web/package.json"));
const { chromium } = require("playwright") as typeof import("../../web/node_modules/playwright/index.js");
const config = loadConfig({ AGENT_PORT: "8119", AGENT_DATA_DIR: data, AGENT_MEMORY_BACKGROUND: "false" });
const store = new Store(join(data, "agent.sqlite"));
const model: Model = { async complete() { return { text: "{\"ids\":[]}", tool_calls: [], input_tokens: 1, output_tokens: 1, finish_reason: "stop" }; } };
const ctx = createApp({
  config,
  store,
  modelFactory: () => model,
  staticDir: join(root, "web/dist"),
  assetsDir: join(root, "assets/web"),
  sandbox: { async health() { return { available: false, provider: "preview", image: "synthetic-only", isolation_tested: false, message: "仅用于视觉预览" }; }, async execute() { throw Error("预览禁止执行命令"); } },
});
const session = ctx.auth.register("memory_multi_preview", "Synthetic-only-2026", true);
const profile = await ctx.profiles.save(session.user, { name: "识海视觉预览", mode: "custom", base_url: "https://example.invalid/v1", model: "fixture-only", api_key: "synthetic-only-preview-key" });
profile.capabilities = { chat: true, tools: true, stream: false, tested_at: now(), note: "仅视觉预览" };
store.saveProfile(profile, null);
const conversation = store.createConversation(session.user.id, profile.id, "识海多节点视觉预览");
const samples: { kind: MemoryKind; text: string }[] = [
  { kind: "experience", text: "我做过校园二手交易平台，负责 React 前端、TypeScript 组件和接口联调。" },
  { kind: "experience", text: "我独立完成过求职作品集网站，使用 React、TypeScript 和 CSS 做了响应式页面。" },
  { kind: "experience", text: "我在课程项目中重构过 Node 服务，处理缓存、日志和接口异常。" },
  { kind: "experience", text: "我做过数据看板项目，把用户需求拆成可交付的前端模块。" },
  { kind: "experience", text: "我参与过小程序项目，负责页面状态、表单和发布前测试。" },
  { kind: "skill", text: "我熟悉 React、TypeScript 和组件化开发，能定位前端请求异常。" },
  { kind: "skill", text: "我会使用 Git、代码评审和单元测试，愿意把项目整理得更易维护。" },
  { kind: "skill", text: "我能阅读 Node 服务代码，理解接口、数据库和部署流程。" },
  { kind: "skill", text: "我正在加强 CSS、可访问性和性能优化，希望达到实习岗位要求。" },
  { kind: "skill", text: "我能把零散需求拆成任务清单，并用文档记录技术决策。" },
  { kind: "goal", text: "我想找前端开发实习，优先考虑有代码评审的团队。" },
  { kind: "goal", text: "我希望进入重视 TypeScript 和产品体验的团队。" },
  { kind: "goal", text: "我的近期职业方向是前端工程师，也愿意探索全栈。" },
  { kind: "goal", text: "我希望秋招前拿到一份能展示真实项目的简历。" },
  { kind: "goal", text: "我想把校园项目转化成可投递的项目经历。" },
  { kind: "preference", text: "我优先考虑上海或远程岗位，通勤时间不要太长。" },
  { kind: "preference", text: "我更喜欢小团队，能够接触完整产品流程。" },
  { kind: "preference", text: "我每周能安排十个小时学习和整理项目。" },
  { kind: "preference", text: "我希望岗位有明确的导师和代码评审机制。" },
  { kind: "preference", text: "我更在意真实成长空间，不想只做重复录入工作。" },
  { kind: "plan", text: "我准备先补齐二手平台的测试，再写进简历。" },
  { kind: "plan", text: "我计划本周整理 Git 提交记录和项目截图。" },
  { kind: "plan", text: "我准备学习性能分析，并给作品集做一次重构。" },
  { kind: "plan", text: "我计划每周投递五个匹配的前端岗位。" },
  { kind: "plan", text: "我准备把面试题按 TypeScript、React、网络基础分组。" },
  { kind: "anchor", text: "请一直记住，我的简历不能编造没有做过的工作。" },
  { kind: "anchor", text: "请记住，项目成果必须能回到代码或记录证据。" },
  { kind: "anchor", text: "我不希望把正在学习的技能写成已经熟练。" },
  { kind: "anchor", text: "请一直记住，涉及个人信息时先提醒我确认。" },
  { kind: "anchor", text: "我希望穗奈在不确定时先问我，而不是替我补事实。" },
  { kind: "emotion", text: "最近看到岗位要求太多时，我会有点焦虑。" },
  { kind: "emotion", text: "我完成一次项目整理后会更有信心。" },
  { kind: "emotion", text: "连续投递没有回复时，我容易怀疑方向。" },
  { kind: "emotion", text: "我对做出能展示的作品有期待，也有一点紧张。" },
  { kind: "emotion", text: "当学习计划太满时，我会感到疲惫，需要更小的下一步。" },
];
for (const sample of samples) {
  const message = store.message(conversation.id, null, "user", sample.text);
  ctx.runtime.memory.observe(session.user.id, conversation.id, [{ kind: sample.kind, text: sample.text, evidence: [{ source_id: "message." + message.id, quote: sample.text }] }]);
}
ctx.runtime.memory.recall(session.user.id, conversation.id, id(), "回想我做过的项目、TypeScript 技能、简历和前端求职计划。");
const serve = process.argv.includes("--serve");
if (serve) {
  const emptySession = ctx.auth.register("memory_empty_preview", "Synthetic-only-2026", true);
  const emptyProfile = await ctx.profiles.save(emptySession.user, { name: "识海空状态预览", mode: "custom", base_url: "https://example.invalid/v1", model: "fixture-only", api_key: "synthetic-only-empty-key" });
  emptyProfile.capabilities = { chat: true, tools: true, stream: false, tested_at: now(), note: "仅视觉预览" };
  store.saveProfile(emptyProfile, null);
  const emptyConversation = store.createConversation(emptySession.user.id, emptyProfile.id, "识海空状态预览");
  for (const fixture of [
    { path: "/__preview/memory", session, profile, conversation },
    { path: "/__preview/memory-empty", session: emptySession, profile: emptyProfile, conversation: emptyConversation },
  ]) ctx.app.get(fixture.path, async (_request, reply) => reply.type("text/html; charset=utf-8").send("<!doctype html><meta charset=utf-8><title>识海隔离预览</title><script>const values=" + JSON.stringify({
    "career.session.token": fixture.session.token,
    ["agent.conversation." + fixture.session.user.id]: fixture.conversation.id,
    "agent.selectedModel": fixture.profile.id,
    "career.boot.seen": "1",
  }) + ";for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);location.replace('/');</script>"));
}
await ctx.app.listen({ host: "127.0.0.1", port: 8119 });
async function closePreview() {
  await ctx.app.close();
  store.close();
  if (dirname(data) !== logs || !basename(data).startsWith("multi-node-preview-")) throw Error("拒绝清理非预览目录");
  await rm(data, { recursive: true, force: true });
}
if (serve) {
  console.log("Chrome 隔离预览：http://127.0.0.1:8119/__preview/memory；空状态：http://127.0.0.1:8119/__preview/memory-empty");
  await new Promise<void>(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); process.stdin.once("data", () => resolve()); });
  await closePreview();
  process.exit(0);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.addInitScript(({ token, cid, uid, pid }) => {
    localStorage.setItem("career.session.token", token);
    localStorage.setItem("agent.conversation." + uid, cid);
    localStorage.setItem("agent.selectedModel", pid);
    localStorage.setItem("career.boot.seen", "1");
  }, { token: session.token, cid: conversation.id, uid: session.user.id, pid: profile.id });
  await page.goto("http://127.0.0.1:8119/");
  await page.getByRole("button", { name: "打开穗奈识海", exact: true }).first().click();
  const sea = page.getByRole("dialog", { name: "穗奈识海", exact: true });
  await sea.getByRole("heading", { name: "穗奈的识海" }).waitFor();
  await sea.locator('.memory-nebula[data-renderer="webgl"]').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(logs, "memory-sea-multi-node-preview.png"), animations: "disabled" });
  const meta = await sea.evaluate(element => ({ nodes: element.querySelector<HTMLCanvasElement>(".memory-nebula__canvas")?.dataset.nodes, labels: element.querySelectorAll(".memory-nebula__label").length }));
  await writeFile(join(logs, "memory-sea-multi-node-preview.json"), JSON.stringify({ synthetic_data: true, node_count: samples.length, ...meta, screenshot: "memory-sea-multi-node-preview.png" }, null, 2));
  console.log(JSON.stringify({ screenshot: join(logs, "memory-sea-multi-node-preview.png"), ...meta, node_count: samples.length }));
} finally {
  await browser.close();
  await closePreview();
}
