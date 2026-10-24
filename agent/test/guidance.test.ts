/** 青穗集 · 任务与陪伴后台回归：显式路由、事实关卡、只读分析、用户隔离和过时建议丢弃。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";
import { id } from "../src/store.js";
import { activeTask } from "../src/guidance-contract.js";
import { executeTool } from "../src/tools.js";
import type { ModelRequest } from "../src/types.js";
const quote = "我在课程项目中用 React 做了登录表单。";
type Fixture = Awaited<ReturnType<typeof fixture>>;
const task = (f: Fixture, kind: "career" | "learning" | "resume" | null, cid = f.conversation.id, reuse_shared_resume = false) => f.app.inject({ method: "POST", url: "/api/v1/agent/conversations/" + cid + "/task", headers: f.headers, payload: { revision: f.runtime.guidance.view(f.user.id, cid).revision, kind, reuse_shared_resume } });
const seed = (f: Fixture) => f.runtime.resume.change(f.user.id, { revision: f.runtime.resume.get(f.user.id).revision, change: { type: "materials.save", source_text: quote, source_name: "测试合成资料", target: { title: "前端实习", company: "", description: "" } } });
const analysis = (request: ModelRequest, summary = "用户希望整理自己的真实项目经历。") => {
  const input = JSON.parse(request.messages.at(-1)!.content) as { messages: { id: string; role: string }[] };
  return reply(JSON.stringify({ summary, next_step: "先核对项目中自己负责的部分。", suggestion: { kind: "resume", message: "是不是想把这段经历整理成简历？", evidence_message_id: input.messages.filter(m => m.role === "user").at(-1)!.id } }));
};
async function sent(f: Fixture) { f.runtime.start(f.user, f.conversation.id, f.profile.id, "我想把项目经历写进简历。", id()); await f.runtime.waitIdle(); return f.store.messages(f.conversation.id).filter(m => m.role === "user").at(-1)!.id; }

test("任务选择与暂停复用当前对话和任务ID，不生成消息或清空历史", async t => {
  const f = await fixture(t);
  const first = await task(f, "career"); assert.equal(first.statusCode, 200);
  const taskId = activeTask(first.json())!.id;
  assert.equal(f.store.conversations(f.user.id).length, 1); assert.equal(f.store.messages(f.conversation.id).length, 0);
  await task(f, "learning"); await task(f, null); const resumed = await task(f, "career");
  assert.equal(activeTask(resumed.json())!.id, taskId); assert.equal(resumed.json().tasks.length, 2);
  const snap = f.runtime.snapshot(f.user, f.conversation.id); assert.equal(activeTask(snap.guidance)?.kind, "career");
});

test("任务更新拒绝过期版本、越权账号和归档对话", async t => {
  const f = await fixture(t); await task(f, "career");
  const url = "/api/v1/agent/conversations/" + f.conversation.id + "/task";
  const stale = await f.app.inject({ method: "POST", url, headers: f.headers, payload: { revision: 0, kind: "resume" } }); assert.equal(stale.statusCode, 409);
  const other = f.auth.register("other_guidance", "Synthetic-password-2026", true);
  const denied = await f.app.inject({ method: "POST", url, headers: { authorization: "Bearer " + other.token }, payload: { revision: 1, kind: "resume" } }); assert.equal(denied.statusCode, 404);
  const conversation = f.store.conversation(f.user.id, f.conversation.id); conversation.archived = true; f.store.updateConversation(conversation);
  assert.equal((await task(f, "learning")).statusCode, 409);
});

test("共享简历接管先确认，另一对话自动暂停且旧对话不能继续改写", async t => {
  const f = await fixture(t); seed(f);
  const denied = await task(f, "resume"); assert.equal(denied.statusCode, 409); assert.equal(denied.json().code, "resume_reuse_required");
  assert.equal((await task(f, "resume", f.conversation.id, true)).statusCode, 200);
  const other = f.store.createConversation(f.user.id, f.profile.id);
  assert.equal((await task(f, "resume", other.id)).statusCode, 409);
  assert.equal((await task(f, "resume", other.id, true)).statusCode, 200);
  assert.equal(activeTask(f.runtime.guidance.view(f.user.id, f.conversation.id)), null);
  assert.throws(() => f.runtime.guidance.assertResumeAccess(f.user.id, f.conversation.id), /另一段对话/);
  assert.equal(f.runtime.resume.get(f.user.id).source_text, quote);
  const change = await f.app.inject({ method: "POST", url: "/api/v1/agent/resume/changes", headers: f.headers, payload: { revision: f.runtime.resume.get(f.user.id).revision, conversation_id: f.conversation.id, change: { type: "task.cancel" } } }); assert.equal(change.statusCode, 409);
});

test("简历下一步由程序根据确认状态安排，不能自动跳过用户核对", async t => {
  let f!: Fixture;
  const model = new ScriptedModel((request, index) => {
    if (index === 0) {
      const state = f.runtime.resume.get(f.user.id); assert.equal(state.pending?.kind, "facts");
      assert.ok(request.tools.some(t => t.name === "propose_resume_update")); assert.ok(!request.tools.some(t => ["run_command", "write_file", "prepare_resume_step"].includes(t.name)));
      return reply("", [tool("propose_resume_update", { request_id: state.pending!.id, data: { kind: "facts", facts: [{ kind: "projects", title: "登录表单", detail: "用 React 做了登录表单", quote }], questions: [] } })]);
    }
    if (index === 1) { assert.equal(f.runtime.resume.get(f.user.id).pending, null); assert.ok(!request.tools.some(t => t.name === "propose_resume_update")); return reply("请核对这段经历。"); }
    assert.equal(f.runtime.resume.get(f.user.id).pending?.kind, "selection"); return reply("我们来讨论本次重点。");
  });
  f = await fixture(t, { model }); seed(f); await task(f, "resume", f.conversation.id, true);
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "整理项目经历", id()); await f.runtime.waitIdle();
  assert.equal(run.task_kind, "resume"); assert.equal(f.runtime.resume.get(f.user.id).facts_confirmed, false);
  assert.equal(f.runtime.guidance.view(f.user.id, f.conversation.id).progress?.stage, "核对经历");
  const state = f.runtime.resume.get(f.user.id); f.runtime.resume.change(f.user.id, { revision: state.revision, change: { type: "facts.confirm", facts: state.facts } });
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "我已核对，继续", id()); await f.runtime.waitIdle();
  assert.equal(f.runtime.resume.get(f.user.id).pending?.kind, "selection"); assert.equal(f.runtime.resume.get(f.user.id).selection_confirmed, false);
});

test("模型即使请求未开放的文件工具，简历任务也不会绕过确认生成文件", async t => {
  const model = new ScriptedModel((_request, index) => index === 0 ? reply("", [tool("write_file", { path: "outputs/绕过.md", content: "未经确认的简历" })]) : reply("先核对事实。"));
  const f = await fixture(t, { model }); await task(f, "resume");
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "整理简历", id()); await f.runtime.waitIdle();
  assert.equal(f.store.artifacts(f.conversation.id).length, 0); assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.ok(f.store.messages(f.conversation.id).some(m => m.role === "tool" && m.content.includes("当前任务未开放")));
});

test("只读模型分析只生成小结与建议，不新增聊天、不启动任务、不调用工具，重复请求复用结果", async t => {
  const model = new ScriptedModel(request => request.tools.length ? reply("请说说项目。") : analysis(request));
  const f = await fixture(t, { model }), messageId = await sent(f), messages = f.store.messages(f.conversation.id).length;
  const first = await f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, messageId);
  assert.equal(first.memory?.source, "model"); assert.equal(first.suggestion?.kind, "resume"); assert.equal(activeTask(first), null);
  assert.equal(f.store.messages(f.conversation.id).length, messages); assert.equal(model.requests.at(-1)!.tools.length, 0);
  assert.ok(model.requests.at(-1)!.maxOutputTokens! <= 600);
  await f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, messageId); assert.equal(model.requests.length, 2);
});

test("分析接口拒绝草稿字段、撤回授权以及其他用户的对话", async t => {
  const f = await fixture(t), messageId = await sent(f), url = "/api/v1/agent/conversations/" + f.conversation.id + "/insights";
  const payload = { profile_id: f.profile.id, message_id: messageId };
  const draft = await f.app.inject({ method: "POST", url, headers: f.headers, payload: { ...payload, draft: "不能上传的草稿" } }); assert.equal(draft.statusCode, 400);
  const other = f.auth.register("other_insight", "Synthetic-password-2026", true);
  assert.equal((await f.app.inject({ method: "POST", url, headers: { authorization: "Bearer " + other.token }, payload })).statusCode, 404);
  f.store.setConsent(f.user.id, false);
  assert.equal((await f.app.inject({ method: "POST", url, headers: f.headers, payload })).statusCode, 403); assert.equal(f.model.requests.length, 1);
});

test("非法JSON、工具请求或没有用户原话依据的建议都不会写入小结", async t => {
  for (const form of ["invalid", "tools", "ungrounded"] as const) {
    const model = new ScriptedModel(request => {
      if (request.tools.length) return reply("测试回复");
      if (form === "invalid") return reply("这不是JSON");
      if (form === "tools") return reply("", [tool("run_command", { command: "never-run" })]);
      const parsed = JSON.parse(analysis(request).text); parsed.suggestion.evidence_message_id = id(); return reply(JSON.stringify(parsed));
    });
    const f = await fixture(t, { model }), messageId = await sent(f);
    await assert.rejects(() => f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, messageId));
    assert.equal(f.runtime.guidance.view(f.user.id, f.conversation.id).memory, null); assert.equal(f.store.artifacts(f.conversation.id).length, 0);
  }
});

test("切换任务会取消正在进行的分析，旧建议不能覆盖新任务", async t => {
  let start!: () => void; const started = new Promise<void>(resolve => { start = resolve; });
  const model = new ScriptedModel(async request => {
    if (request.tools.length) return reply(); start();
    await new Promise<void>((_resolve, reject) => { if (request.signal.aborted) reject(request.signal.reason); else request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }); });
    return analysis(request);
  });
  const f = await fixture(t, { model }), messageId = await sent(f);
  const pending = f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, messageId);
  const rejection = assert.rejects(pending); await started;
  assert.equal((await task(f, "learning")).statusCode, 200); await rejection;
  const view = f.runtime.guidance.view(f.user.id, f.conversation.id); assert.equal(activeTask(view)?.kind, "learning"); assert.equal(view.memory, null);
});


test("接续任务可引用本对话既往用户原话，但不能把助手或其他对话当事实来源", async t => {
  const f = await fixture(t);
  f.runtime.start(f.user, f.conversation.id, f.profile.id, quote, id()); await f.runtime.waitIdle();
  const prior = f.store.messages(f.conversation.id).find(m => m.role === "user")!, assistant = f.store.messages(f.conversation.id).find(m => m.role === "assistant")!;
  const current = f.runtime.start(f.user, f.conversation.id, f.profile.id, "接着刚才说过的经历继续", id()); await f.runtime.waitIdle();
  assert.ok(f.runtime.resume.coachingContext(f.user.id, f.conversation.id).user_messages.some(m => m.id === prior.id));
  const capture = (message_id: string) => executeTool(tool("capture_resume_material", { context_version: f.runtime.resume.get(f.user.id).context_version, section: "experience", quote, source: { kind: "message", message_id } }), current, f.workspace, f.runtime.sandbox, new AbortController().signal, f.runtime.career, f.runtime.resume);
  await capture(prior.id); assert.equal(f.runtime.resume.get(f.user.id).source_text, quote);
  await assert.rejects(() => capture(assistant.id), /助手消息/);
  const other = f.store.createConversation(f.user.id, f.profile.id); f.runtime.start(f.user, other.id, f.profile.id, quote, id()); await f.runtime.waitIdle();
  await assert.rejects(() => capture(f.store.messages(other.id).find(m => m.role === "user")!.id), /其他对话/);
});
