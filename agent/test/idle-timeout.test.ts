/** 青穗集 · 流式空闲回归：持续流不误杀、停流与取消受控，官方中转保留脱敏故障码。 */
import test from "node:test";
import assert from "node:assert/strict";
import { CompatibleModel } from "../src/model.js";
import { AppError } from "../src/errors.js";
import { createRelay, issueRelayToken } from "../src/relay-app.js";
import { temporary } from "./helpers.js";
const encoder = new TextEncoder();
const frame = (content: string) => "data: " + JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] }) + "\n\n";
const done = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
function stream(parts: string[], interval = 70, end = true, onCancel = () => {}) {
  let index = 0; let timer: ReturnType<typeof setInterval>;
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) { timer = setInterval(() => { if (index < parts.length) controller.enqueue(encoder.encode(parts[index++])); if (index === parts.length) { clearInterval(timer); if (end) controller.close(); } }, interval); },
    cancel() { clearInterval(timer); onCancel(); },
  }), { headers: { "content-type": "text/event-stream" } });
}
const connection = { base_url: "http://127.0.0.1:8191/v1", model: "fixture-model", key: "fixture-secret", api_kind: "chat-completions" as const, allow_local: true, timeout_ms: 200, max_output_tokens: 128 };
const request = (signal = AbortSignal.timeout(3000)) => ({ messages: [{ role: "user" as const, content: "fixture test" }], tools: [], stream: true, signal });

test("持续流式数据超过空闲时限仍能完整返回", async () => {
  const start = Date.now(); const model = new CompatibleModel(connection, async () => stream([frame("持续"), frame("返回"), frame("正常"), done]), false);
  const answer = await model.complete(request()); assert.equal(answer.text, "持续返回正常"); assert.ok(Date.now() - start > connection.timeout_ms);
});
test("首字前无响应受限结束，只请求一次", async () => {
  let hits = 0; const model = new CompatibleModel({ ...connection, timeout_ms: 80 }, async () => { hits++; return new Promise<Response>(() => {}); }, false);
  await assert.rejects(model.complete(request()), error => error instanceof AppError && error.code === "provider_timeout"); assert.equal(hits, 1);
});
test("部分输出后停流，不伪造成功并释放流", async () => {
  let cancelled = false; const deltas: string[] = [];
  const model = new CompatibleModel({ ...connection, timeout_ms: 120 }, async () => stream([frame("未完成")], 10, false, () => { cancelled = true; }), false);
  await assert.rejects(model.complete({ ...request(), onDelta: text => deltas.push(text) }), error => error instanceof AppError && error.code === "provider_timeout");
  assert.deepEqual(deltas, ["未完成"]); assert.equal(cancelled, true);
});
test("主动停止与整轮预算能中断持续流，不被续期覆盖", async () => {
  for (const reason of [new DOMException("停止", "AbortError"), new DOMException("总预算", "TimeoutError")]) {
    let cancelled = false; const control = new AbortController();
    const model = new CompatibleModel({ ...connection, timeout_ms: 1000 }, async () => stream([frame("一"), frame("二"), frame("三"), done], 40, true, () => { cancelled = true; }), false);
    const pending = model.complete(request(control.signal)); const timer = setTimeout(() => control.abort(reason), 70);
    try { await assert.rejects(pending, error => error === reason); } finally { clearTimeout(timer); } assert.equal(cancelled, true);
  }
});
for (const stall of [false, true]) test(stall ? "官方中转停流返回脱敏错误码" : "官方中转持续流不被误杀", async t => {
  const { app, db } = createRelay({ dataDir: await temporary("relay-idle"), upstreamUrl: "http://127.0.0.1:8191/v1", upstreamKey: "fixture-upstream-secret", model: "fixture-model", kind: "chat-completions", maxOutput: 128, dailyOutput: 4096, dailyRequests: 10, allowLocal: true, idleTimeoutMs: stall ? 100 : 200 }, async () => stall ? stream([frame("片段")], 10, false) : stream([frame("持续"), frame("返回"), frame("正常"), done]));
  t.after(() => app.close()); const token = issueRelayToken(db, "fixture");
  const response = await app.inject({ method: "POST", url: "/v1/chat/completions", headers: { authorization: "Bearer " + token.token }, payload: { model: "fixture-model", messages: [{ role: "user", content: "fixture" }], stream: true } });
  assert.equal(response.statusCode, 200);
  if (stall) { assert.match(response.body, /provider_timeout/); assert.ok(!response.body.includes("fixture-upstream-secret")); assert.ok(!response.body.includes("[DONE]")); }
  else { assert.match(response.body, /\[DONE\]/); assert.ok(!response.body.includes('"error"')); }
});
