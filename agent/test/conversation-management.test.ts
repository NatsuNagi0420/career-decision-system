/** 青穗集 · 会话管理回归：仅隔离测试数据，验证重命名、归属、运行保护、文件清理与连续职业对话。 */
import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";
import { id } from "../src/store.js";
import { materializeArtifact } from "../src/local-artifacts.js";
const url = (cid: string) => "/api/v1/agent/conversations/" + cid;
async function missing(path: string) { await assert.rejects(access(path), { code: "ENOENT" }); }

test("重命名校验、trim、隔离；手动命名后首条消息不覆盖名字", async t => {
  const f = await fixture(t), path = url(f.conversation.id);
  const rename = (title: string) => f.app.inject({ method: "PATCH", url: path, headers: f.headers, payload: { title } });
  for (const title of ["  ", "x".repeat(81)]) assert.equal((await rename(title)).statusCode, 400);
  assert.equal((await rename("  前端方向与学习计划  ")).json().title, "前端方向与学习计划");
  const stranger = f.auth.register("rename_other", "Test-password-2026", true);
  assert.equal((await f.app.inject({ method: "PATCH", url: path, headers: { authorization: "Bearer " + stranger.token }, payload: { title: "越权修改" } })).statusCode, 404);
  assert.equal((await rename("新的对话")).json().title_manual, true);
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "这条消息不能覆盖我手动设置的标题", id()); await f.runtime.waitIdle();
  assert.equal(f.store.conversation(f.user.id, f.conversation.id).title, "新的对话");
});

test("运行时可改名，运行中和取消后仍清理时禁止永久删除", async t => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture(t, { model: new ScriptedModel(async () => { entered(); await gate; return reply(); }) });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "测试运行", id());
  await started;
  try {
    assert.equal((await f.app.inject({ method: "PATCH", url: url(f.conversation.id), headers: f.headers, payload: { title: "进行中的探索" } })).statusCode, 200);
    assert.equal((await f.app.inject({ method: "DELETE", url: url(f.conversation.id), headers: f.headers })).statusCode, 409);
    f.runtime.cancel(f.user, run.id);
    const cleaning = await f.app.inject({ method: "DELETE", url: url(f.conversation.id), headers: f.headers });
    assert.equal(cleaning.statusCode, 409); assert.match(cleaning.json().detail, /清理/);
  } finally { release(); await f.runtime.waitIdle(); }
  assert.equal((await f.app.inject({ method: "DELETE", url: url(f.conversation.id), headers: f.headers })).statusCode, 200);
});

test("永久删除聊天关联表、导入、全部成果版本和打开缓存；保留其他聊天及独立档案草稿", async t => {
  const f = await fixture(t), cid = f.conversation.id;
  const input = await f.workspace.import(cid, "经历.md", Buffer.from("测试经历原文").toString("base64"));
  const v1 = await f.workspace.write(cid, null, "outputs/计划.md", "第一版");
  const v2 = await f.workspace.write(cid, null, "outputs/计划.md", "第二版");
  const opened = await materializeArtifact(f.workspace, v2);
  const approval = await f.runtime.requestExport(f.user, v2.id); await f.runtime.decide(f.user, approval.id, true);
  f.runtime.start(f.user, cid, f.profile.id, "合成测试消息", id()); await f.runtime.waitIdle();
  const resume = f.runtime.resume.change(f.user.id, { revision: 0, change: { type: "materials.save", source_text: "独立保存的真实原句（合成测试）", source_name: "测试", target: { title: "", company: "", description: "" } } });
  const career = f.runtime.career.get(f.user.id);
  const retained = f.store.createConversation(f.user.id, f.profile.id, "不能误删的另一段对话");
  const retainedFile = await f.workspace.write(retained.id, null, "outputs/保留.md", "保留内容");
  let deletedEvent = ""; f.runtime.hub.once("conversation.deleted", value => { deletedEvent = value; });
  const archived = f.store.conversation(f.user.id, cid); archived.archived = true; f.store.updateConversation(archived);
  const result = await f.app.inject({ method: "DELETE", url: url(cid), headers: f.headers });
  assert.equal(result.statusCode, 200, result.body); assert.deepEqual(result.json(), { ok: true, id: cid }); assert.equal(deletedEvent, cid);
  for (const table of ["runs", "messages", "events", "approvals", "artifacts"]) assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM " + table + " WHERE conversation_id=?").get(cid)!.n, 0);
  assert.throws(() => f.store.conversation(f.user.id, cid), /对话不存在/);
  await missing(join(f.dir, "workspaces", cid));
  for (const file of [input, v1, v2]) await missing(join(f.dir, "artifacts", file.id));
  await missing(opened); await missing(join(f.dir, "local-open", v2.id));
  assert.equal((await f.workspace.artifactBytes(retainedFile)).toString(), "保留内容");
  assert.deepEqual(f.runtime.resume.get(f.user.id), resume); assert.deepEqual(f.runtime.career.get(f.user.id), career);
  assert.equal((await f.app.inject({ method: "GET", url: pathForArtifact(v2.id), headers: f.headers })).statusCode, 404);
  assert.equal((await f.app.inject({ method: "DELETE", url: url(cid), headers: f.headers })).statusCode, 404);
});
function pathForArtifact(artifactId: string) { return "/api/v1/agent/artifacts/" + artifactId + "/preview"; }

