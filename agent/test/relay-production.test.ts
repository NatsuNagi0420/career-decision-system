/** 青穗集 · 官方运营验收：真实数据库事务、计费隔离、流式脱敏及任务恢复。 */
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createRelay, createRelayWithStore, issueRelayToken, type RelayConfig } from "../src/relay-app.js";
import { initializeRelayStore, postgresRelayStore } from "../src/relay-store.js";
import { migrateRelayStore } from "../src/relay-migration.js";
import { PublicEventStream } from "../src/relay-public.js";
import { issueStoredToken } from "../src/relay-operations.js";
import { temporary } from "./helpers.js";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const cfg = (dataDir: string): RelayConfig => ({ dataDir, upstreamUrl: "http://127.0.0.1:8131/v1", upstreamKey: "private-upstream-key", model: "private-main-model", publicModel: "Suinai Flash", kind: "chat-completions", maxOutput: 128, dailyRequests: 100, dailyOutput: 100000, allowLocal: true, adminToken: "fixture-admin-secret" });
const payload = { model: "Suinai Flash", messages: [{ role: "user", content: "private-user-material" }], max_tokens: 128, stream: false };
const admin = { "x-relay-admin-token": "fixture-admin-secret" };
const headers = (token: string) => ({ authorization: "Bearer " + token });
async function register(relay: ReturnType<typeof createRelay>, username: string) {
  const response = await relay.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username, password: "fixture-password-1234" } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json() as { token: string; account: { id: number } };
}
test("官方真实路由只在服务端，JSON 与跨字节 SSE 都只返回公开模型", async t => {
  let sent: Record<string, unknown> = {};
  const relay = createRelay({ ...cfg(await temporary("relay-public")), modelRoutes: { resume_build: "private-copy-model" } }, async (_url, init) => { sent = JSON.parse(String(init?.body)); return json({ model: "private-copy-model", provider: "private-provider", system_fingerprint: "private-fingerprint", choices: [{ message: { content: "你好" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }); });
  t.after(() => relay.app.close());
  const token = issueRelayToken(relay.db, "public-model").token;
  const result = await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers: { ...headers(token), "x-suinai-capability": "resume_build" }, payload });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(sent.model, "private-copy-model");
  assert.equal(result.json().model, "Suinai Flash");
  assert.equal(/private-(copy|provider|fingerprint)/.test(result.body), false);
  const stream = new PublicEventStream("Suinai Flash");
  const input = new TextEncoder().encode('data: {"model":"private-main-model","choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: {"model":"private-main-model","usage":{"prompt_tokens":3,"completion_tokens":2},"choices":[]}\n\ndata: [DONE]\n\n');
  const output: string[] = [];
  for (const byte of input) output.push(...stream.push(new Uint8Array([byte])));
  output.push(...stream.push(new Uint8Array(), true));
  assert.ok(output.join("").includes("你好"));
  assert.equal(output.join("").includes("private-main-model"), false);
  assert.deepEqual(stream.usage, { input: 3, output: 2 }); assert.equal(stream.completed, true);
});
test("真实用量结算和积分入账幂等，失败及无 usage 不虚构扣费", async t => {
  let mode = "success";
  const relay = createRelay({ ...cfg(await temporary("relay-billing")), billingEnabled: true }, async () => mode === "error" ? json({ error: { message: "private-upstream-key" } }, 503) : json({ choices: [{ message: { content: "OK" } }], ...(mode === "success" ? { usage: { prompt_tokens: 10, completion_tokens: 5 } } : {}) }));
  t.after(() => relay.app.close());
  const user = await register(relay, "billing-user");
  const topup = { method: "POST" as const, url: "/admin/accounts/" + user.account.id + "/credits", headers: admin, payload: { amount_micros: 1000000, reference: "payment-fixture-1" } };
  assert.equal((await relay.app.inject(topup)).statusCode, 200);
  assert.equal((await relay.app.inject(topup)).statusCode, 200);
  const run = () => relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(user.token), payload });
  assert.equal((await run()).statusCode, 200);
  mode = "error"; assert.equal((await run()).statusCode, 502);
  mode = "no-usage"; assert.equal((await run()).statusCode, 200);
  const summary = (await relay.app.inject({ method: "GET", url: "/v1/account/usage", headers: headers(user.token) })).json();
  assert.equal(summary.balance_micros, 999970); assert.equal(summary.held_micros, 0);
  assert.equal(summary.input_tokens, 10); assert.equal(summary.output_tokens, 5); assert.equal(summary.charged_micros, 30);
  const events = relay.db.prepare("SELECT state FROM relay_usage_events ORDER BY created_at").all();
  assert.deepEqual(events.map(row => row.state), ["completed", "failed", "unmetered"]);
  const suspension = await relay.app.inject({ method: "POST", url: "/admin/accounts/" + user.account.id + "/status", headers: admin, payload: { status: "suspended" } });
  assert.equal(suspension.statusCode, 200); assert.equal((await run()).statusCode, 401);
});
test("同账号跨令牌、跨实例互斥，过期租约回收后可继续", async t => {
  const config = cfg(await temporary("relay-two-processes"));
  let unblock!: () => void;
  const wait = new Promise<void>(resolve => { unblock = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const relay = createRelay(config, async () => { entered(); await wait; return json({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }); });
  const second = createRelay(config, async () => json({ choices: [{ message: { content: "OK" } }] }));
  t.after(async () => { unblock(); await relay.app.close(); await second.app.close(); });
  const user = await register(relay, "concurrent-user");
  const login = (await second.app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "concurrent-user", password: "fixture-password-1234" } })).json();
  const firstRequest = relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(user.token), payload });
  void firstRequest.then(() => {}); await started;
  assert.equal((await second.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(login.token), payload })).statusCode, 429);
  unblock(); assert.equal((await firstRequest).statusCode, 200);
  await relay.operations.reserve(issueRelayToken(relay.db, "expired-fixture").hash, 1);
  relay.db.prepare("UPDATE relay_leases SET expires_at=?").run(new Date(Date.now() - 1000).toISOString());
  await relay.maintenance.tick();
  assert.equal(Number((relay.db.prepare("SELECT COUNT(*) AS count FROM relay_leases").get())?.count), 0);
  assert.equal((relay.db.prepare("SELECT state FROM relay_usage_events WHERE state='interrupted'").get())?.state, "interrupted");
  assert.equal((await second.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(login.token), payload })).statusCode, 200);
});
test("上游故障和恢复告警去重、持久化且不含用户材料或密钥", async t => {
  let failing = true; const delivered: string[] = [];
  const relay = createRelay({ ...cfg(await temporary("relay-alerts")), alertWebhookUrl: "http://127.0.0.1:8189/hook" }, async (url, init) => {
    if (String(url).endsWith("/hook")) { delivered.push(String(init?.body)); return json({ ok: true }); }
    return failing ? json({ error: { message: "private-upstream-key private-user-material" } }, 503) : json({ choices: [{ message: { content: "OK" } }] });
  });
  t.after(() => relay.app.close()); const token = issueRelayToken(relay.db, "alert-fixture").token;
  for (let i = 0; i < 4; i++) await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(token), payload });
  await relay.maintenance.tick(); assert.equal(delivered.length, 1);
  assert.equal(JSON.stringify(delivered).includes("private-"), false);
  failing = false; await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(token), payload });
  await relay.maintenance.tick(); assert.equal(delivered.length, 2);
  assert.ok(delivered[1].includes("upstream_recovered"));
  const logs = relay.db.prepare("SELECT * FROM relay_request_log").all(); assert.equal(JSON.stringify(logs).includes("private-"), false);
});
test("图片后台恢复和过期回收无需页面轮询，完成后只扣一次", async t => {
  const config = { ...cfg(await temporary("relay-image-worker")), imageModel: "private-image-model", billingEnabled: true, imageMicros: 100 };
  const fetcher: typeof fetch = async (_url, init) => init?.method === "POST" ? json({ task_id: "private-task-id", status: "queued", secret: "private-upstream-key" }, 202) : json({ task_id: "private-task-id", model: "private-image-model", status: "succeeded", result: { data: [{ url: "https://private.invalid/image.png" }] } });
  let relay = createRelay(config, fetcher);
  const user = await register(relay, "image-worker-user");
  await relay.operations.credit("account:" + user.account.id, 1000, "image-credit-fixture");
  const created = await relay.app.inject({ method: "POST", url: "/v1/images/tasks", headers: headers(user.token), payload: { prompt: "test pixel image", n: 1 } });
  assert.equal(created.statusCode, 202, created.body); const taskId = created.json().task_id;
  await relay.app.close(); relay = createRelay(config, fetcher); t.after(() => relay.app.close()); await relay.app.ready();
  await relay.maintenance.tick(); await relay.maintenance.tick();
  const summary = await relay.operations.summary((relay.db.prepare("SELECT hash FROM access_tokens WHERE account_id=?").get(user.account.id))!.hash as string);
  assert.equal(summary.balance_micros, 900); assert.equal(summary.held_micros, 0); assert.equal(summary.images, 1);
  const status = await relay.app.inject({ method: "GET", url: "/v1/images/tasks/" + taskId, headers: headers(user.token) });
  assert.equal(status.json().status, "succeeded"); assert.equal(status.body.includes("private-"), false);
  relay.db.prepare("UPDATE relay_image_tasks SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), taskId);
  await relay.maintenance.tick();
  assert.equal((await relay.app.inject({ method: "GET", url: "/v1/images/tasks/" + taskId, headers: headers(user.token) })).statusCode, 410);
});
test("SQLite 迁移到 PostgreSQL 引擎逐表校验，重复导入回滚且序列继续可用", async t => {
  const source = createRelay(cfg(await temporary("relay-migrate")), async () => json({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 2, completion_tokens: 1 } }));
  t.after(() => source.app.close()); const user = await register(source, "migration-user");
  await source.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(user.token), payload });
  const postgres = new PGlite();
  const store = postgresRelayStore({ async query(sql, params) {
    if (sql.includes(";") && !params?.length) { const results = await postgres.exec(sql); return { rows: results.at(-1)?.rows as Record<string, unknown>[] ?? [], rowCount: 0 }; }
    const result = await postgres.query(sql, params); return { rows: result.rows as Record<string, unknown>[], rowCount: result.affectedRows };
  } }, undefined, () => postgres.close());
  await initializeRelayStore(store);
  const report = await migrateRelayStore(source.store, store);
  assert.equal(report.tables.find(table => table.table === "relay_accounts")?.rows, 1);
  assert.equal((await store.get("SELECT username FROM relay_accounts"))?.username, "migration-user");
  await assert.rejects(migrateRelayStore(source.store, store), /目标数据库已有资料/);
  const relay = createRelayWithStore(cfg("unused"), store, async () => json({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  t.after(() => relay.app.close()); await relay.app.ready();
  const result = await relay.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "new-pg-user", password: "fixture-password-1234" } });
  assert.equal(result.statusCode, 200, result.body); assert.equal(result.json().account.id, 2);
  const token = await issueStoredToken(store, "pg-request", 2);
  const response = await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(token.token), payload });
  assert.equal(response.statusCode, 200, response.body); assert.equal((await relay.operations.summary(token.hash)).input_tokens, 1);
});
