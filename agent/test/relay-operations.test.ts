/** 青穗集 · 官方服务运营能力回归：账号、令牌轮换、脱敏日志、健康状态和数据库备份。 */
import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { backupRelayDatabase, createRelay, issueRelayToken, relayUsage, rotateRelayToken } from "../src/relay-app.js";
import { temporary } from "./helpers.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const config = (dataDir: string) => ({
  dataDir, upstreamUrl: "http://127.0.0.1:8131/v1", upstreamKey: "fixture-upstream-secret",
  model: "fixture-model", kind: "chat-completions" as const, maxOutput: 256,
  dailyOutput: 8192, dailyRequests: 30, allowLocal: true, adminToken: "admin-fixture-token",
});

test("官方服务账号可以登录，访问令牌可撤销和轮换", async t => {
  const relay = createRelay(config(await temporary("relay-ops-account")), async () => json({ choices: [{ message: { content: "OK" } }] }));
  t.after(() => relay.app.close());
  const registered = await relay.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "ops_user", password: "long-test-password" } });
  assert.equal(registered.statusCode, 200);
  const token = registered.json().token as string;
  const logged = await relay.app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "ops_user", password: "long-test-password" } });
  assert.equal(logged.statusCode, 200);
  const loggedToken = logged.json().token as string;
  assert.notEqual(loggedToken, token);
  const request = await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers: { authorization: "Bearer " + loggedToken }, payload: { model: "fixture-model", messages: [{ role: "user", content: "private message should never be logged" }] } });
  assert.equal(request.statusCode, 200);
  const loggedOut = await relay.app.inject({ method: "POST", url: "/v1/auth/logout", headers: { authorization: "Bearer " + loggedToken } });
  assert.equal(loggedOut.statusCode, 200);
  const blocked = await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers: { authorization: "Bearer " + loggedToken }, payload: { model: "fixture-model", messages: [{ role: "user", content: "no" }] } });
  assert.equal(blocked.statusCode, 401);
  const me = await relay.app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: "Bearer " + token } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().account.username, "ops_user");
});

test("运营接口只返回脱敏统计，健康状态和请求日志不包含正文", async t => {
  const dir = await temporary("relay-ops-admin");
  const relay = createRelay(config(dir), async () => json({ choices: [{ message: { content: "OK" } }] }));
  t.after(() => relay.app.close());
  const issued = issueRelayToken(relay.db, "admin-fixture");
  const headers = { authorization: "Bearer " + issued.token };
  const response = await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers, payload: { model: "fixture-model", messages: [{ role: "user", content: "private message should never be logged" }] } });
  assert.equal(response.statusCode, 200);
  const usage = await relay.app.inject({ method: "GET", url: "/admin/usage", headers: { "x-relay-admin-token": "admin-fixture-token" } });
  assert.equal(usage.statusCode, 200);
  assert.equal(usage.json().usage[0].label, "admin-fixture");
  const health = await relay.app.inject({ method: "GET", url: "/admin/upstream", headers: { "x-relay-admin-token": "admin-fixture-token" } });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, "ready");
  const log = relay.db.prepare("SELECT path,status,token_hash,capability FROM relay_request_log WHERE path='/v1/chat/completions'").all() as Array<Record<string, unknown>>;
  assert.equal(log.length, 1);
  assert.equal(log[0].status, 200);
  assert.equal(String(log[0].token_hash).length, 64);
  assert.equal(JSON.stringify(log).includes("private message"), false);
});

test("官方令牌轮换会撤销旧摘要，SQLite 可以生成独立备份", async t => {
  const dir = await temporary("relay-ops-backup");
  const relay = createRelay(config(dir), async () => json({ choices: [{ message: { content: "OK" } }] }));
  t.after(() => relay.app.close());
  const old = issueRelayToken(relay.db, "rotation-fixture");
  const next = rotateRelayToken(relay.db, old.hash);
  assert.notEqual(next.hash, old.hash);
  assert.equal((relay.db.prepare("SELECT revoked FROM access_tokens WHERE hash=?").get(old.hash) as { revoked: number }).revoked, 1);
  const day = new Date().toISOString().slice(0, 10);
  assert.deepEqual(relayUsage(relay.db, day), []);
  const target = join(dir, "backups", "relay.sqlite");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(join(dir, "backups"), { recursive: true }));
  backupRelayDatabase(relay.db, target);
  await access(target);
  assert.ok((await readFile(target)).byteLength > 0);
});

