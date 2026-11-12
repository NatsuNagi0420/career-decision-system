/** 青穗集 · Jev 独立中转回归：契约、鉴权、共享配额与上游错误，使用隔离数据库和假响应。 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createRelay, issueRelayToken, type RelayConfig } from "../src/relay-app.js";
import { systemOnePayload, systemOneResult } from "../src/systemone.js";
import { temporary } from "./helpers.js";

const payload = {
  model: "Typesafe-jev",
  state: { evidence: "完成了 React 项目，暂无 Python 项目证据。" },
  questions: {
    sufficient: { type: "noul", instructions: "Python 经历是否有证据？" },
    direction: { type: "choice", instructions: "现有证据更支持哪个方向？", criteria: { frontend: "前端", backend: "后端" } },
    quality: { type: "score", instructions: "按三档评估证据完整度。", criteria: ["不足", "部分", "充分"] },
  },
};
const result = {
  model: "jev-1.13.0",
  answers: {
    sufficient: { type: "noul", noul: 0 },
    direction: { type: "choice", choice: "frontend", probabilities: { frontend: 0.8, backend: 0.2 }, confidence: 0.7 },
    quality: { type: "score", score: 1.2, probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 }, confidence: 0.6 },
  },
  usage: { input_tokens: 305, output_tokens: 20 },
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
async function context(t: TestContext, upstream: typeof fetch, overrides: Partial<RelayConfig> = {}) {
  const relay = createRelay({
    dataDir: await temporary("systemone"), upstreamUrl: "http://127.0.0.1:8131/v1",
    upstreamKey: "fixture-upstream-secret", model: "main-model", decisionModel: "Typesafe-jev",
    decisionPath: "/v1/systemone", kind: "chat-completions",
    maxOutput: 128, dailyOutput: 2048, dailyRequests: 10, allowLocal: true,
    ...overrides,
  }, upstream);
  t.after(() => relay.app.close());
  const token = issueRelayToken(relay.db, "decision-test");
  return { ...relay, token, headers: { authorization: "Bearer " + token.token } };
}

test("Jev 独立接口使用材料与问题，保留合法零值、小数及实际执行模型版本", async t => {
  let sentUrl: string | undefined;
  let sent: RequestInit | undefined;
  const ctx = await context(t, async (url, init) => {
    sentUrl = String(url); sent = init;
    return json({ ...result, unrelated_secret: "should-not-pass-through" });
  });
  const response = await ctx.app.inject({ method: "POST", url: "/v1/systemone", headers: ctx.headers, payload });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(sentUrl, "http://127.0.0.1:8131/v1/systemone");
  assert.deepEqual(JSON.parse(String(sent?.body)), payload);
  assert.equal(sent?.redirect, "error");
  assert.equal(new Headers(sent?.headers).get("authorization"), "Bearer fixture-upstream-secret");
  assert.deepEqual(response.json(), result);
  assert.ok(!response.body.includes("should-not-pass-through"));
});

test("Jev 请求校验拒绝聊天格式、stream true、缺失问题、错档位与多余字段，且不扣本机预算", async t => {
  let hits = 0;
  const ctx = await context(t, async () => { hits++; return json(result); });
  const invalid = [
    { model: payload.model, messages: [{ role: "user", content: "hello" }] },
    { ...payload, stream: true }, { ...payload, stream: "false" }, { ...payload, state: 1 },
    { ...payload, questions: {} }, { ...payload, max_tokens: 32 },
    { ...payload, questions: { a: { type: "noul" } } },
    { ...payload, questions: { a: { type: "choice", instructions: null, criteria: {} } } },
    { ...payload, questions: { a: { type: "score", instructions: null, criteria: ["only-one"] } } },
    { ...payload, questions: { a: { type: "noul", instructions: null, criteria: { yes: "bad-key" } } } },
  ];
  for (const body of invalid) {
    const response = await ctx.app.inject({ method: "POST", url: "/v1/systemone", headers: ctx.headers, payload: body });
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.equal(hits, 0);
  assert.equal(ctx.db.prepare("SELECT count(*) AS n FROM daily_usage").get()!.n, 0);
  assert.deepEqual(systemOnePayload({ ...payload, state: null, stream: false }).state, null);
});

test("Jev 继承官方凭证、撤销、浏览器边界和模型约束，与聊天共享每日预算", async t => {
  let hits = 0;
  const ctx = await context(t, async () => { hits++; return json(result); }, { dailyOutput: 128 });
  for (const [headers, expected] of [
    [{}, 401], [{ authorization: "Bearer invalid" }, 401], [{ ...ctx.headers, origin: "http://localhost" }, 403],
  ] as const) {
    const response = await ctx.app.inject({ method: "POST", url: "/v1/systemone", headers, payload });
    assert.equal(response.statusCode, expected);
  }
  assert.equal((await ctx.app.inject({ method: "POST", url: "/v1/systemone", headers: ctx.headers,
    payload: { ...payload, model: "other-model" } })).statusCode, 403);
  assert.equal((await ctx.app.inject({ method: "POST", url: "/v1/systemone", headers: ctx.headers, payload })).statusCode, 200);
  const exhausted = await ctx.app.inject({ method: "POST", url: "/v1/chat/completions", headers: ctx.headers,
    payload: { model: "main-model", messages: [{ role: "user", content: "hi" }], max_tokens: 128 } });
  assert.equal(exhausted.statusCode, 429);
  assert.equal(exhausted.json().error.code, "relay_daily_output_limit");
  assert.equal(hits, 1);
  ctx.db.prepare("UPDATE access_tokens SET revoked=1 WHERE hash=?").run(ctx.token.hash);
  assert.equal((await ctx.app.inject({ method: "POST", url: "/v1/systemone", headers: ctx.headers, payload })).statusCode, 401);
});

test("Jev 校验答案归属与范围，不接受缺失答案、未知候选或越界概率", () => {
  const questions = systemOnePayload(payload).questions;
  for (const raw of [
    { choices: [{ message: { content: "not-answers" } }] },
    { ...result, answers: {} },
    { ...result, answers: { ...result.answers, sufficient: { noul: 1.1 } } },
    { ...result, answers: { ...result.answers, direction: { choice: "invented" } } },
    { ...result, answers: { ...result.answers, quality: { score: 90 } } },
  ]) assert.throws(() => systemOneResult(raw, questions), /判断响应/);
});

test("Jev 失败只提交一次、脱敏错误并释放活动凭证", async t => {
  let hits = 0;
  const ctx = await context(t, async () => {
    hits++;
    if (hits === 1) return json({ error: { message: "upstream fixture-upstream-secret", code: "model_not_found" } }, 503);
    return json(result);
  });
  const failed = await ctx.app.inject({ method: "POST", url: "/v1/systemone", headers: ctx.headers, payload });
  assert.equal(failed.statusCode, 502);
  assert.equal(hits, 1);
  assert.ok(!failed.body.includes("fixture-upstream-secret"));
  const second = await ctx.app.inject({ method: "POST", url: "/v1/systemone", headers: ctx.headers, payload });
  assert.equal(second.statusCode, 200);
});

test("聊天能力不可把 messages 伪装成 SystemOne 请求", async t => {
  let hits = 0;
  const ctx = await context(t, async () => { hits++; return json(result); }, {
    modelRoutes: { compare_decide: "Typesafe-jev" }, routePaths: { compare_decide: "/v1/systemone" },
  });
  const response = await ctx.app.inject({ method: "POST", url: "/v1/chat/completions",
    headers: { ...ctx.headers, "x-suinai-capability": "compare_decide" },
    payload: { model: "main-model", messages: [{ role: "user", content: "hi" }] } });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "structured_route_required");
  assert.equal(hits, 0);
});