test("未登录、跨账号和不合法标识不能删除", async t => {
  const f = await fixture(t), stranger = f.auth.register("delete_other", "Test-password-2026", true);
  assert.equal((await f.app.inject({ method: "DELETE", url: url(f.conversation.id) })).statusCode, 401);
  assert.equal((await f.app.inject({ method: "DELETE", url: url(f.conversation.id), headers: { authorization: "Bearer " + stranger.token } })).statusCode, 404);
  assert.equal((await f.app.inject({ method: "DELETE", url: url("not-a-uuid"), headers: f.headers })).statusCode, 400);
  assert.equal(f.store.conversations(f.user.id).length, 1);
});

test("文件操作期间拒绝删除；删除持锁期间拒绝并发改名、上传和运行", async t => {
  const f = await fixture(t), cid = f.conversation.id;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const fileTask = f.workspace.withFiles(cid, () => gate);
  assert.equal((await f.app.inject({ method: "DELETE", url: url(cid), headers: f.headers })).statusCode, 409);
  release(); await fileTask;
  let clean!: () => void, entered!: () => void;
  const wait = new Promise<void>(resolve => { clean = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const remove = f.workspace.removeConversation.bind(f.workspace);
  f.workspace.removeConversation = async (...args) => { entered(); await wait; return remove(...args); };
  const deletion = f.app.inject({ method: "DELETE", url: url(cid), headers: f.headers });
  void deletion.then(() => {}); await started;
  try {
    assert.equal((await f.app.inject({ method: "PATCH", url: url(cid), headers: f.headers, payload: { title: "不能在删除中写回" } })).statusCode, 409);
    assert.equal((await f.app.inject({ method: "POST", url: url(cid) + "/files", headers: f.headers, payload: { name: "阻止.md", base64: "YQ==" } })).statusCode, 409);
    await assert.rejects(f.workspace.write(cid, null, "outputs/阻止.md", "不能重建文件夹"), /正在删除/);
    assert.throws(() => f.runtime.start(f.user, cid, f.profile.id, "不能继续执行", id()), /正在删除/);
  } finally { clean(); }
  assert.equal((await deletion).statusCode, 200); await missing(join(f.dir, "workspaces", cid));
});

test("包含目录联接时整批停止，不遍历或删除链接外的文件", async t => {
  const f = await fixture(t), cid = f.conversation.id;
  const workspace = await f.workspace.root(cid), outside = join(f.dir, "outside-must-survive");
  await mkdir(outside); await writeFile(join(outside, "保留.txt"), "不能删除");
  const link = join(workspace, "outputs", "outside-link");
  try { await symlink(outside, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { t.skip("当前环境不允许创建测试链接"); return; } throw error; }
  const denied = await f.app.inject({ method: "DELETE", url: url(cid), headers: f.headers });
  assert.equal(denied.statusCode, 409); assert.match(denied.json().detail, /链接|联接/);
  assert.equal(await readFile(join(outside, "保留.txt"), "utf8"), "不能删除");
  assert.equal(f.store.conversation(f.user.id, cid).id, cid);
  await unlink(link);
  assert.equal((await f.app.inject({ method: "DELETE", url: url(cid), headers: f.headers })).statusCode, 200);
});

test("普通主对话原地收集简历，然后继续方向学习，不新增对话或丢上下文", async t => {
  const quote = "我用 TypeScript 做了课程项目，想学前端。";
  let f!: Awaited<ReturnType<typeof fixture>>;
  const model = new ScriptedModel((request, index) => {
    assert.ok(request.tools.some(item => item.name === "read_career_context"));
    assert.ok(request.tools.some(item => item.name === "capture_resume_material"));
    assert.match(request.messages[0].content, /不切换或新开对话/);
    if (index === 0) return reply("", [tool("capture_resume_material", { context_version: 0, section: "experience", quote, source: { kind: "message" } })]);
    return reply(index === 1 ? "已记下这句原文，先聊你亲手负责了哪部分。" : "我们接着谈学习计划，不需要再开对话。");
  });
  f = await fixture(t, { model });
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "请帮我整理简历。" + quote, id()); await f.runtime.waitIdle();
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "先不做简历了，接着聊我该学什么", id()); await f.runtime.waitIdle();
  assert.ok(f.store.runs(f.conversation.id).every(run => run.status === "completed"));
  assert.equal(f.store.conversations(f.user.id).length, 1);
  assert.equal(f.runtime.resume.get(f.user.id).source_text, quote);
  assert.equal(f.runtime.resume.get(f.user.id).facts_confirmed, false);
  assert.ok(model.requests.at(-1)!.messages.some(message => message.content.includes(quote)));
});


test("同轮整理简历时不能经通用文件工具绕过核对，下一轮普通任务不受限制", async t => {
  const quote = "我独立做了报名页，负责表单验证。";
  const model = new ScriptedModel((_request, index) => {
    if (index === 0) return reply("", [tool("capture_resume_material", { context_version: 0, section: "experience", quote, source: { kind: "message" } })]);
    if (index === 1) return reply("", [tool("write_file", { path: "outputs/未确认的简历.md", content: "不能发布" })]);
    if (index === 3) return reply("", [tool("write_file", { path: "outputs/学习计划.md", content: "第一周学习 TypeScript" })]);
    return reply("完成测试替身响应");
  });
  const f = await fixture(t, { model });
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "请整理简历。" + quote, id()); await f.runtime.waitIdle();
  assert.equal(f.store.artifacts(f.conversation.id).length, 0);
  assert.ok(f.store.messages(f.conversation.id).some(message => message.role === "tool" && message.content.includes("不能通过通用文件工具")));
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "现在请单独保存一份学习计划", id()); await f.runtime.waitIdle();
  assert.equal(f.store.artifacts(f.conversation.id)[0]?.name, "学习计划.md");
});
