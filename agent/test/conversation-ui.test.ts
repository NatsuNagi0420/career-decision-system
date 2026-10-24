/** 青穗集 · 对话交互回归：归档不丢资料、权限按轮生效、推理参数真实发送且兼容不支持的网关。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply, tool, TEST_KEY } from "./helpers.js";
import { id } from "../src/store.js";
import { CompatibleModel } from "../src/model.js";
import type { ModelRequest } from "../src/types.js";
test("归档可恢复并保留消息与成果，归档期间拒绝新任务", async t => {
  const f = await fixture(t);
  const file = await f.workspace.write(f.conversation.id, null, "outputs/保留.md", "不能丢失");
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "测试消息", id());
  await f.runtime.waitIdle();
  const patch = (archived: boolean) => f.app.inject({ method: "PATCH", url: "/api/v1/agent/conversations/" + f.conversation.id, headers: f.headers, payload: { archived } });
  assert.equal((await patch(true)).json().archived, true);
  assert.equal(f.store.conversation(f.user.id, f.conversation.id).archived, true);
  assert.throws(() => f.runtime.start(f.user, f.conversation.id, f.profile.id, "继续", id()), /恢复/);
  assert.equal(f.store.messages(f.conversation.id).length, 2);
  assert.equal(f.store.artifacts(f.conversation.id)[0].id, file.id);
  assert.equal((await patch(false)).json().archived, false);
});
test("其他用户不能归档，进行中的对话不能归档", async t => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const model = new ScriptedModel(async () => { await gate; return reply(); });
  const f = await fixture(t, { model });
  const another = f.auth.register("another_user", "Another-test-password", true);
  const denied = await f.app.inject({ method: "PATCH", url: "/api/v1/agent/conversations/" + f.conversation.id, headers: { authorization: "Bearer " + another.token }, payload: { archived: true } });
  assert.equal(denied.statusCode, 404);
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "测试", id());
  try {
    const response = await f.app.inject({ method: "PATCH", url: "/api/v1/agent/conversations/" + f.conversation.id, headers: f.headers, payload: { archived: true } });
    assert.equal(response.statusCode, 409);
    assert.equal(f.store.conversation(f.user.id, f.conversation.id).archived, undefined);
  } finally { release(); await f.runtime.waitIdle(); }
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
});
test("默认权限不升级，完全访问必须确认且只绑定本次运行", async t => {
  const f = await fixture(t);
  assert.throws(() => f.runtime.start(f.user, f.conversation.id, f.profile.id, "测试", id(), { permission_mode: "full-access" }), /明确确认/);
  const first = f.runtime.start(f.user, f.conversation.id, f.profile.id, "已授权的任务", id(), { permission_mode: "full-access", full_access_confirmed: true, reasoning_effort: "high" });
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, first.id).permission_mode, "full-access");
  assert.equal(f.model.requests[0].reasoningEffort, "high");
  assert.match(f.model.requests[0].tools.find(tool => tool.name === "run_command")!.description, /明确开启完全访问/);
  const next = f.runtime.start(f.user, f.conversation.id, f.profile.id, "默认任务", id());
  await f.runtime.waitIdle();
  assert.equal(next.permission_mode, "default");
  assert.equal(next.reasoning_effort, "auto");
  assert.doesNotMatch(f.model.requests.at(-1)!.tools.find(tool => tool.name === "run_command")!.description, /明确开启完全访问/);
});
const connection = { base_url: "https://example.invalid/v1", model: "fixture", key: TEST_KEY, allow_local: false, timeout_ms: 5000, max_output_tokens: 128 };
const request = (): ModelRequest => ({ messages: [{ role: "user", content: "测试" }], tools: [], signal: AbortSignal.timeout(5000) });
const chat = () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }), { headers: { "content-type": "application/json" } });
test("Chat 与 Responses 发送真实推理强度，自动档位不发送额外参数", async () => {
  for (const protocol of ["chat-completions", "responses"] as const) {
    const bodies: Record<string, unknown>[] = [];
    const model = new CompatibleModel({ ...connection, api_kind: protocol }, (async (_url: unknown, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return protocol === "responses" ? new Response(JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "OK" }] }] }), { headers: { "content-type": "application/json" } }) : chat();
    }) as typeof fetch, false);
    await model.complete({ ...request(), reasoningEffort: "high" });
    await model.complete({ ...request(), reasoningEffort: "auto" });
    assert.deepEqual(protocol === "responses" ? bodies[0].reasoning : bodies[0].reasoning_effort, protocol === "responses" ? { effort: "high" } : "high");
    assert.equal(bodies[1].reasoning, undefined);
    assert.equal(bodies[1].reasoning_effort, undefined);
  }
});
test("网关明确不支持推理参数时有界回退并提供可见说明", async () => {
  const bodies: Record<string, unknown>[] = [], notices: string[] = [];
  const model = new CompatibleModel({ ...connection, api_kind: "chat-completions" }, (async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return bodies.length === 1 ? new Response(JSON.stringify({ error: { message: "Unsupported parameter: reasoning_effort", param: "reasoning_effort" } }), { status: 400 }) : chat();
  }) as typeof fetch, false);
  await model.complete({ ...request(), reasoningEffort: "medium", onNotice: text => notices.push(text) });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].reasoning_effort, "medium");
  assert.equal(bodies[1].reasoning_effort, undefined);
  assert.match(notices[0], /不支持/);
});

test("已确认完全访问实际使用本机终端，默认沙箱替身不会被误调用", async t => {
  const model = new ScriptedModel((request, index) => {
    if (index === 0) return reply("", [tool("run_command", { command: process.platform === "win32" ? 'Write-Output "full-access-fixture-only"' : 'printf "full-access-fixture-only"' })]);
    assert.match(request.messages.at(-1)!.content, /full-access-fixture-only/);
    return reply("本地终端输出测试通过。");
  });
  const f = await fixture(t, { model });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "只打印固定测试文本，不读取或修改其他文件", id(), { permission_mode: "full-access", full_access_confirmed: true });
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(model.requests.length, 2);
});
