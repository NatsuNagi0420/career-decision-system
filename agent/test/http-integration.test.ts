/** 青穗集 · 本地 HTTP 全链路测试：真实协议适配、真实文件和事件，供应商是标注的脚本夹具。 */
import test from "node:test";
import assert from "node:assert/strict";
import { createFixtureProvider } from "./fixture-provider.js";
import { temporary, TEST_KEY, noSandbox } from "./helpers.js";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { id } from "../src/store.js";
test("HTTP 注册、配模型并三次探测、导入、工具循环、审批、下载及 SSE 断线重放", async (t) => {
  const provider = await createFixtureProvider();
  t.after(() => provider.close());
  const server = createApp({
    config: loadConfig({ AGENT_DATA_DIR: await temporary("http-full") }),
    sandbox: noSandbox,
  });
  await server.app.listen({ host: "127.0.0.1", port: 0 });
  const address = server.app.server.address() as any;
  const base = "http://127.0.0.1:" + address.port;
  t.after(() => server.app.close());
  const register = await server.app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      username: "http_user",
      password: "Http-test-password",
      external_ai_consent: true,
    },
  });
  assert.equal(register.statusCode, 201);
  const session = register.json();
  const headers = { authorization: "Bearer " + session.token };
  const discovered = await server.app.inject({
    method: "POST",
    url: "/api/v1/agent/models/discover",
    headers,
    payload: {
      base_url: provider.url + "/chat/completions",
      api_key: TEST_KEY,
      allow_local: true,
    },
  });
  assert.equal(discovered.statusCode, 200);
  assert.deepEqual(discovered.json().models, [{ id: "fixture-only" }]);
  assert.equal(discovered.json().base_url, provider.url);
  assert.equal(server.store.profiles(session.user.id).length, 0);
  const created = await server.app.inject({
    method: "POST",
    url: "/api/v1/agent/models",
    headers,
    payload: {
      name: "协议测试夹具（非真实模型）",
      mode: "custom",
      base_url: provider.url,
      model: "fixture-only",
      api_key: TEST_KEY,
      allow_local: true,
    },
  });
  assert.equal(created.statusCode, 201);
  const profile = created.json();
  const tested = await server.app.inject({
    method: "POST",
    url: "/api/v1/agent/models/" + profile.id + "/test",
    headers,
  });
  assert.equal(tested.statusCode, 200);
  assert.equal(tested.json().capabilities.tools, true);
  assert.equal(tested.json().capabilities.stream, true);
  assert.equal(provider.requests, 3);
  const conversation = (
    await server.app.inject({
      method: "POST",
      url: "/api/v1/agent/conversations",
      headers,
      payload: { profile_id: profile.id },
    })
  ).json();
  const cid = conversation.id;
  const file = await server.app.inject({
    method: "POST",
    url: "/api/v1/agent/conversations/" + cid + "/files",
    headers,
    payload: {
      name: "经历.txt",
      base64: Buffer.from("计算机专业；参与校园网站项目。").toString("base64"),
    },
  });
  assert.equal(file.statusCode, 200);
  const run = (
    await server.app.inject({
      method: "POST",
      url: "/api/v1/agent/conversations/" + cid + "/runs",
      headers,
      payload: {
        profile_id: profile.id,
        input: "整理测试材料",
        request_id: id(),
      },
    })
  ).json();
  await server.runtime.waitIdle();
  assert.equal(
    server.store.run(session.user.id, run.id).status,
    "awaiting_approval",
  );
  const approval = server.store.approvals(cid)[0];
  const result = await server.app.inject({
    method: "POST",
    url: "/api/v1/agent/approvals/" + approval.id,
    headers,
    payload: { approved: true },
  });
  assert.equal(result.statusCode, 200);
  await server.runtime.waitIdle();
  assert.equal(server.store.run(session.user.id, run.id).status, "completed");
  const download = await server.app.inject({
    url:
      "/api/v1/agent/artifacts/" +
      approval.artifact_id +
      "/download?approval=" +
      approval.id,
    headers,
  });
  assert.equal(download.statusCode, 200);
  assert.match(download.body, /校园网站项目/);
  const controller = new AbortController();
  const response = await fetch(
    base + "/api/v1/agent/conversations/" + cid + "/events?after=0",
    { headers, signal: controller.signal },
  );
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /data: /);
  assert.match(text, /artifact.created/);
  controller.abort();
  await reader.cancel().catch(() => {});
  const snapshot = server.runtime.snapshot(session.user, cid);
  assert.ok(snapshot.events.some((e) => e.kind === "tool.started"));
  assert.ok(snapshot.last_seq > 0);
  assert.ok(!JSON.stringify(snapshot).includes(TEST_KEY));
});
