/** 青穗集 · 官方配置回归：展示名称与真实模型 ID 分离，仅使用隔离数据库和本机假接口。 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/http.js";
import type { Profile } from "../src/types.js";
import { noSandbox, temporary, TEST_KEY } from "./helpers.js";

async function context(t: TestContext, env: NodeJS.ProcessEnv = {}) {
  const config = loadConfig({
    AGENT_DATA_DIR: await temporary("official-config"),
    OFFICIAL_GATEWAY_URL: "https://official.example.invalid/v1",
    OFFICIAL_ACCESS_TOKEN: "fixture-official-token-not-a-real-credential",
    OFFICIAL_MODEL: "fixture-upstream-model-id",
    ...env,
  });
  const ctx = createApp({ config, sandbox: noSandbox });
  t.after(() => ctx.app.close());
  const session = ctx.auth.register("official_fixture", "Fixture-password-2026", true);
  return { ...ctx, config, ...session, headers: { authorization: "Bearer " + session.token, host: "localhost" } };
}

test("官方展示名默认 Suinai Flash，可独立配置，不改变真实模型 ID", () => {
  assert.equal(loadConfig({}).officialModelDisplayName, "Suinai Flash");
  const configured = loadConfig({ OFFICIAL_MODEL_DISPLAY_NAME: "  穗奈官方  ", OFFICIAL_MODEL: "actual-model" });
  assert.equal(configured.officialModelDisplayName, "穗奈官方");
  assert.equal(configured.officialModel, "actual-model");
  assert.equal(loadConfig({ OFFICIAL_MODEL_DISPLAY_NAME: " " }).officialModelDisplayName, "Suinai Flash");
  assert.throws(() => loadConfig({ OFFICIAL_MODEL_DISPLAY_NAME: "a".repeat(61) }), /OFFICIAL_MODEL_DISPLAY_NAME/);
});

test("官方配置列表、保存和旧记录使用当前展示名，第三方配置不改名且凭据不回显", async t => {
  const ctx = await context(t);
  const response = await ctx.app.inject({ method: "GET", url: "/api/v1/agent/models", headers: ctx.headers });
  assert.equal(response.statusCode, 200);
  const [official] = response.json<Profile[]>();
  assert.equal(official.display_name, "Suinai Flash");
  assert.equal(official.model, "fixture-upstream-model-id");
  assert.ok(!response.body.includes(ctx.config.officialToken));
  assert.equal(ctx.store.profiles(ctx.user.id).length, 1);
  const again = await ctx.profiles.list(ctx.user);
  assert.equal(again[0].id, official.id);

  const saved = await ctx.app.inject({
    method: "PUT", url: "/api/v1/agent/models/" + official.id, headers: ctx.headers,
    payload: { name: "官方连接", mode: "official" },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json<Profile>().display_name, "Suinai Flash");
  ctx.config.officialModelDisplayName = "Suinai Test";
  const [renamed] = await ctx.profiles.list(ctx.user);
  assert.equal(renamed.display_name, "Suinai Test");
  assert.equal(renamed.id, official.id);
  assert.equal(renamed.model, "fixture-upstream-model-id");

  const custom = await ctx.profiles.save(ctx.user, {
    name: "我的第三方", mode: "custom", base_url: "https://custom.example.invalid/v1",
    model: "user-selected-model", api_key: TEST_KEY,
  });
  assert.equal(custom.model, "user-selected-model");
  assert.equal(custom.display_name, undefined);
  assert.equal(custom.name, "我的第三方");
});

test("连接测试仍向本机假接口发送真实模型 ID，返回界面展示名而非改写请求", async t => {
  const bodies: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    bodies.push(JSON.parse(raw) as Record<string, unknown>);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const port = (server.address() as AddressInfo).port;
  const ctx = await context(t, { OFFICIAL_GATEWAY_URL: `http://127.0.0.1:${port}/v1` });
  const [official] = await ctx.profiles.list(ctx.user);
  const result = await ctx.app.inject({
    method: "POST", url: "/api/v1/agent/models/" + official.id + "/test", headers: ctx.headers,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json<Profile>().display_name, "Suinai Flash");
  assert.equal(result.json<Profile>().capabilities.chat, true);
  assert.ok(bodies.length > 0);
  assert.ok(bodies.every(body => body.model === "fixture-upstream-model-id"));
  assert.ok(!result.body.includes(ctx.config.officialToken));
});

test("本机账号可以连接官方账号，官方凭证不回到浏览器且可单独退出", async t => {
  const server = createServer(async (req, res) => {
    if (req.url === "/v1/auth/login" || req.url === "/v1/auth/register") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ token: "relay-account-token", account: { id: 7, username: "cloud_user" } }));
      return;
    }
    if (req.url === "/v1/auth/me") {
      res.writeHead(req.headers.authorization === "Bearer relay-account-token" ? 200 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify({ account: { id: 7, username: "cloud_user" } }));
      return;
    }
    if (req.url === "/v1/auth/logout") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const port = (server.address() as AddressInfo).port;
  const ctx = await context(t, { OFFICIAL_GATEWAY_URL: `http://127.0.0.1:${port}/v1`, OFFICIAL_ACCESS_TOKEN: "" });
  const login = await ctx.app.inject({ method: "POST", url: "/api/v1/agent/official/login", headers: ctx.headers, payload: { username: "cloud_user", password: "long-official-password" } });
  assert.equal(login.statusCode, 200, login.body);
  assert.equal(login.json().account.username, "cloud_user");
  assert.ok(!login.body.includes("relay-account-token"));
  const session = await ctx.app.inject({ method: "GET", url: "/api/v1/agent/official/session", headers: ctx.headers });
  assert.deepEqual(session.json(), { connected: true, account: { id: 7, username: "cloud_user" } });
  const logout = await ctx.app.inject({ method: "POST", url: "/api/v1/agent/official/logout", headers: ctx.headers });
  assert.equal(logout.statusCode, 200);
  assert.equal((await ctx.app.inject({ method: "GET", url: "/api/v1/agent/official/session", headers: ctx.headers })).json().connected, false);
});
