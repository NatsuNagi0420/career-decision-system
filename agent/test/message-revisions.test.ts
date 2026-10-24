/** 青穗集 · 消息重发回归：非破坏分支、模型上下文、幂等、越权与失败前置校验。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply } from "./helpers.js";
import { id } from "../src/store.js";
import { emptyGuidance } from "../src/guidance-contract.js";

test("编辑较早消息后仅用新分支续答；旧分支、文件和已保存资料保留", async t => {
  const f = await fixture(t, { model: new ScriptedModel(request => reply("答复：" + request.messages.filter(message => message.role === "user").at(-1)!.content)) });
  for (const input of ["保留的前文", "旧目标：后端", "旧后续：只学 Java"]) { f.runtime.start(f.user, f.conversation.id, f.profile.id, input, id()); await f.runtime.waitIdle(); }
  const old = f.store.messages(f.conversation.id), source = old.find(message => message.content === "旧目标：后端")!;
  const originalRun = f.store.run(f.user.id, source.run_id!);
  const artifact = await f.workspace.write(f.conversation.id, source.run_id, "outputs/保留.md", "文件不回滚");
  const resume = f.runtime.resume.change(f.user.id, { revision: 0, change: { type: "materials.save", source_text: "已保存的真实材料", source_name: "合成测试", target: { title: "", company: "", description: "" } } });
  const conversation = f.store.conversation(f.user.id, f.conversation.id);
  conversation.guidance = { ...emptyGuidance(), revision: 3, memory: { summary: "旧目标是后端", next_step: "学习 Java", through_message_id: source.id, source: "model", updated_at: source.created_at }, analyzed_message_id: source.id };
  f.store.updateConversation(conversation);
  const fresh = f.runtime.start(f.user, conversation.id, f.profile.id, "新目标：前端", id(), { replaces_message_id: source.id }); await f.runtime.waitIdle();
  const visible = f.store.messages(conversation.id);
  assert.deepEqual(visible.filter(message => message.role === "user").map(message => message.content), ["保留的前文", "新目标：前端"]);
  assert.ok(visible.some(message => message.content === "答复：新目标：前端"));
  const request = f.model.requests.at(-1)!;
  assert.deepEqual(request.messages.filter(message => message.role === "user").map(message => message.content), ["保留的前文", "新目标：前端"]);
  assert.ok(!JSON.stringify(request.messages).includes("旧后续"));
  assert.equal(f.store.messages(conversation.id, true).find(message => message.id === source.id)?.superseded_by, fresh.id);
  assert.equal(f.store.runs(conversation.id).length, 2); assert.equal(f.store.runs(conversation.id, true).length, 4);
  assert.equal(f.store.run(f.user.id, source.run_id!).updated_at, originalRun.updated_at);
  assert.equal(f.runtime.snapshot(f.user, conversation.id).guidance.memory, null);
  assert.equal(f.store.artifact(f.user.id, artifact.id).id, artifact.id);
  assert.deepEqual(f.runtime.resume.get(f.user.id), resume);
  const snapshot = f.runtime.snapshot(f.user, conversation.id);
  assert.ok(snapshot.events.every(event => !event.run_id || ![source.run_id, old.at(-1)!.run_id].includes(event.run_id)));
  assert.ok(snapshot.events.some(event => event.kind === "conversation.rewound"));
});

test("编辑重发使用同一请求标识重试不会再次回退或启动任务", async t => {
  const f = await fixture(t); f.runtime.start(f.user, f.conversation.id, f.profile.id, "旧文本", id()); await f.runtime.waitIdle();
  const source = f.store.messages(f.conversation.id)[0], requestId = id();
  const edited = f.runtime.start(f.user, f.conversation.id, f.profile.id, "新文本", requestId, { replaces_message_id: source.id }); await f.runtime.waitIdle();
  const before = f.store.messages(f.conversation.id, true).length;
  assert.equal(f.runtime.start(f.user, f.conversation.id, f.profile.id, "新文本", requestId, { replaces_message_id: source.id }).id, edited.id);
  assert.equal(f.store.messages(f.conversation.id, true).length, before);
  assert.throws(() => f.runtime.start(f.user, f.conversation.id, f.profile.id, "新文本", requestId), /相同提交标识/);
  assert.throws(() => f.runtime.start(f.user, f.conversation.id, f.profile.id, "另一文本", id(), { replaces_message_id: source.id }), /只能编辑/);
});

test("拒绝助手消息、其他会话消息和未授权账号，不改写现有对话", async t => {
  const f = await fixture(t); f.runtime.start(f.user, f.conversation.id, f.profile.id, "原消息", id()); await f.runtime.waitIdle();
  const messages = f.store.messages(f.conversation.id), other = f.store.createConversation(f.user.id, f.profile.id);
  const outsider = f.store.message(other.id, null, "user", "别的对话");
  for (const messageId of [messages.find(message => message.role === "assistant")!.id, outsider.id, id()])
    assert.throws(() => f.runtime.start(f.user, f.conversation.id, f.profile.id, "替换", id(), { replaces_message_id: messageId }), /只能编辑/);
  const stranger = f.auth.register("edit_other", "Synthetic-password-2026", true);
  assert.throws(() => f.runtime.start(stranger.user, f.conversation.id, f.profile.id, "替换", id(), { replaces_message_id: messages[0].id }), /对话不存在/);
  assert.deepEqual(f.store.messages(f.conversation.id), messages);
});

test("活跃任务、归档和不可用模型均在修改历史前阻止编辑", async t => {
  let release!: () => void;
  const f = await fixture(t, { model: new ScriptedModel(async request => { await new Promise<void>(resolve => { release = resolve; request.signal.addEventListener("abort", () => resolve(), { once: true }); }); return reply(); }) });
  const active = f.runtime.start(f.user, f.conversation.id, f.profile.id, "原消息", id());
  await new Promise<void>(resolve => setImmediate(resolve));
  const original = f.store.messages(f.conversation.id)[0];
  assert.throws(() => f.runtime.start(f.user, f.conversation.id, f.profile.id, "替换", id(), { replaces_message_id: original.id }), /正在|运行|任务/);
  f.runtime.cancel(f.user, active.id); release?.(); await f.runtime.waitIdle();
  const conversation = f.store.conversation(f.user.id, f.conversation.id); conversation.archived = true; f.store.updateConversation(conversation);
  assert.throws(() => f.runtime.start(f.user, conversation.id, f.profile.id, "替换", id(), { replaces_message_id: original.id }), /归档/);
  conversation.archived = false; f.store.updateConversation(conversation);
  const profile = f.store.profile(f.user.id, f.profile.id); profile.capabilities.chat = false; f.store.saveProfile(profile, null);
  assert.throws(() => f.runtime.start(f.user, conversation.id, profile.id, "替换", id(), { replaces_message_id: original.id }), /连接测试/);
  assert.equal(f.store.messages(conversation.id)[0].id, original.id);
});

test("HTTP 接受编辑重发，拒绝无效消息标识且保持归属校验", async t => {
  const f = await fixture(t); f.runtime.start(f.user, f.conversation.id, f.profile.id, "原消息", id()); await f.runtime.waitIdle();
  const source = f.store.messages(f.conversation.id)[0], url = "/api/v1/agent/conversations/" + f.conversation.id + "/runs";
  const payload = { profile_id: f.profile.id, input: "修改后的消息", request_id: id(), replaces_message_id: source.id };
  assert.equal((await f.app.inject({ method: "POST", url, headers: f.headers, payload: { ...payload, replaces_message_id: "bad-id" } })).statusCode, 400);
  const response = await f.app.inject({ method: "POST", url, headers: f.headers, payload });
  assert.equal(response.statusCode, 200); await f.runtime.waitIdle();
  assert.equal(f.store.messages(f.conversation.id).filter(message => message.role === "user").length, 1);
  assert.equal((await f.app.inject({ method: "POST", url, headers: f.headers, payload })).json().id, response.json().id);
});

test("编辑流式消息后，排队阶段的快照不得把旧分支的正文复活成第二条草稿", async t => {
  let release!: () => void, entered!: () => void;
  const resume = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture(t, { model: new ScriptedModel(async (request, index) => {
    const text = index === 0 ? "旧分支的流式答复" : "修改后的唯一答复";
    request.onDelta?.(text);
    if (index > 0) { entered(); await resume; }
    return { ...reply(text), streamed: true };
  }) });
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "旧问题", id()); await f.runtime.waitIdle();
  const source = f.store.messages(f.conversation.id)[0];
  const edited = f.runtime.start(f.user, f.conversation.id, f.profile.id, "修改后的问题", id(), { replaces_message_id: source.id });
  try {
    // start 的驱动使用 setImmediate，此时新 model.started 尚未产生，精确覆盖原来的竞态窗口。
    const queued = f.runtime.snapshot(f.user, f.conversation.id);
    assert.equal(queued.runs.at(-1)!.status, "queued");
    assert.deepEqual(queued.drafts, {}, "旧回复不应作为正在回复的草稿再次出现");
    await started;
    // 即使旧 run 的残片比新 model.started 晚到，也不能混入当前回复。
    f.store.appendEvent(f.conversation.id, source.run_id, "answer.delta", { message_id: "old-late", text: "旧残片" });
    assert.deepEqual(Object.values(f.runtime.snapshot(f.user, f.conversation.id).drafts), ["修改后的唯一答复"]);
  } finally { release(); await f.runtime.waitIdle(); }
  const done = f.runtime.snapshot(f.user, f.conversation.id);
  assert.equal(done.runs.at(-1)!.id, edited.id);
  assert.deepEqual(done.messages.filter(message => message.role === "assistant").map(message => message.content), ["修改后的唯一答复"]);
  assert.deepEqual(done.drafts, {});
  assert.equal(f.model.requests.length, 2);
});

test("上一轮失败留下流式片段后，新发送排队也不恢复上一轮的孤立草稿", async t => {
  const f = await fixture(t, { model: new ScriptedModel((request, index) => {
    if (index === 0) { request.onDelta?.("中断前的旧残片"); throw Error("合成模型中断"); }
    return reply("新一轮回复");
  }) });
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "旧问题", id()); await f.runtime.waitIdle();
  assert.equal(f.store.runs(f.conversation.id)[0].status, "failed");
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "新的问题", id());
  try { assert.deepEqual(f.runtime.snapshot(f.user, f.conversation.id).drafts, {}); }
  finally { await f.runtime.waitIdle(); }
});
