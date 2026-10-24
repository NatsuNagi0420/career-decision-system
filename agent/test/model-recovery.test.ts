/** 青穗集 · 模型步骤续接回归：不重放工具、不重复消息、账号权限隔离与有界恢复。 */
import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/errors.js";
import { id } from "../src/store.js";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";
const timeout = () => new AppError(502, "模型数据长时间未继续返回。", "provider_timeout");

test("工具成功后中断，从模型步骤续接且清理旧草稿", async t => {
  const model = new ScriptedModel((request, index) => {
    if (index === 0) return reply("", [tool("write_file", { path: "outputs/恢复测试.txt", content: "已保存的工具结果" })]);
    if (index === 1) { request.onDelta?.("未完整的流式片段"); throw timeout(); }
    assert.ok(request.messages.some(m => m.role === "tool" && m.content.includes("恢复测试.txt")));
    assert.ok(request.messages.some(m => m.role === "system" && m.content.includes("不重复创建文件")));
    assert.ok(!request.messages.some(m => m.content === "未完整的流式片段")); return reply("从保存的工具结果继续回答。");
  });
  const f = await fixture(t, { model }); const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "制作测试文件并说明", id()); await f.runtime.waitIdle();
  const failed = f.runtime.snapshot(f.user, f.conversation.id);
  assert.equal(failed.runs.at(-1)!.error_code, "provider_timeout"); assert.equal(failed.runs.at(-1)!.can_retry, true); assert.deepEqual(failed.drafts, {}); assert.equal(failed.artifacts.length, 1);
  const retryId = id(); assert.equal(f.runtime.retry(f.user, run.id, retryId).id, run.id); assert.deepEqual(f.runtime.snapshot(f.user, f.conversation.id).drafts, {});
  f.runtime.retry(f.user, run.id, retryId); await f.runtime.waitIdle(); const finished = f.runtime.snapshot(f.user, f.conversation.id);
  assert.equal(finished.runs.at(-1)!.status, "completed"); assert.equal(finished.runs.at(-1)!.retry_count, 1);
  assert.equal(finished.messages.filter(m => m.role === "user").length, 1); assert.equal(finished.messages.filter(m => m.role === "tool").length, 1); assert.equal(finished.artifacts.length, 1); assert.equal(finished.artifacts[0].version, 1);
  assert.equal(model.requests.length, 3); f.runtime.retry(f.user, run.id, retryId); assert.equal(model.requests.length, 3);
});
test("重试 API 幂等且最多续接两次", async t => {
  const model = new ScriptedModel(() => { throw timeout(); }); const f = await fixture(t, { model });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "测试", id()); await f.runtime.waitIdle(); const url = "/api/v1/agent/runs/" + run.id + "/retry";
  for (let count = 1; count <= 2; count++) {
    const requestId = id(); assert.equal((await f.app.inject({ method: "POST", url, headers: f.headers, payload: { request_id: requestId } })).statusCode, 200); await f.runtime.waitIdle();
    const repeated = await f.app.inject({ method: "POST", url, headers: f.headers, payload: { request_id: requestId } }); assert.equal(repeated.statusCode, 200); assert.equal(repeated.json().retry_count, count);
  }
  assert.equal((await f.app.inject({ method: "POST", url, headers: f.headers, payload: { request_id: id() } })).statusCode, 409); assert.equal(model.requests.length, 3);
  assert.equal(f.runtime.snapshot(f.user, f.conversation.id).runs.at(-1)!.can_retry, false);
});
test("兼容旧超时记录，归档或后续消息阻止过期重试", async t => {
  const f = await fixture(t, { model: new ScriptedModel(() => { throw timeout(); }) }); const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "测试旧记录", id()); await f.runtime.waitIdle();
  const old = f.store.run(f.user.id, run.id); delete old.error_code; old.error = "模型请求超时，请检查服务后重试。"; f.store.saveRun(old);
  assert.equal(f.runtime.snapshot(f.user, f.conversation.id).runs.at(-1)!.can_retry, true);
  const conversation = f.store.conversation(f.user.id, f.conversation.id); conversation.archived = true; f.store.updateConversation(conversation);
  assert.equal(f.runtime.snapshot(f.user, f.conversation.id).runs.at(-1)!.can_retry, false); assert.throws(() => f.runtime.retry(f.user, run.id, id()), /归档/);
  conversation.archived = false; f.store.updateConversation(conversation); f.runtime.start(f.user, f.conversation.id, f.profile.id, "新消息", id()); await f.runtime.waitIdle(); assert.throws(() => f.runtime.retry(f.user, run.id, id()), /对话已经继续/);
});
test("鉴权、余额、参数和截断错误不盲目续接", async t => {
  const model = new ScriptedModel(); const f = await fixture(t, { model });
  for (const code of ["provider_401", "provider_quota", "provider_400", "provider_incomplete"]) {
    model.respond = () => { throw new AppError(502, "需要处理的错误", code); }; const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "不可重试测试", id()); await f.runtime.waitIdle();
    assert.equal(f.runtime.snapshot(f.user, f.conversation.id).runs.at(-1)!.can_retry, false); assert.throws(() => f.runtime.retry(f.user, run.id, id()), /不能直接续接/);
  }
});
test("账号隔离、完全访问重新确认和原有预算仍生效", async t => {
  const f = await fixture(t, { model: new ScriptedModel(() => { throw timeout(); }) }); const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "测试权限", id(), { permission_mode: "full-access", full_access_confirmed: true }); await f.runtime.waitIdle();
  const other = f.auth.register("retry_other", "Fixture-only-password-2026", true);
  const denied = await f.app.inject({ method: "POST", url: "/api/v1/agent/runs/" + run.id + "/retry", headers: { authorization: "Bearer " + other.token }, payload: { request_id: id() } }); assert.equal(denied.statusCode, 404);
  assert.throws(() => f.runtime.retry(f.user, run.id, id()), /重新确认/); const exhausted = f.store.run(f.user.id, run.id); exhausted.elapsed_ms = f.config.runTimeoutMs; f.store.saveRun(exhausted); assert.throws(() => f.runtime.retry(f.user, run.id, id(), true), /不能直接续接/);
});
