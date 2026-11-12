/** 青穗集 · 穗奈识海回归：验证证据记忆、召回记录、用户纠正与删除边界。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, reply, ScriptedModel } from "./helpers.js";
import { id, now } from "../src/store.js";
import { memoryRetention } from "../src/core/memory-ranking.js";

test("用户原话形成有来源记忆，并能按当前问题召回", async t => {
  const f = await fixture(t, { model: new ScriptedModel(() => reply("已收到。")) });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "我做过校园二手交易平台，负责 React 页面和接口联调。", id());
  await f.runtime.waitIdle();
  const message = f.store.messages(f.conversation.id).find(item => item.role === "user")!;
  f.runtime.memory.observe(f.user.id, f.conversation.id, [{ kind: "experience", text: "做过校园二手交易平台，负责 React 页面和接口联调。", evidence: [{ source_id: "message." + message.id, quote: message.content }] }]);
  const view = f.runtime.memory.view(f.user.id, f.conversation.id);
  assert.equal(view.nodes.length, 1);
  assert.equal(view.nodes[0].sources[0].quote, message.content);
  const context = f.runtime.memory.recall(f.user.id, f.conversation.id, run.id, "校园二手交易平台 React 项目经历");
  assert.match(context ?? "", /校园二手交易平台/);
  assert.equal(f.runtime.memory.view(f.user.id, f.conversation.id).recalls.length, 1);
});

test("记忆纠正后只保留新证据，删除后不再参与召回", async t => {
  const f = await fixture(t);
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "我想走后端开发方向。", id());
  await f.runtime.waitIdle();
  const message = f.store.messages(f.conversation.id).find(item => item.role === "user")!;
  f.runtime.memory.observe(f.user.id, f.conversation.id, [{ kind: "goal", text: "希望走后端开发方向。", evidence: [{ source_id: "message." + message.id, quote: message.content }] }]);
  let node = f.runtime.memory.view(f.user.id, f.conversation.id).nodes[0];
  f.runtime.memory.change(f.user.id, node.id, { action: "correct", revision: node.revision, text: "希望走 TypeScript 后端开发方向。" });
  node = f.runtime.memory.view(f.user.id, f.conversation.id).nodes[0];
  assert.equal(node.confirmed, true); assert.match(node.text, /TypeScript/);
  f.runtime.memory.change(f.user.id, node.id, { action: "delete", revision: node.revision });
  assert.equal(f.runtime.memory.view(f.user.id, f.conversation.id).nodes.length, 0);
  assert.equal(f.runtime.memory.recall(f.user.id, f.conversation.id, run.id + "-2", "后端开发方向"), null);
});

function seed(f: Awaited<ReturnType<typeof fixture>>, text: string, kind: "goal" | "skill" | "experience" | "preference" = "goal", cid = f.conversation.id, conflicts: string[] = []) {
  const message = f.store.message(cid, null, "user", text);
  f.runtime.memory.observe(f.user.id, cid, [{ kind, text, evidence: [{ source_id: "message." + message.id, quote: text }], conflicts_with: conflicts }]);
  return f.runtime.memory.view(f.user.id, cid).nodes.find(node => node.sources.some(source => source.source_id === message.id))!;
}

test("后台整理复用同一次模型返回，非法记忆不拖累合法原话", async t => {
  const model = new ScriptedModel(request => {
    if (request.tools.length) return reply("我们来整理你的经历。");
    const data = JSON.parse(request.messages.at(-1)!.content), source = data.messages.find((m: { role: string }) => m.role === "user");
    return reply(JSON.stringify({ summary: "用户做过 React 项目。", next_step: "核对项目中亲自负责的工作。", suggestion: null, memories: [
      { kind: "skill", text: "做过 React 项目", evidence: [{ source_id: source.source_id, quote: source.content }] },
      { kind: "skill", text: "精通所有架构", evidence: [{ source_id: source.source_id, quote: "这句没有出现在用户原话里" }] },
      { kind: "invented", text: "非法字段" },
    ] }));
  });
  const f = await fixture(t, { model });
  const message = f.store.message(f.conversation.id, null, "user", "我用 React 做过一个项目。");
  await f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, message.id);
  const view = f.runtime.memory.view(f.user.id, f.conversation.id);
  assert.equal(view.nodes.length, 1); assert.match(view.nodes[0].text, /React/);
  assert.equal(model.requests.length, 1); assert.equal(f.runtime.career.get(f.user.id).profile.skills, "");
});

test("同一原话重复整理不增加提及，模型自我召回也不强化遗忘曲线", async t => {
  const f = await fixture(t), first = seed(f, "我希望学习 React 前端。", "goal");
  const evidence = first.sources[0];
  f.runtime.memory.observe(f.user.id, f.conversation.id, [{ kind: "goal", text: "希望学习 React", evidence: [{ source_id: "message." + evidence.source_id, quote: evidence.quote }] }]);
  let view = f.runtime.memory.view(f.user.id); assert.equal(view.nodes.length, 1); assert.equal(view.nodes[0].mentions, 1);
  f.runtime.memory.recall(f.user.id, f.conversation.id, "same-run", "React 前端");
  f.runtime.memory.recall(f.user.id, f.conversation.id, "same-run", "React 前端");
  view = f.runtime.memory.view(f.user.id); assert.equal(view.nodes[0].mentions, 1); assert.equal(view.nodes[0].recall_count, 1); assert.equal(view.recalls.length, 1);
});

test("跨会话召回真正进入模型请求，闲聊不塞入无关背景", async t => {
  const model = new ScriptedModel(() => reply("可以结合你已有的 React 经历。")), f = await fixture(t, { model });
  seed(f, "我在海风校园项目中用 React 实现了商品搜索。", "experience");
  const other = f.store.createConversation(f.user.id, f.profile.id);
  const run = f.runtime.start(f.user, other.id, f.profile.id, "海风校园项目的 React 搜索经历怎么写进简历？", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  const system = model.requests[0].messages.filter(message => message.role === "system").map(message => message.content).join("\n");
  assert.match(system, /检索到的长期记忆/); assert.match(system, /海风校园/); assert.match(system, /source_id/);
  assert.equal(f.runtime.memory.recall(f.user.id, other.id, "unrelated", "今天天气晴朗吗"), null);
  assert.ok(f.store.events(other.id).some(event => event.kind === "memory.recalled"));
});

test("所有记忆接口隔离账号；导出有文档而没有其他人的数据", async t => {
  const f = await fixture(t), node = seed(f, "我希望做 TypeScript 开发。");
  const other = f.auth.register("memory_other", "Test-password-2026", true), headers = { authorization: "Bearer " + other.token, host: "localhost" };
  assert.equal((await f.app.inject({ url: "/api/v1/agent/memory" })).statusCode, 401);
  assert.equal((await f.app.inject({ url: "/api/v1/agent/memory?search=TypeScript", headers })).json().nodes.length, 0);
  assert.equal((await f.app.inject({ url: "/api/v1/agent/memory?conversation_id=" + f.conversation.id, headers })).statusCode, 404);
  assert.equal((await f.app.inject({ method: "POST", url: "/api/v1/agent/memory/" + node.id, headers, payload: { action: "delete", revision: node.revision } })).statusCode, 404);
  const exported = await f.app.inject({ url: "/api/v1/agent/memory/export", headers: f.headers });
  assert.equal(exported.statusCode, 200); assert.match(exported.headers["content-type"] as string, /text\/markdown/); assert.match(exported.body, /TypeScript/);
  assert.doesNotMatch((await f.app.inject({ url: "/api/v1/agent/memory/export", headers })).body, /TypeScript/);
});

test("记录与召回开关分别生效，不删除已有记忆", async t => {
  const f = await fixture(t); seed(f, "我想做前端开发。");
  f.runtime.memory.configure(f.user.id, { enabled: false }); seed(f, "我还想学习后端开发。");
  assert.equal(f.runtime.memory.view(f.user.id).nodes.length, 1);
  assert.match(f.runtime.memory.recall(f.user.id, f.conversation.id, "enabled", "前端开发") ?? "", /前端/);
  f.runtime.memory.configure(f.user.id, { recall_enabled: false });
  assert.equal(f.runtime.memory.recall(f.user.id, f.conversation.id, "disabled", "前端开发"), null);
  assert.equal(f.runtime.memory.view(f.user.id).nodes.length, 1);
});

test("冲突记忆不会同时指导回答，确认后另一条归档", async t => {
  const f = await fixture(t), old = seed(f, "我现在只考虑北京的岗位。", "preference");
  const latest = seed(f, "我现在只考虑上海的岗位，不去北京。", "preference", f.conversation.id, [old.id]);
  assert.equal(latest.conflict_ids[0], old.id);
  assert.equal(f.runtime.memory.recall(f.user.id, f.conversation.id, "conflict", "北京上海岗位"), null);
  f.runtime.memory.change(f.user.id, latest.id, { action: "confirm", revision: latest.revision });
  const view = f.runtime.memory.view(f.user.id);
  assert.equal(view.nodes.find(node => node.id === old.id)!.status, "archived");
  assert.match(f.runtime.memory.recall(f.user.id, f.conversation.id, "resolved", "推荐上海岗位") ?? "", /不去北京/);
});

test("永久删除留去重指纹，变换摘录也不会从相同来源重新出现", async t => {
  const f = await fixture(t), node = seed(f, "我想去上海做前端开发，优先 React。");
  const source = node.sources[0];
  f.runtime.memory.change(f.user.id, node.id, { action: "delete", revision: node.revision });
  f.runtime.memory.observe(f.user.id, f.conversation.id, [{ kind: "goal", text: "想在上海找 React 前端工作", evidence: [{ source_id: "message." + source.source_id, quote: "优先 React" }] }]);
  assert.equal(f.runtime.memory.view(f.user.id).nodes.length, 0);
});

test("回退消息会撤销派生记忆和旧召回，删除对话也清理来源", async t => {
  const f = await fixture(t), node = seed(f, "我想做 Rust 后端开发。");
  f.runtime.memory.recall(f.user.id, f.conversation.id, "before", "Rust 后端");
  const source = node.sources[0], replacement = id();
  f.store.supersedeFrom(f.user.id, f.conversation.id, source.source_id, replacement);
  f.runtime.memory.invalidateMessages(f.user.id, f.conversation.id, [source.source_id]);
  assert.equal(f.runtime.memory.view(f.user.id).nodes.length, 0);
  assert.equal(f.runtime.memory.view(f.user.id).recalls[0].items.length, 0);
  seed(f, "我想学习 React 前端。");
  await f.runtime.deleteConversation(f.user, f.conversation.id);
  assert.equal(f.runtime.memory.view(f.user.id).nodes.length, 0);
});

test("工作台投影更新时撤掉旧目标，确认事实不因衰减自动删除", async t => {
  const f = await fixture(t), state = f.runtime.career.get(f.user.id);
  const { confirmed_at: _initial, ...initialProfile } = state.profile;
  f.runtime.career.change(f.user.id, { revision: state.revision, change: { type: "profile.save", profile: { ...initialProfile, goal: "React 前端开发" } } });
  assert.match(f.runtime.memory.view(f.user.id).nodes[0].text, /React/);
  const next = f.runtime.career.get(f.user.id), { confirmed_at: _stamp, ...profile } = next.profile;
  f.runtime.career.change(f.user.id, { revision: next.revision, change: { type: "profile.save", profile: { ...profile, goal: "Go 后端开发" } } });
  const view = f.runtime.memory.view(f.user.id);
  assert.equal(view.nodes.length, 1); assert.match(view.nodes[0].text, /Go 后端/);
  const base = { kind: "goal" as const, anchor: false, confirmed: false, mentions: 1, last_mentioned_at: "2020-01-01T00:00:00.000Z" };
  assert.ok(memoryRetention(base, Date.parse(now())) < .01);
  assert.ok(memoryRetention({ ...base, confirmed: true }, Date.parse(now())) >= .8);
  assert.ok(memoryRetention({ ...base, anchor: true }, Date.parse(now())) >= .95);
  assert.ok(memoryRetention({ ...base, kind: "emotion", confirmed: true }, Date.parse(now())) < .01);
});
