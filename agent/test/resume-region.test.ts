/** 青穗集 · 框选改写回归：真实 SQLite 和脚本模型验证字段隔离、版本、流式预览与工具权限。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";
import { id } from "../src/store.js";
import type { ResumeChange, ResumeState } from "../src/resume-contract.js";
type Fixture = Awaited<ReturnType<typeof fixture>>;
function ready(f: Fixture): ResumeState {
  const change = (change: ResumeChange) => f.runtime.resume.change(f.user.id, { revision: f.runtime.resume.get(f.user.id).revision, change });
  const propose = (data: unknown) => f.runtime.resume.propose(f.user.id, f.conversation.id, { request_id: f.runtime.resume.get(f.user.id).pending!.id, data });
  change({ type: "materials.save", source_name: "测试原文", source_text: "我使用 React 实现报名表单，并使用 Git 协作。", target: { title: "前端实习", company: "", description: "" } });
  change({ type: "task.request", kind: "facts" });
  propose({ kind: "facts", facts: [{ kind: "projects", title: "报名项目", detail: "使用 React 实现报名表单，并使用 Git 协作。", quote: "我使用 React 实现报名表单，并使用 Git 协作。" }], questions: [] });
  let state = f.runtime.resume.get(f.user.id);
  change({ type: "facts.confirm", facts: state.facts }); change({ type: "task.request", kind: "selection" });
  const choices = state.facts.map(fact => ({ fact_id: fact.id, use: "primary" as const, reason: "与前端方向相关" }));
  propose({ kind: "selection", selection: { requirements: [], choices } });
  change({ type: "selection.confirm", choices }); change({ type: "task.request", kind: "rewrite" });
  propose({ kind: "rewrite", body: { summary: { text: "使用 React 开发前端项目。", fact_ids: [state.facts[0].id] }, sections: [{ kind: "projects", entries: [{ fact_ids: [state.facts[0].id], title: "报名项目", subtitle: "个人实践", period: "", bullets: ["使用 React 实现报名表单。", "使用 Git 协作。"] }] }] } });
  state = f.runtime.resume.get(f.user.id); return state;
}
const selected = "projects.0.bullets.0";
test("局部补丁只改变选中字段，保留事实、联系方式和未选内容", async t => {
  const f = await fixture(t), before = ready(f), runId = id();
  const state = f.runtime.resume.beginEdit(f.user.id, f.conversation.id, runId, { revision: before.revision, field_ids: [selected] });
  const context = f.runtime.resume.editContext(f.user.id, f.conversation.id, runId);
  assert.deepEqual(context.fields.map(field => field.id), [selected]);
  f.runtime.resume.proposePatch(f.user.id, f.conversation.id, runId, { request_id: state.pending!.id, changes: [{ field_id: selected, text: "基于 React 完成报名表单的前端实现。" }] });
  const after = f.runtime.resume.get(f.user.id), expected = structuredClone(before.body!);
  expected.sections[0].entries[0].bullets[0] = "基于 React 完成报名表单的前端实现。";
  assert.deepEqual(after.body, expected); assert.deepEqual(after.header, before.header); assert.deepEqual(after.facts, before.facts);
  assert.equal(after.pending, null); assert.equal(after.confirmed_at, null);
});
test("拒绝越界、重复字段、伪造数字、错误运行和整份重写", async t => {
  const f = await fixture(t), before = ready(f), runId = id();
  const state = f.runtime.resume.beginEdit(f.user.id, f.conversation.id, runId, { revision: before.revision, field_ids: [selected] });
  const patch = (changes: unknown, owner = runId) => f.runtime.resume.proposePatch(f.user.id, f.conversation.id, owner, { request_id: state.pending!.id, changes });
  assert.throws(() => patch([{ field_id: "summary.text", text: "改写未选简介" }]), /只能修改/);
  assert.throws(() => patch([{ field_id: selected, text: "提升效率 90%" }]), /没有的数字/);
  assert.throws(() => patch([{ field_id: selected, text: "a" }, { field_id: selected, text: "b" }]), /只能修改/);
  assert.throws(() => patch([{ field_id: selected, text: "改写" }], id()), /失效/);
  assert.throws(() => f.runtime.resume.propose(f.user.id, f.conversation.id, { request_id: state.pending!.id, data: { kind: "rewrite", body: before.body } }), /局部补丁/);
  assert.deepEqual(f.runtime.resume.get(f.user.id).body, before.body);
});
test("过期框选和无效路径不能启动修改", async t => {
  const f = await fixture(t), state = ready(f);
  assert.throws(() => f.runtime.resume.beginEdit(f.user.id, f.conversation.id, id(), { revision: state.revision - 1, field_ids: [selected] }), /重新框选/);
  assert.throws(() => f.runtime.resume.beginEdit(f.user.id, f.conversation.id, id(), { revision: state.revision, field_ids: ["projects.9.title"] }), /无效字段/);
  assert.equal(f.runtime.resume.get(f.user.id).revision, state.revision);
});
test("未闭合文字流只覆盖选中字段的预览，不提前保存正文", async t => {
  const f = await fixture(t), before = ready(f), runId = id();
  const state = f.runtime.resume.beginEdit(f.user.id, f.conversation.id, runId, { revision: before.revision, field_ids: [selected] });
  const start = JSON.stringify({ request_id: state.pending!.id }) .slice(0, -1) + ',"changes":[{"field_id":"' + selected + '","text":"基于 React';
  const preview = f.runtime.resume.livePatch(f.user.id, f.conversation.id, runId, start);
  assert.equal(preview?.body.sections[0].entries[0].bullets[0], "基于 React");
  assert.equal(preview?.body.sections[0].entries[0].bullets[1], before.body!.sections[0].entries[0].bullets[1]);
  assert.deepEqual(f.runtime.resume.get(f.user.id).body, before.body);
  assert.equal(f.runtime.resume.livePatch(f.user.id, f.conversation.id, id(), start), null);
});
test("框选 HTTP 请求走真实工具循环和预览事件，成功后不再整份生成", async t => {
  const model = new ScriptedModel(), f = await fixture(t, { model }), before = ready(f);
  model.respond = (request, index) => {
    assert.deepEqual(request.tools.map(tool => tool.name).sort(), ["ask_user", "propose_resume_patch", "read_resume_context"]);
    if (!index) return reply("", [tool("read_resume_context", {})]);
    const pending = f.runtime.resume.get(f.user.id).pending!;
    const call = tool("propose_resume_patch", { request_id: pending.id, changes: [{ field_id: selected, text: "基于 React 完成报名表单。" }] });
    request.onToolDelta?.({ ...call, arguments: call.arguments.slice(0, call.arguments.indexOf("完成")) });
    return reply("", [call]);
  };
  const requestId = id();
  const payload = { profile_id: f.profile.id, input: "请精简选中部分", request_id: requestId, resume_edit: { revision: before.revision, field_ids: [selected] } };
  const response = await f.app.inject({ method: "POST", url: "/api/v1/agent/conversations/" + f.conversation.id + "/runs", headers: f.headers, payload });
  assert.equal(response.statusCode, 200, response.body); await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, response.json().id).status, "completed");
  const snapshot = f.runtime.snapshot(f.user, f.conversation.id);
  assert.ok(snapshot.events.some(event => event.kind === "resume.preview"));
  assert.equal(f.runtime.resume.get(f.user.id).body!.sections[0].entries[0].bullets[0], "基于 React 完成报名表单。");
  assert.equal(model.requests.length, 2);
  const retry = await f.app.inject({ method: "POST", url: "/api/v1/agent/conversations/" + f.conversation.id + "/runs", headers: f.headers, payload });
  assert.equal(retry.json().id, response.json().id);
});
