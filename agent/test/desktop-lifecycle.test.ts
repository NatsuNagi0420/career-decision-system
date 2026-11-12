/** 青穗集 · 桌面退出回归：只有已登录、明确确认的本机同源请求可以请求完整关闭。 */
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { registerDesktopLifecycle } from "../src/desktop-lifecycle.js";
import { temporary, noSandbox } from "./helpers.js";

test("桌面退出区分登录态、确认与来源，正常网页入口不暴露控制接口", async t => {
  const config = loadConfig({ AGENT_DATA_DIR: await temporary("desktop-lifetime"), AGENT_MEMORY_BACKGROUND: "false" });
  const ctx = createApp({ config, sandbox: noSandbox });
  let exits = 0;
  t.after(() => ctx.app.close());
  registerDesktopLifecycle(ctx, { version: "0.1.0", requestExit: () => { exits++; } });
  const info = await ctx.app.inject({ url: "/api/v1/desktop", headers: { host: "127.0.0.1:8110" } });
  assert.equal(info.json().managed, true);
  const token = ctx.auth.register("desktop_fixture", "Isolated-only-123", false).token;
  const send = (authorization: string | undefined, origin: string | undefined, payload: object) => ctx.app.inject({ method: "POST", url: "/api/v1/desktop/quit", headers: { host: "127.0.0.1:8110", ...(authorization ? { authorization: "Bearer " + authorization } : {}), ...(origin ? { origin } : {}) }, payload });
  assert.notEqual((await send(undefined, "http://127.0.0.1:8110", { confirmed: true })).statusCode, 200);
  assert.notEqual((await send(token, "http://127.0.0.1:8110", { confirmed: false })).statusCode, 200);
  assert.notEqual((await send(token, undefined, { confirmed: true })).statusCode, 200);
  assert.notEqual((await send(token, "https://unrelated.invalid", { confirmed: true })).statusCode, 200);
  assert.equal(exits, 0);
  const stopped = await send(token, "http://127.0.0.1:8110", { confirmed: true });
  assert.equal(stopped.statusCode, 200);
  assert.equal(stopped.json().stopping, true);
  assert.equal(exits, 1);
});

test("普通开发入口不提供桌面退出控制", async t => {
  const ctx = createApp({ config: loadConfig({ AGENT_DATA_DIR: await temporary("desktop-unmanaged"), AGENT_MEMORY_BACKGROUND: "false" }), sandbox: noSandbox });
  t.after(() => ctx.app.close());
  assert.equal((await ctx.app.inject({ url: "/api/v1/desktop", headers: { host: "127.0.0.1" } })).statusCode, 404);
});
