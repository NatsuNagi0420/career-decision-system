/** 青穗集 · 官方思考档位回归：参数透传、非法配置拦截与脱敏回退，仅使用隔离数据库和假上游。 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createRelay, issueRelayToken } from "../src/relay-app.js";
import { CompatibleModel } from "../src/model.js";
import type { WireApiKind, ReasoningEffort } from "../src/types.js";
import { temporary } from "./helpers.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const answer = (kind: WireApiKind) => kind === "chat-completions"
  ? { choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }
  : { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "OK" }] }] };
const effortField = (kind: WireApiKind) => kind === "chat-completions" ? "reasoning_effort" : "reasoning";
const endpoint = (kind: WireApiKind) => "/v1/" + (kind === "responses" ? "responses" : "chat/completions");

async function context(t: TestContext, kind: WireApiKind, upstream: typeof fetch) {
  const relay = createRelay({
    dataDir: await temporary("relay-reasoning"), upstreamUrl: "http://127.0.0.1:8131/v1",
    upstreamKey: "fixture-upstream-secret", model: "fixture-model", kind,
    maxOutput: 256, dailyOutput: 8192, dailyRequests: 30, allowLocal: true,
  }, upstream);
  t.after(() => relay.app.close());
  const token = issueRelayToken(relay.db, "reasoning-fixture");
  const headers = { authorization: "Bearer " + token.token };
  const model = new CompatibleModel({
    base_url: "http://127.0.0.1:8120/v1", model: "fixture-model", key: token.token,
    api_kind: kind, allow_local: true, timeout_ms: 5000, max_output_tokens: 256,
  }, async (_url, init) => {
    const response = await relay.app.inject({
      method: "POST", url: endpoint(kind), headers,
      payload: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(response.body, { status: response.statusCode, headers: { "content-type": "application/json" } });
  }, false);
  return { ...relay, headers, model };
}

for (const kind of ["chat-completions", "responses"] as const) {
  test(kind + "：自动及三个思考档位经官方中转保留原始参数", async t => {
    const bodies: Record<string, unknown>[] = [];
    const ctx = await context(t, kind, async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return json(answer(kind));
    });
    const efforts: ReasoningEffort[] = ["auto", "low", "medium", "high"];
    for (const effort of efforts) {
      const result = await ctx.model.complete({
        messages: [{ role: "user", content: "Only reply OK." }], tools: [],
        signal: AbortSignal.timeout(5000), reasoningEffort: effort,
      });
      assert.equal(result.text, "OK");
      const sent = bodies.at(-1)!;
      const expected = effort === "auto" ? undefined : kind === "responses" ? { effort } : effort;
      assert.deepEqual(sent[effortField(kind)], expected);
      assert.equal(sent.model, "fixture-model");
    }
    assert.equal(bodies.length, 4);
  });

  test(kind + "：非法思考参数在转发及计费预留前拒绝", async t => {
    let hits = 0;
    const ctx = await context(t, kind, async () => { hits++; return json(answer(kind)); });
    const field = effortField(kind);
    const invalid: unknown[] = kind === "responses"
      ? [null, "high", {}, { effort: "auto" }, { effort: "extreme" }, { effort: "low", budget_tokens: 99999 }, { effort: "high", summary: "detailed" }]
      : [null, {}, 99, "auto", "extreme"];
    for (const value of invalid) {
      const response = await ctx.app.inject({
        method: "POST", url: endpoint(kind), headers: ctx.headers,
        payload: { model: "fixture-model", ...(kind === "responses" ? { input: [{ role: "user", content: "OK" }] } : { messages: [{ role: "user", content: "OK" }] }), [field]: value },
      });
      assert.equal(response.statusCode, 400);
    }
    assert.equal(hits, 0);
    assert.equal(ctx.db.prepare("SELECT count(*) AS n FROM daily_usage").get()!.n, 0);
  });

  test(kind + "：明确不支持思考参数时安全回退并通知，不泄露上游原文", async t => {
    const bodies: Record<string, unknown>[] = [];
    const field = effortField(kind);
    const ctx = await context(t, kind, async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body[field] !== undefined) return json({ error: {
        message: "Unsupported parameter " + field + " fixture-upstream-secret private-user-content",
        param: field, type: "invalid_request_error",
      } }, 400);
      return json(answer(kind));
    });
    const notices: string[] = [];
    const result = await ctx.model.complete({
      messages: [{ role: "user", content: "OK" }], tools: [], signal: AbortSignal.timeout(5000),
      reasoningEffort: "high", onNotice: message => notices.push(message),
    });
    assert.equal(result.text, "OK");
    assert.equal(bodies.length, 2);
    assert.notEqual(bodies[0][field], undefined);
    assert.equal(bodies[1][field], undefined);
    assert.equal(notices.length, 1);
    assert.match(notices[0], /已回到服务商默认值/);
    assert.ok(!notices.join().includes("fixture-upstream-secret"));
    const raw = await ctx.app.inject({
      method: "POST", url: endpoint(kind), headers: ctx.headers,
      payload: { model: "fixture-model", ...(kind === "responses" ? { input: [{ role: "user", content: "OK" }] } : { messages: [{ role: "user", content: "OK" }] }), [field]: kind === "responses" ? { effort: "low" } : "low" },
    });
    assert.equal(raw.statusCode, 400);
    assert.equal(raw.json().error.param, field);
    assert.ok(!raw.body.includes("fixture-upstream-secret"));
    assert.ok(!raw.body.includes("private-user-content"));
  });

  test(kind + "：未明确拒绝参数的 400、鉴权、额度和故障不盲目重试", async t => {
    let hits = 0;
    let status = 400;
    const ctx = await context(t, kind, async () => { hits++; return json({ error: { message: "private-upstream-detail" } }, status); });
    for (const next of [400, 401, 429, 503]) {
      status = next;
      const before = hits;
      await assert.rejects(ctx.model.complete({
        messages: [{ role: "user", content: "OK" }], tools: [], signal: AbortSignal.timeout(5000), reasoningEffort: "low",
      }));
      assert.equal(hits - before, 1);
    }
  });
}
