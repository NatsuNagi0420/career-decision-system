/** 青穗集 · 云端入口回归：官方身份映射、云端权限边界和账号令牌隔离。 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { noSandbox, temporary } from "./helpers.js";

test("云端入口只使用官方账号令牌并拒绝本机工作区", async t => {
  const relay = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/auth/login" && request.method === "POST") {
      response.end(JSON.stringify({ token: "qsg_fixture_account_token", account: { id: 77, username: "cloud_user" } }));
      return;
    }
    if (request.url === "/v1/auth/me") {
      response.end(JSON.stringify({ account: { id: 77, username: "cloud_user" }, usage: { requests: 1 } }));
      return;
    }
    if (request.url === "/v1/auth/logout") { response.end(JSON.stringify({ ok: true })); return; }
    response.writeHead(404); response.end(JSON.stringify({ detail: "not found" }));
  });
  await new Promise<void>(resolve => relay.listen(0, "127.0.0.1", resolve));
  const address = relay.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const config = loadConfig({
    AGENT_DEPLOYMENT_MODE: "server",
    AGENT_DATA_DIR: await temporary("cloud-identity"),
    AGENT_PUBLIC_ORIGIN: "http://127.0.0.1",
    AGENT_ALLOWED_ORIGINS: "http://127.0.0.1",
    OFFICIAL_GATEWAY_URL: `http://127.0.0.1:${port}/v1`,
    OFFICIAL_MODEL: "Suinai Flash",
  });
  const ctx = createApp({ config, unifiedIdentity: true, sandbox: noSandbox });
  t.after(async () => { await ctx.app.close(); await new Promise<void>(resolve => relay.close(() => resolve())); });
  const login = await ctx.app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { host: "127.0.0.1" }, payload: { username: "cloud_user", password: "not-used-by-relay" } });
  assert.equal(login.statusCode, 200, login.body);
  assert.equal(login.json<{ token: string }>().token, "qsg_fixture_account_token");
  const headers = { host: "127.0.0.1", authorization: "Bearer qsg_fixture_account_token" };
  const me = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers });
  assert.equal(me.statusCode, 200, me.body);
  assert.equal(me.json<{ identity: string; official_account: { id: number } }>().identity, "official");
  assert.equal(me.json<{ official_account: { id: number } }>().official_account.id, 77);
  const onboarding = await ctx.app.inject({ url: "/api/v1/agent/onboarding", headers });
  assert.equal(onboarding.json().status, "pending");
  await ctx.app.inject({ url: "/api/v1/agent/onboarding", method: "PATCH", headers, payload: { status: "skipped", step: 0 } });
  // 身份再次验证只更新映射，不把已跳过的官方账号重置成首次使用。
  assert.equal((await ctx.app.inject({ url: "/api/v1/agent/onboarding", headers })).json().status, "skipped");
  const workspaces = await ctx.app.inject({ method: "GET", url: "/api/v1/agent/workspaces", headers });
  assert.equal(workspaces.statusCode, 200);
  assert.deepEqual(workspaces.json(), []);
  const denied = await ctx.app.inject({ method: "POST", url: "/api/v1/agent/workspaces", headers, payload: { root_path: "C:\\Users" } });
  assert.equal(denied.statusCode, 403, denied.body);
  assert.equal(denied.json<{ code: string }>().code, "local_only");
});
