/** 青穗集 · 简历流程回归：真实 SQLite 与文件，脚本模型仅作替身，检验确认关卡、事实来源、过期拒绝和安全交付。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";
import { id } from "../src/store.js";
import { readPartialResumeJson } from "../src/resume-stream.js";
import { renderResumeHtml } from "../src/resume-render.js";
import type { ResumeState, ResumeChange, ResumeBody, ResumeSelection } from "../src/resume-contract.js";

const source = "软件工程本科，2027 届。项目甲：我使用 React 和 TypeScript 实现报名表单，与同学用 Git 协作。摄影社团：负责拍照。";
const target = { title: "前端实习", company: "测试虚构公司", description: "面向 2027 届本科生。熟悉 React。了解 TypeScript 与 Git。自动化测试优先。" };
const facts = [
  { kind: "education", title: "软件工程本科", detail: "软件工程本科，2027 届。", quote: "软件工程本科，2027 届。" },
  { kind: "projects", title: "项目甲", detail: "使用 React 和 TypeScript 实现报名表单，与同学用 Git 协作。", quote: "项目甲：我使用 React 和 TypeScript 实现报名表单，与同学用 Git 协作。" },
  { kind: "experience", title: "摄影社团", detail: "负责拍照。", quote: "摄影社团：负责拍照。" },
];
type Fixture = Awaited<ReturnType<typeof fixture>>;
function change(f: Fixture, input: ResumeChange) { return f.runtime.resume.change(f.user.id, { revision: f.runtime.resume.get(f.user.id).revision, change: input }); }
function propose(f: Fixture, data: unknown) { return f.runtime.resume.propose(f.user.id, f.conversation.id, { request_id: f.runtime.resume.get(f.user.id).pending!.id, data }); }
function readyFacts(f: Fixture) {
  change(f, { type: "materials.save", source_text: source, source_name: "测试材料", target });
  change(f, { type: "task.request", kind: "facts" });
  propose(f, { kind: "facts", facts, questions: ["是否有可展示的代码？"] });
  return change(f, { type: "facts.confirm", facts: f.runtime.resume.get(f.user.id).facts });
}
function selection(state: ResumeState): ResumeSelection {
  return { requirements: [
    { quote: "熟悉 React", importance: "essential", status: "supported", fact_ids: [state.facts[1].id], note: "项目甲中有相关实践。" },
    { quote: "自动化测试优先", importance: "preferred", status: "unknown", fact_ids: [], note: "未提供相关材料。" },
  ], choices: state.facts.map((f, i) => ({ fact_id: f.id, use: i === 2 ? "omit" : "primary", reason: i === 2 ? "关联较弱，本次不展示。" : "与目标相关。" })) };
}
function readySelection(f: Fixture) {
  const state = readyFacts(f);
  change(f, { type: "task.request", kind: "selection" });
  const value = selection(state); propose(f, { kind: "selection", selection: value });
  return change(f, { type: "selection.confirm", choices: value.choices });
}
function body(state: ResumeState): ResumeBody {
  return { summary: { text: "", fact_ids: [] }, sections: [
    { kind: "education", entries: [{ title: "软件工程本科", subtitle: "", period: "2027 届", fact_ids: [state.facts[0].id], bullets: [] }] },
    { kind: "projects", entries: [{ title: "项目甲", subtitle: "", period: "", fact_ids: [state.facts[1].id], bullets: ["使用 React 和 TypeScript 实现报名表单，与同学用 Git 协作。"] }] },
  ] };
}

test("简历接口要求登录并隔离账号，拒绝跳过确认和旧版本覆盖", async t => {
  const f = await fixture(t);
  assert.equal((await f.app.inject({ method: "GET", url: "/api/v1/agent/resume" })).statusCode, 401);
  assert.throws(() => change(f, { type: "task.request", kind: "rewrite" }), /保存经历原文/);
  readyFacts(f);
  assert.throws(() => change(f, { type: "task.request", kind: "rewrite" }), /确认本次简历/);
  const other = f.auth.register("resume_other", "Test-password-2026", false);
  assert.equal(f.runtime.resume.get(other.user.id).source_text, "");
  assert.throws(() => f.runtime.resume.change(f.user.id, { revision: 0, change: { type: "task.cancel" } }), /其他位置更新/);
  assert.equal(f.runtime.career.get(f.user.id).profile.experience, "");
});

test("逐字来源与数字约束阻止假引用，取消后的旧模型结果不能覆盖新材料", async t => {
  const f = await fixture(t);
  change(f, { type: "materials.save", source_text: source, source_name: "原文", target });
  const task = change(f, { type: "task.request", kind: "facts" });
  assert.throws(() => propose(f, { kind: "facts", facts: [{ ...facts[1], quote: "我是负责人" }], questions: [] }), /逐字引用/);
  assert.throws(() => propose(f, { kind: "facts", facts: [{ ...facts[1], detail: "提升效率 50%" }], questions: [] }), /没有的数字/);
  change(f, { type: "task.cancel" });
  assert.throws(() => f.runtime.resume.propose(f.user.id, f.conversation.id, { request_id: task.pending!.id, data: { kind: "facts", facts, questions: [] } }), /任务已结束/);
});

test("岗位取舍必须逐字引用 JD，逐条安排事实；未确认取舍不能进入改写", async t => {
  const f = await fixture(t), state = readyFacts(f), value = selection(state);
  change(f, { type: "task.request", kind: "selection" });
  assert.throws(() => propose(f, { kind: "selection", selection: { ...value, choices: value.choices.slice(1) } }), /不能遗漏/);
  assert.throws(() => propose(f, { kind: "selection", selection: { ...value, requirements: [{ ...value.requirements[0], quote: "必须会 Vue" }] } }), /逐字来自/);
  assert.throws(() => propose(f, { kind: "selection", selection: { ...value, requirements: [{ ...value.requirements[0], fact_ids: [] }] } }), /材料不足/);
  propose(f, { kind: "selection", selection: value });
  assert.throws(() => change(f, { type: "task.request", kind: "rewrite" }), /确认本次简历/);
});

test("正式正文拒绝不展示的经历与新增数字，改目标使取舍和正文失效，原文仍保存", async t => {
  const f = await fixture(t), state = readySelection(f), draft = body(state);
  change(f, { type: "task.request", kind: "rewrite" });
  const invalid = structuredClone(draft); invalid.sections[1].entries[0].fact_ids = [state.facts[2].id];
  assert.throws(() => propose(f, { kind: "rewrite", body: invalid }), /本次保留/);
  const invented = structuredClone(draft); invented.sections[1].entries[0].bullets.push("服务 10000 用户，提升 50%。");
  assert.throws(() => propose(f, { kind: "rewrite", body: invented }), /没有的数字/);
  propose(f, { kind: "rewrite", body: draft });
  const saved = change(f, { type: "document.save", header: { name: "测试用户", headline: "前端实习", contact: "" }, body: draft });
  assert.throws(() => f.runtime.resume.confirmed(f.user.id, saved.revision), /先确认/);
  const next = change(f, { type: "materials.save", source_text: source, source_name: "原文", target: { ...target, title: "后端实习" } });
  assert.equal(next.facts_confirmed, true); assert.equal(next.selection, null); assert.equal(next.body, null); assert.equal(next.source_text, source);
  assert.ok(f.store.db.prepare("SELECT COUNT(*) as count FROM resume_history WHERE user_id=?").get(f.user.id));
});

test("确认后交付真实 HTML 与 JSON，正文转义且不带被排除经历，不自动生成伪 PDF", async t => {
  const f = await fixture(t), state = readySelection(f), draft = body(state);
  change(f, { type: "task.request", kind: "rewrite" }); propose(f, { kind: "rewrite", body: draft });
  const edited = structuredClone(draft); edited.sections[1].entries[0].title = "<img src=x onerror=alert(1)>";
  change(f, { type: "document.save", header: { name: "测试 <script>", headline: "前端实习", contact: "test@example.com" }, body: edited });
  const before = await f.app.inject({ method: "POST", url: "/api/v1/agent/resume/export", headers: f.headers, payload: { revision: f.runtime.resume.get(f.user.id).revision, conversation_id: f.conversation.id } });
  assert.equal(before.statusCode, 409);
  const confirmed = change(f, { type: "document.confirm" });
  const exported = await f.app.inject({ method: "POST", url: "/api/v1/agent/resume/export", headers: f.headers, payload: { revision: confirmed.revision, conversation_id: f.conversation.id } });
  assert.equal(exported.statusCode, 200);
  const artifacts = exported.json().artifacts as { id: string; name: string }[];
  assert.equal(artifacts.length, 2); assert.ok(artifacts.some(a => a.name.endsWith(".html"))); assert.ok(artifacts.some(a => a.name.endsWith(".json")));
  const htmlFile = f.store.artifact(f.user.id, artifacts.find(a => a.name.endsWith(".html"))!.id);
  const html = (await f.workspace.artifactBytes(htmlFile)).toString("utf8");
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src/); assert.doesNotMatch(html, /摄影社团/); assert.doesNotMatch(html, /overflow:\s*hidden/);
  assert.equal((await f.app.inject({ method: "GET", url: "/api/v1/agent/artifacts/" + htmlFile.id + "/preview", headers: f.headers })).statusCode, 200);
  const other = f.auth.register("resume_export_other", "Test-password-2026", false);
  assert.notEqual((await f.app.inject({ method: "GET", url: "/api/v1/agent/artifacts/" + htmlFile.id + "/preview", headers: { ...f.headers, authorization: "Bearer " + other.token } })).statusCode, 200);
});

test("简历任务复用 Agent 工具循环，提交草稿后程序立即停止，后续命令不会执行", async t => {
  let requestId = "";
  const model = new ScriptedModel((_request, index) => {
    if (index === 0) return reply("", [tool("read_resume_context", {})]);
    if (index === 1) return reply("", [tool("propose_resume_update", { request_id: requestId, data: { kind: "facts", facts, questions: [] } }), tool("write_file", { path: "outputs/不该生成.txt", content: "错误" })]);
    return reply("不应继续调用");
  });
  const f = await fixture(t, { model });
  change(f, { type: "materials.save", source_text: source, source_name: "测试材料", target });
  requestId = change(f, { type: "task.request", kind: "facts" }).pending!.id;
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "[简历工坊] request_id=" + requestId + "\n整理经历", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(model.requests.length, 2);
  assert.ok(model.requests.every(r => !r.tools.some(t => ["run_command", "write_file"].includes(t.name))));
  assert.equal(f.runtime.resume.get(f.user.id).facts_confirmed, false);
  assert.equal(f.runtime.resume.get(f.user.id).facts.length, 3);
  assert.equal(f.store.artifacts(f.conversation.id).length, 0);
});

test("排版按结构输出全部段落，并将带标签文本作为文字", () => {
  const draft: ResumeBody = { summary: { text: "A&B", fact_ids: ["a"] }, sections: [{ kind: "projects", entries: [{ title: "<script>", subtitle: "", period: "", fact_ids: ["a"], bullets: Array.from({ length: 5 }, (_, i) => "长段落" + i + "x".repeat(1000)) }] }] };
  const html = renderResumeHtml({ name: "测试", headline: "", contact: "" }, draft);
  assert.match(html, /A&amp;B/); assert.match(html, /&lt;script&gt;/); assert.match(html, /长段落4/); assert.doesNotMatch(html, /<script>/);
});

test("手填的姓名与联系方式不随工坊上下文发送给模型，正文不得静默漏掉已保留经历", async t => {
  const f = await fixture(t), state = readySelection(f), draft = body(state);
  change(f, { type: "task.request", kind: "rewrite" });
  const missing = structuredClone(draft); missing.sections = missing.sections.slice(1);
  assert.throws(() => propose(f, { kind: "rewrite", body: missing }), /不能静默丢弃/);
  propose(f, { kind: "rewrite", body: draft });
  change(f, { type: "document.save", header: { name: "本地私有姓名", headline: "前端实习", contact: "private-contact@example.com" }, body: draft });
  change(f, { type: "task.request", kind: "rewrite" });
  const context = JSON.stringify(f.runtime.resume.context(f.user.id));
  assert.doesNotMatch(context, /本地私有姓名|private-contact/);
  assert.match(context, /React/);
});

test("简历 JSON 参数分片仅读取完整值，转义、截断和非法代码不会被补造", () => {
  const input = JSON.stringify({ request_id: "请求", data: { kind: "rewrite", body: { summary: { text: '引用 \"React\" 与反斜杠 \\', fact_ids: ["one"] }, sections: [] } } });
  assert.deepEqual(JSON.parse(JSON.stringify(readPartialResumeJson(input))), JSON.parse(input));
  assert.equal((readPartialResumeJson('{"text":"尚未完成') as any).text, undefined);
  assert.equal((readPartialResumeJson('{"done":"完整","next":"截断') as any).done, "完整");
  assert.equal((readPartialResumeJson('{"done":"完整","next":"截断') as any).next, undefined);
  assert.equal(readPartialResumeJson('{"x":alert(1)}'), null);
  assert.equal(readPartialResumeJson('{"x":1} additional'), null);
  assert.equal(readPartialResumeJson('['.repeat(30)), null);
});

test("生成中的简历段落必须引用已确认事实，不保存、不过期覆盖，也不接受新增数字", async t => {
  const f = await fixture(t), state = readySelection(f), draft = body(state);
  const pending = change(f, { type: "task.request", kind: "rewrite" });
  const encode = (value: ResumeBody, requestId = pending.pending!.id) => JSON.stringify({ request_id: requestId, data: { kind: "rewrite", body: value } });
  const serialized = encode(draft), endOfEducation = serialized.indexOf('},{"kind":"projects"') + 1;
  assert.ok(endOfEducation > 0);
  const live = f.runtime.resume.livePreview(f.user.id, f.conversation.id, serialized.slice(0, endOfEducation));
  assert.equal(live?.body.sections.length, 1);
  assert.equal(live?.body.sections[0].entries[0].title, "软件工程本科");
  assert.equal(f.runtime.resume.get(f.user.id).body, null);
  assert.equal(f.runtime.resume.get(f.user.id).revision, pending.revision);
  const invalid = structuredClone(draft); invalid.sections[1].entries[0].bullets.push("提升效率 99%");
  assert.equal(f.runtime.resume.livePreview(f.user.id, f.conversation.id, encode(invalid)), null);
  invalid.sections[1].entries[0].bullets.pop(); invalid.sections[1].entries[0].fact_ids = [state.facts[2].id];
  assert.equal(f.runtime.resume.livePreview(f.user.id, f.conversation.id, encode(invalid)), null);
  assert.equal(f.runtime.resume.livePreview(f.user.id, f.conversation.id, encode(draft, id())), null);
  change(f, { type: "task.cancel" });
  assert.equal(f.runtime.resume.livePreview(f.user.id, f.conversation.id, serialized), null);
});

test("真实任务在模型尚未结束时已发布纸面段落，完成后才保存完整正文", async t => {
  let f: Awaited<ReturnType<typeof fixture>>, requestId = "", full: ResumeBody;
  let release!: () => void, announce!: () => void;
  const generated = new Promise<void>(resolve => { announce = resolve; });
  const proceed = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const model = new ScriptedModel(async (request, index) => {
    if (index > 0) return reply("草稿已整理，请核对。");
    const call = tool("propose_resume_update", { request_id: requestId, data: { kind: "rewrite", body: full } });
    const end = call.arguments.indexOf('},{"kind":"projects"') + 1;
    request.onToolDelta?.({ ...call, arguments: call.arguments.slice(0, end) });
    announce();
    await proceed;
    return reply("", [call]);
  });
  f = await fixture(t, { model });
  full = body(readySelection(f));
  requestId = change(f, { type: "task.request", kind: "rewrite" }).pending!.id;
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "请起草简历", id());
  await generated;
  const event = f.store.events(f.conversation.id).find(event => event.kind === "resume.preview");
  assert.ok(event);
  assert.equal((event.data.draft as any).body.sections.length, 1);
  assert.equal(f.store.run(f.user.id, run.id).status, "running");
  assert.equal(f.runtime.resume.get(f.user.id).body, null);
  release(); await f.runtime.waitIdle();
  assert.deepEqual(f.runtime.resume.get(f.user.id).body, full);
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
});

test("选择的简历模板同时用于真实交付 HTML，拒绝任意模板值", async t => {
  const f = await fixture(t), state = readySelection(f), draft = body(state);
  change(f, { type: "task.request", kind: "rewrite" }); propose(f, { kind: "rewrite", body: draft });
  change(f, { type: "document.save", header: { name: "模板测试", headline: "前端实习", contact: "" }, body: draft });
  const confirmed = change(f, { type: "document.confirm" });
  for (const template_id of ["one-page", "study", "compact"]) {
    const exported = await f.app.inject({ method: "POST", url: "/api/v1/agent/resume/export", headers: f.headers, payload: { revision: confirmed.revision, conversation_id: f.conversation.id, template_id } });
    assert.equal(exported.statusCode, 200);
    const artifacts = exported.json().artifacts as { id: string; name: string }[];
    const file = f.store.artifact(f.user.id, artifacts.find(file => file.name.endsWith(".html"))!.id);
    const html = (await f.workspace.artifactBytes(file)).toString("utf8");
    assert.ok(html.includes('body class="resume-theme-' + template_id + '"'));
    const margin = template_id === "study" ? "18mm 17mm" : template_id === "compact" ? "10mm 12mm" : "14mm 15mm";
    assert.ok(html.includes("@page{size:A4;margin:" + margin + "}"));
  }
  const invalid = await f.app.inject({ method: "POST", url: "/api/v1/agent/resume/export", headers: f.headers, payload: { revision: confirmed.revision, conversation_id: f.conversation.id, template_id: "arbitrary" } });
  assert.equal(invalid.statusCode, 400);
});
