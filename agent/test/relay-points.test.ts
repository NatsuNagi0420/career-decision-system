/** 青穗集 · 每日积分回归：真实事务验证并发限额、跨日、价格快照、失败退回及管理员授权。 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { postgresRelayStore } from "../src/relay-store.js";
import { migrateRelayStore } from "../src/relay-migration.js";
import { createRelay, createRelayWithStore, type RelayConfig } from "../src/relay-app.js";
import { RelayOperations, meteredUsage, issueStoredToken, estimateRelayInput } from "../src/relay-operations.js";
import { RelayAccountAccess } from "../src/relay-account-access.js";
import { RelayPoints, pointDay, pointMicros } from "../src/relay-points.js";
import { temporary } from "./helpers.js";
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const headers = (token: string) => ({ authorization: "Bearer " + token });
const payload = { model: "Suinai Flash", messages: [{ role: "user", content: "你好" }], max_tokens: 100 };
async function fixture(t: TestContext, options: Partial<RelayConfig> = {}, fetcher: typeof fetch = async () => json({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 400 } } })) {
  const config: RelayConfig = { dataDir: await temporary("points"), upstreamUrl: "http://127.0.0.1:8131/v1", upstreamKey: "private-secret", model: "private-model", publicModel: "Suinai Flash", kind: "chat-completions", maxOutput: 100, dailyRequests: 1, dailyOutput: 1, allowLocal: true, pointsEnabled: true, dailyPoints: 2300, ...options };
  const relay = createRelay(config, fetcher); t.after(() => relay.app.close()); await relay.app.ready();
  async function register(username: string) {
    const result = await relay.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username, password: "test-long-password-123" } });
    assert.equal(result.statusCode, 200, result.body);
    const { token, account } = result.json() as { token: string; account: { id: number } };
    const hash = (await relay.store.get("SELECT hash FROM access_tokens WHERE account_id=?", account.id))!.hash as string;
    return { token, account, hash };
  }
  return { ...relay, config, register, access: new RelayAccountAccess(relay.store) };
}
test("2300 日额度按真实输入、缓存和输出计分，旧次数限制不再阻止请求", async t => {
  const r = await fixture(t); const u = await r.register("points-member");
  for (let i = 0; i < 2; i++) assert.equal((await r.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(u.token), payload })).statusCode, 200);
  const v = (await r.app.inject({ url: "/v1/account/credits", headers: headers(u.token) })).json();
  assert.equal(v.summary.used_points, 22); assert.equal(v.summary.remaining_points, 2278); assert.equal(v.summary.reserved_points, 0);
  assert.equal(v.entries.length, 2); assert.equal(v.entries[0].cached_input_tokens, 400); assert.equal(v.entries[0].points, 11);
  assert.equal(/private-|upstream|password/.test(JSON.stringify(v)), false);
  const another = await r.register("another-member");
  assert.equal((await r.app.inject({ url: "/v1/account/credits", headers: headers(another.token) })).json().entries.length, 0);
  assert.equal((await r.app.inject({ url: "/v1/account/credits?account_id=" + u.account.id, headers: headers(another.token) })).statusCode, 400);
});
test("失败、取消、缺少用量和重复结算不扣费或重复退款", async t => {
  const r = await fixture(t); const u = await r.register("points-release");
  const op = await r.operations.reserve(u.hash, 100, "chat", 1000);
  await r.operations.settle(op, null, "failed"); await r.operations.settle(op, { input: 1000, output: 100 }, "completed"); await r.operations.release(u.hash);
  let v = await r.operations.points.view("account:" + u.account.id, u.account.id);
  assert.equal(v.summary.used_points, 0); assert.equal(v.summary.reserved_points, 0);
  const op2 = await r.operations.reserve(u.hash, 100, "chat", 1000);
  await r.operations.settle(op2, null, "unmetered"); await r.operations.release(u.hash);
  v = await r.operations.points.view("account:" + u.account.id, u.account.id); assert.equal(v.summary.remaining_points, 2300);
  const fail = await fixture(t, {}, async () => json({ error: { message: "private-secret" } }, 503)); const f = await fail.register("points-fail");
  assert.equal((await fail.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(f.token), payload })).statusCode, 502);
  assert.equal((await fail.operations.points.view("account:" + f.account.id, f.account.id)).summary.reserved_points, 0);
});
test("账号多个凭证跨能力并发预留不会透支，真实用量超预留由平台承担", async t => {
  const r = await fixture(t, { dailyPoints: 20 }); const u = await r.register("points-concurrency");
  const other = await issueStoredToken(r.store, "second-device", u.account.id);
  const operations = new RelayOperations(r.store, r.config);
  const outcomes = await Promise.allSettled([r.operations.reserve(u.hash, 100, "chat", 1000), operations.reserve(other.hash, 100, "decision", 1000)]);
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
  const success = outcomes.find(x => x.status === "fulfilled") as PromiseFulfilledResult<string>;
  await r.operations.settle(success.value, { input: 100000, output: 100 }, "completed");
  const event = (await r.store.get("SELECT points_charged,points_calculated FROM relay_usage_events WHERE id=?", success.value))!;
  assert.equal(Number(event.points_charged), 14_000_000); assert.equal(Number(event.points_calculated), 1_004_000_000);
  const v = await operations.points.view("account:" + u.account.id, u.account.id); assert.equal(v.summary.remaining_points, 6);
});
test("业务日上海零点刷新不累计，跨午夜任务使用预留日和原始价格结算", async t => {
  const r = await fixture(t, { pointsEnabled: false }); const u = await r.register("points-midnight");
  let at = new Date("2026-10-31T15:59:59.000Z");
  const p = new RelayPoints(r.store, { pointsEnabled: true }, () => at);
  const op = await r.operations.reserve(u.hash, 0);
  await r.store.transaction(tx => p.reserve(tx, op, "account:" + u.account.id, 1000, 100, false));
  at = new Date("2026-10-31T16:00:01.000Z");
  const changed = new RelayPoints(r.store, { pointsEnabled: true, pointsInputRate: 999999 }, () => at);
  await r.operations.settle(op, { input: 1000, output: 100 }, "completed"); await r.operations.release(u.hash);
  const today = await changed.view("account:" + u.account.id, u.account.id);
  assert.equal(today.summary.day, "2026-11-01"); assert.equal(today.summary.remaining_points, 2300);
  assert.equal(Number((await r.store.get("SELECT spent_micros FROM relay_point_days WHERE day='2026-10-31'"))!.spent_micros), 14_000_000);
  assert.deepEqual(pointDay(at), { day: "2026-11-01", resets: "2026-11-01T16:00:00.000Z" });
});
test("首个所有者绑定 ID，普通用户不能提权，授予和撤销的权限实时生效", async t => {
  const r = await fixture(t); const owner = await r.register("NatsuNagi"); const member = await r.register("points-operator");
  assert.equal((await r.app.inject({ url: "/v1/admin/accounts", headers: headers(owner.token) })).statusCode, 403);
  assert.equal((await r.access.bootstrapOwner("NatsuNagi")).role, "owner");
  assert.equal((await r.access.bootstrapOwner("NatsuNagi")).id, owner.account.id);
  await assert.rejects(r.access.bootstrapOwner("points-operator"), /已经存在所有者/);
  const endpoint = "/v1/admin/accounts/" + member.account.id + "/permissions";
  const grant = () => r.app.inject({ method: "POST", url: endpoint, headers: headers(owner.token), payload: { permissions: ["accounts.read", "credits.manage"] } });
  assert.equal((await r.app.inject({ method: "POST", url: endpoint, headers: headers(member.token), payload: { permissions: ["permissions.manage"] } })).statusCode, 403);
  assert.equal((await grant()).statusCode, 200);
  assert.equal((await r.app.inject({ url: "/v1/admin/accounts", headers: headers(member.token) })).statusCode, 200);
  assert.equal((await r.app.inject({ method: "POST", url: "/v1/admin/accounts/" + owner.account.id + "/points-limit", headers: headers(member.token), payload: { daily_points: 5000 } })).statusCode, 200);
  await r.access.setPermissions(owner.account.id, member.account.id, []);
  assert.equal((await r.app.inject({ url: "/v1/admin/accounts", headers: headers(member.token) })).statusCode, 403);
  await assert.rejects(r.access.setPermissions(null, owner.account.id, []), /所有者权限不能/);
  assert.ok((await r.store.all("SELECT * FROM relay_admin_audit")).length >= 4);
});
test("赠分编号幂等，限额与权限互不覆盖，降低额度不能透支", async t => {
  const r = await fixture(t); const u = await r.register("points-adjust");
  await r.access.bootstrapOwner("points-adjust");
  await r.operations.points.setLimit(null, u.account.id, 100);
  assert.equal((await r.access.describe(u.account.id)).role, "owner");
  for (let i = 0; i < 2; i++) await r.operations.points.adjust(null, u.account.id, 50, "grant-test-001", "测试补充");
  const v = await r.operations.points.view("account:" + u.account.id, u.account.id);
  assert.equal(v.summary.remaining_points, 150); assert.equal(v.summary.adjustment_points, 50);
  await assert.rejects(r.operations.points.adjust(null, u.account.id, 51, "grant-test-001", "测试补充"), /操作编号/);
  const op = await r.operations.reserve(u.hash, 100, "chat", 6000);
  await assert.rejects(r.operations.points.setLimit(null, u.account.id, 0), /不能低于/);
  await r.operations.settle(op, { input: 6000, output: 100 }, "completed"); await r.operations.release(u.hash);
  assert.equal((await r.operations.points.view("account:" + u.account.id, u.account.id)).summary.remaining_points, 86);
});
test("用量分页稳定且隔离，非法参数和超大积分输入拒绝", async t => {
  const r = await fixture(t); const u = await r.register("points-pages");
  for (let i = 0; i < 3; i++) { const op = await r.operations.reserve(u.hash, 1); await r.operations.settle(op, { input: 0, output: 1 }, "completed"); await r.operations.release(u.hash); }
  const first = await r.operations.points.view("account:" + u.account.id, u.account.id, undefined, 2);
  const next = await r.operations.points.view("account:" + u.account.id, u.account.id, first.next_cursor!, 2);
  assert.equal(first.entries.length, 2); assert.equal(next.entries.length, 1); assert.equal(next.next_cursor, null);
  assert.equal(new Set([...first.entries, ...next.entries].map(x => x.id)).size, 3);
  await assert.rejects(r.operations.points.view("account:" + u.account.id, u.account.id, "bad-cursor"), /分页/);
  assert.throws(() => pointMicros(Infinity)); assert.throws(() => pointMicros(-1)); assert.throws(() => pointMicros(1e15));
  assert.deepEqual(meteredUsage({ usage: { input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 9999 } } }), { input: 100, output: 50, cachedInput: 100 });
});
test("过期任务回收释放预留，重复维护不会重复退回", async t => {
  const r = await fixture(t); const u = await r.register("points-expire");
  await r.operations.reserve(u.hash, 100, "chat", 1000);
  await r.store.run("UPDATE relay_leases SET expires_at='2020-01-01T00:00:00.000Z'");
  await r.maintenance.tick(); await r.maintenance.tick();
  const v = await r.operations.points.view("account:" + u.account.id, u.account.id);
  assert.equal(v.summary.reserved_points, 0); assert.equal(v.summary.remaining_points, 2300); assert.equal(v.entries[0]!.state, "interrupted");
});

test("流式请求获取真实用量并结算缓存，兼容不支持 usage 参数的网关", async t => {
  let requests = 0;
  const r = await fixture(t, {}, async (_url, init) => {
    requests++; const body = JSON.parse(String(init?.body));
    if (requests === 1) {
      assert.deepEqual(body.stream_options, { include_usage: true });
      return json({ error: { message: "Unsupported parameter: stream_options", param: "stream_options", type: "invalid_request_error", code: "unsupported_parameter" } }, 400);
    }
    assert.equal(body.stream_options, undefined);
    return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":100,"prompt_tokens_details":{"cached_tokens":400}}}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
  });
  const u = await r.register("points-stream");
  const response = await r.app.inject({ method: "POST", url: "/v1/chat/completions", headers: headers(u.token), payload: { ...payload, stream: true } });
  assert.equal(response.statusCode, 200, response.body); assert.ok(response.body.includes("OK"));
  const v = await r.operations.points.view("account:" + u.account.id, u.account.id);
  assert.equal(requests, 2); assert.equal(v.entries.length, 1); assert.equal(v.summary.used_points, 11); assert.equal(v.summary.reserved_points, 0);
});

test("积分账本与管理员权限可由 SQLite 完整迁移到 PostgreSQL", async t => {
  const r = await fixture(t); const u = await r.register("points-migration");
  await r.access.bootstrapOwner("points-migration");
  await r.operations.points.setLimit(null, u.account.id, 2400);
  await r.operations.points.adjust(null, u.account.id, 25, "migration-grant-001", "迁移校验");
  const op = await r.operations.reserve(u.hash, 100, "chat", 1000);
  await r.operations.settle(op, { input: 1000, output: 100, cachedInput: 400 }, "completed"); await r.operations.release(u.hash);
  const postgres = new PGlite();
  const store = postgresRelayStore({ async query(sql, params) {
    if (sql.includes(";") && !params?.length) { const results = await postgres.exec(sql); return { rows: results.at(-1)?.rows as Record<string, unknown>[] ?? [], rowCount: 0 }; }
    const result = await postgres.query(sql, params); return { rows: result.rows as Record<string, unknown>[], rowCount: result.affectedRows };
  } }, undefined, () => postgres.close());
  const report = await migrateRelayStore(r.store, store);
  assert.equal(report.tables.find(x => x.table === "relay_point_days")?.rows, 1);
  const pgRelay = createRelayWithStore(r.config, store); t.after(() => pgRelay.app.close()); await pgRelay.app.ready();
  const response = await pgRelay.app.inject({ url: "/v1/account/credits", headers: headers(u.token) });
  assert.equal(response.statusCode, 200, response.body);
  const v = response.json(); assert.equal(v.account.role, "owner"); assert.equal(v.summary.remaining_points, 2414); assert.equal(v.summary.used_points, 11); assert.equal(v.entries.length, 1);
});


test("截图的 base64 体积不误算成文本预留，视觉用量保留独立估算", () => {
  const image = (bytes: number) => ({ messages: [{ role: "user", content: [{ type: "text", text: "看看简历" }, { type: "image_url", image_url: { url: "data:image/png;base64," + "A".repeat(bytes) } }] }] });
  assert.equal(estimateRelayInput(image(100)), estimateRelayInput(image(2_000_000)));
  assert.ok(estimateRelayInput(image(2_000_000)) < 5000);
  assert.ok(estimateRelayInput(image(100)) > 4096);
});