test("本地额度或并发限制不会把上游健康状态误判为降级", async t => {
  const relay = createRelay({ ...config(await temporary("relay-health-local-limit")), dailyRequests: 1 }, async () => json({ choices: [{ message: { content: "OK" } }] }));
  t.after(() => relay.app.close());
  const issued = issueRelayToken(relay.db, "health-fixture");
  const headers = { authorization: "Bearer " + issued.token };
  const first = await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers, payload: { model: "fixture-model", messages: [{ role: "user", content: "first" }] } });
  assert.equal(first.statusCode, 200);
  const limited = await relay.app.inject({ method: "POST", url: "/v1/chat/completions", headers, payload: { model: "fixture-model", messages: [{ role: "user", content: "second" }] } });
  assert.equal(limited.statusCode, 429);
  assert.equal((await relay.app.inject({ method: "GET", url: "/admin/upstream", headers: { "x-relay-admin-token": "admin-fixture-token" } })).json().status, "ready");
});

test("异步图片任务隐藏上游模型和任务号，并按官方账号隔离轮询与图片内容", async t => {
  const dir = await temporary("relay-image-tasks");
  let upstreamBody: Record<string, unknown> | null = null;
  const relay = createRelay({ ...config(dir), imageModel: "internal-image-model", imageDisplayName: "Suinai Image" }, async (input, init) => {
    const url = String(input);
    if (url.endsWith("/images/tasks") && init?.method === "POST") {
      upstreamBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return json({ task_id: "upstream-secret-task", status: "queued" }, 202);
    }
    if (url.endsWith("/images/tasks/upstream-secret-task")) {
      return json({ task_id: "upstream-secret-task", status: "succeeded", model: "internal-image-model", result: { data: [{ url: "/v1/images/tasks/upstream-secret-task/content/0" }] } });
    }
    if (url.endsWith("/images/tasks/upstream-secret-task/content/0")) return new Response(Uint8Array.from([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    return json({ error: { message: "not found" } }, 404);
  });
  t.after(() => relay.app.close());
  const first = await relay.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "image_owner", password: "long-image-password" } });
  const other = await relay.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "image_other", password: "long-other-password" } });
  const ownerToken = first.json().token as string;
  const otherToken = other.json().token as string;
  const created = await relay.app.inject({ method: "POST", url: "/v1/images/tasks", headers: { authorization: "Bearer " + ownerToken }, payload: { model: "Suinai Image", prompt: "一只像素麦穗猫", n: 1, response_format: "b64_json" } });
  assert.equal(created.statusCode, 202, created.body);
  const publicId = created.json().task_id as string;
  assert.match(publicId, /^img_/);
  assert.equal((upstreamBody as Record<string, unknown> | null)?.model, "internal-image-model");
  const denied = await relay.app.inject({ method: "GET", url: "/v1/images/tasks/" + publicId, headers: { authorization: "Bearer " + otherToken } });
  assert.equal(denied.statusCode, 404);
  const status = await relay.app.inject({ method: "GET", url: "/v1/images/tasks/" + publicId, headers: { authorization: "Bearer " + ownerToken } });
  assert.equal(status.statusCode, 200, status.body);
  assert.equal(status.json().task_id, publicId);
  assert.equal(status.json().model, "Suinai Image");
  assert.equal(status.json().result.data[0].url, "/v1/images/tasks/" + publicId + "/content/0");
  assert.equal(JSON.stringify(status.json()).includes("upstream-secret-task"), false);
  const content = await relay.app.inject({ method: "GET", url: "/v1/images/tasks/" + publicId + "/content/0", headers: { authorization: "Bearer " + ownerToken } });
  assert.equal(content.statusCode, 200);
  assert.equal(content.headers["content-type"], "image/png");
  assert.deepEqual([...content.rawPayload], [137, 80, 78, 71]);
});

for (const [remoteAddress, acceptsProxy] of [["127.0.0.1", true], ["203.0.113.30", false]] as const) {
  test(`反向代理登录限流${acceptsProxy ? "区分真实客户端" : "拒绝公网伪造地址"}`, async t => {
    const relay = createRelay({ ...config(await temporary("relay-proxy-limit")), trustLoopbackProxy: true });
    t.after(() => relay.app.close());
    const login = (ip: string) => relay.app.inject({ method: "POST", url: "/v1/auth/login", remoteAddress,
      headers: { "x-forwarded-for": ip }, payload: { username: "missing-user", password: "invalid-password" } });
    for (let attempt = 0; attempt < 12; attempt++) assert.equal((await login("198.51.100.21")).statusCode, 401);
    assert.equal((await login("198.51.100.21")).statusCode, 429);
    assert.equal((await login("198.51.100.22")).statusCode, acceptsProxy ? 401 : 429);
  });
}
