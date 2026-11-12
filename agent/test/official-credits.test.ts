/** 青穗集 · 积分代理验收：PC 与云端复用官方账号账本，拒绝未登录及跨账号查询。 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRelay } from "../src/relay-app.js";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { noSandbox, temporary } from "./helpers.js";
for (const mode of ["local", "server"] as const) test(mode + " 的积分代理使用当前官方身份凭证，不接受客户端指定账号", async t => {
  const relay = createRelay({ dataDir: await temporary("credits-proxy-relay"), upstreamUrl: "http://127.0.0.1:8131/v1", upstreamKey: "fixture-upstream", model: "fixture", publicModel: "Suinai Flash", kind: "chat-completions", maxOutput: 100, dailyOutput: 1000, dailyRequests: 10, allowLocal: true, pointsEnabled: true }, async () => { throw Error("积分读取不得请求付费模型"); });
  await relay.app.listen({ host: "127.0.0.1", port: 0 });
  const address = relay.app.server.address(); assert.ok(address && typeof address === "object");
  const register = await relay.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "proxy-member", password: "credits-test-password" } });
  const config = loadConfig({ AGENT_DEPLOYMENT_MODE: mode, AGENT_DATA_DIR: await temporary("credits-proxy-agent"), AGENT_PUBLIC_ORIGIN: "http://127.0.0.1", AGENT_ALLOWED_ORIGINS: "http://127.0.0.1", OFFICIAL_GATEWAY_URL: `http://127.0.0.1:${address.port}/v1`, OFFICIAL_MODEL: "Suinai Flash" });
  const ctx = createApp({ config, unifiedIdentity: true, sandbox: noSandbox });
  t.after(async () => { await ctx.app.close(); await relay.app.close(); });
  const login = await ctx.app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { host: "127.0.0.1" }, payload: { username: "proxy-member", password: "credits-test-password" } });
  assert.equal(login.statusCode, 200, login.body);
  const headers = { host: "127.0.0.1", authorization: "Bearer " + login.json().token };
  const response = await ctx.app.inject({ url: "/api/v1/agent/official/credits", headers });
  assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().account.id, register.json().account.id); assert.equal(response.json().summary.remaining_points, 2300);
  assert.equal((await ctx.app.inject({ url: "/api/v1/agent/official/credits?account_id=9999", headers })).statusCode, 400);
  assert.equal((await ctx.app.inject({ url: "/api/v1/agent/official/credits", headers: { host: "127.0.0.1" } })).statusCode, 401);
});
