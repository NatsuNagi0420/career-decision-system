/** 青穗集 · 供应商兼容回归：只用本地 HTTP 与内存响应，验证发现、协商和失败诊断。 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { discoverModels, ProviderError } from "../src/provider.js";
import { CompatibleModel } from "../src/model.js";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { AppError } from "../src/errors.js";
import {
  temporary,
  fixture,
  ScriptedModel,
  reply,
  TEST_KEY,
  noSandbox,
} from "./helpers.js";
import type { ModelRequest } from "../src/types.js";
const connection = {
  base_url: "https://example.invalid/v1",
  key: TEST_KEY,
  model: "fixture-model",
  api_kind: "chat-completions" as const,
  allow_local: false,
  timeout_ms: 5000,
  max_output_tokens: 2048,
};
const request = (): ModelRequest => ({
  messages: [{ role: "user", content: "测试" }],
  tools: [],
  signal: AbortSignal.timeout(5000),
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const chat = (content = "OK") => ({
  choices: [{ message: { content }, finish_reason: "stop" }],
});
async function upstream(
  t: TestContext,
  respond: (req: IncomingMessage, res: ServerResponse, body: any) => void,
) {
  const requests: {
    path: string;
    body: any;
    authorization: string | undefined;
  }[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({
      path: req.url ?? "",
      body,
      authorization: req.headers.authorization,
    });
    res.setHeader("content-type", "application/json");
    respond(req, res, body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  return {
    url: "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/v1",
    requests,
  };
}
async function context(t: TestContext) {
  const ctx = createApp({
    config: loadConfig({ AGENT_DATA_DIR: await temporary("provider-compat") }),
    sandbox: noSandbox,
  });
  t.after(async () => {
    await ctx.app.close();
  });
  const session = ctx.auth.register(
    "compat_user",
    "Fixture-password-2026",
    true,
  );
  return {
    ...ctx,
    ...session,
    headers: { authorization: "Bearer " + session.token, host: "localhost" },
  };
}

test("模型发现接受标准与常见列表封装，去重且不把凭据当成模型返回", async () => {
  for (const value of [
    {
      data: [
        { id: "z-model" },
        { id: "a-model", name: "模型 A" },
        { id: "a-model", name: "模型 A" },
        { id: TEST_KEY },
        { id: "bad\nname" },
      ],
    },
    { models: ["z-model", { name: "a-model" }, "a-model"] },
    { data: { models: [{ id: "z-model" }, { id: "a-model" }] } },
  ]) {
    let sent: RequestInit | undefined;
    const result = await discoverModels(
      connection,
      request().signal,
      async (url, init) => {
        assert.equal(url, connection.base_url + "/models");
        sent = init;
        return json(value);
      },
      false,
    );
    assert.deepEqual(
      result.map((item) => item.id),
      ["a-model", "z-model"],
    );
    assert.equal(sent?.method, "GET");
    assert.equal(sent?.body, undefined);
    assert.equal(sent?.redirect, "error");
  }
});
test("官方模型请求携带内部能力路由标识，自定义接口不携带", async () => {
  let officialHeaders: Record<string, string> | undefined;
  const official = new CompatibleModel(
    { ...connection, official: true },
    async (_url, init) => {
      officialHeaders = init?.headers as Record<string, string>;
      return json(chat());
    },
    false,
  );
  await official.complete({ ...request(), routingCapability: "compare_decide" });
  assert.equal(officialHeaders?.["X-Suinai-Capability"], "compare_decide");

  let customHeaders: Record<string, string> | undefined;
  const custom = new CompatibleModel(
    connection,
    async (_url, init) => {
      customHeaders = init?.headers as Record<string, string>;
      return json(chat());
    },
    false,
  );
  await custom.complete({ ...request(), routingCapability: "compare_decide" });
  assert.equal(customHeaders?.["X-Suinai-Capability"], undefined);
});
test("模型发现拒绝 HTML、空列表与无效格式，提供手动入口说明", async () => {
  for (const value of [
    json({ data: [] }),
    json({ hello: "world" }),
    new Response("<html>not-api</html>"),
  ]) {
    await assert.rejects(
      discoverModels(connection, request().signal, async () => value, false),
      (error) => error instanceof AppError && !error.message.includes("<html>"),
    );
  }
});
test("明确不支持参数时协商 token 字段与流式选项，后续请求复用兼容结果", async () => {
  const bodies: any[] = [];
  const model = new CompatibleModel(
    connection,
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (body.max_tokens)
        return json(
          {
            error: {
              message:
                "Unsupported parameter: max_tokens; use max_completion_tokens",
            },
          },
          400,
        );
      if (body.stream_options)
        return json(
          { error: { message: "Unknown parameter stream_options" } },
          422,
        );
      return json(chat());
    },
    false,
  );
  const first = await model.complete({ ...request(), stream: true });
  assert.equal(first.streamed, false);
  assert.equal(bodies.length, 3);
  await model.complete({ ...request(), stream: true });
  assert.equal(bodies.length, 4);
  assert.equal(bodies[3].max_completion_tokens, 2048);
  assert.ok(!("stream_options" in bodies[3]));
});
test("工具声明的 strict 与强制 tool_choice 可协商，仍要求返回真实工具请求", async () => {
  const bodies: any[] = [];
  const model = new CompatibleModel(
    connection,
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (body.tools[0].function.strict !== undefined)
        return json(
          {
            error: {
              param: "tools.0.function.strict",
              message: "unsupported parameter",
            },
          },
          400,
        );
      if (body.tool_choice)
        return json(
          { error: { message: "tool_choice is not supported" } },
          400,
        );
      return json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_probe",
                  function: { name: "probe", arguments: "{}" },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
    },
    false,
  );
  const result = await model.complete({
    ...request(),
    forceTool: "probe",
    tools: [
      { name: "probe", description: "fixture", parameters: { type: "object" } },
    ],
  });
  assert.equal(bodies.length, 3);
  assert.equal(result.tool_calls[0].name, "probe");
});
test("鉴权、配额和 503 不盲目重试；原始供应商错误包含密钥时不会回显", async () => {
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    const model = new CompatibleModel(
      connection,
      async () => {
        calls++;
        return json({ error: { message: "secret=" + TEST_KEY } }, status);
      },
      false,
    );
    await assert.rejects(
      model.complete(request()),
      (error) =>
        error instanceof ProviderError &&
        error.upstreamStatus === status &&
        !error.message.includes(TEST_KEY) &&
        error.message.includes("HTTP " + status),
    );
    assert.equal(calls, 1);
  }
});
test("New API 无可用通道错误分类解释，不泄露上游原文", async () => {
  const model = new CompatibleModel(
    connection,
    async () =>
      json(
        {
          error: {
            code: "no_available_channel",
            message: "该分组下无可用渠道 " + TEST_KEY,
          },
        },
        503,
      ),
    false,
  );
  await assert.rejects(
    model.complete(request()),
    (error) =>
      error instanceof ProviderError &&
      error.code === "provider_channel_unavailable" &&
      error.message.includes("通道") &&
      !error.message.includes(TEST_KEY),
  );
});
test("模型发现需要登录和同意，不要求先填写模型，也不会保存未完成配置", async (t) => {
  const provider = await upstream(t, (_req, res) =>
    res.end(JSON.stringify({ data: [{ id: "gateway-chat" }] })),
  );
  const f = await context(t);
  const path = "/api/v1/agent/models/discover";
  const payload = {
    base_url: provider.url,
    api_key: TEST_KEY,
    allow_local: true,
  };
  assert.equal(
    (await f.app.inject({ method: "POST", url: path, payload })).statusCode,
    401,
  );
  const deniedUser = f.auth.register(
    "no_consent",
    "Fixture-password-2026",
    false,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: path,
        payload,
        headers: { authorization: "Bearer " + deniedUser.token },
      })
    ).statusCode,
    403,
  );
  const found = await f.app.inject({
    method: "POST",
    url: path,
    headers: f.headers,
    payload,
  });
  assert.equal(found.statusCode, 200);
  assert.deepEqual(found.json().models, [{ id: "gateway-chat" }]);
  assert.equal(f.store.profiles(f.user.id).length, 0);
  assert.equal(provider.requests.length, 1);
});
test("只在同一地址复用已保存密钥，改地址不允许隐式转发密钥", async (t) => {
  const provider = await upstream(t, (_req, res) =>
    res.end(JSON.stringify({ data: [{ id: "gateway-chat" }] })),
  );
  const f = await context(t);
  const profile = await f.profiles.save(f.user, {
    name: "fixture",
    mode: "custom",
    base_url: provider.url,
    model: "gateway-chat",
    api_key: TEST_KEY,
    allow_local: true,
  });
  assert.equal(
    (
      await f.profiles.discover(f.user, {
        base_url: provider.url + "/chat/completions",
        profile_id: profile.id,
        allow_local: true,
      })
    ).models.length,
    1,
  );
  const changed = provider.url.replace("/v1", "/other");
  await assert.rejects(
    f.profiles.discover(f.user, {
      base_url: changed,
      profile_id: profile.id,
      allow_local: true,
    }),
    (error) => error instanceof AppError && error.status === 400,
  );
  await assert.rejects(
    f.profiles.save(
      f.user,
      {
        name: "fixture",
        mode: "custom",
        base_url: changed,
        model: "gateway-chat",
        allow_local: true,
      },
      profile.id,
    ),
    (error) => error instanceof AppError && error.status === 400,
  );
  const other = f.auth.register(
    "another_user",
    "Fixture-password-2026",
    true,
  ).user;
  await assert.rejects(
    f.profiles.discover(other, {
      base_url: provider.url,
      profile_id: profile.id,
      allow_local: true,
    }),
    (error) => error instanceof AppError && error.status === 404,
  );
  assert.equal(provider.requests.length, 1);
});
test("自动检测只支持 Responses 的网关，工具续答保留不透明状态，运行沿用检测结果", async (t) => {
  const opaque = {
    type: "reasoning",
    id: "reasoning_test",
    encrypted_content: "fixture-opaque",
  };
  const provider = await upstream(t, (req, res, body) => {
    if (req.url?.endsWith("/chat/completions")) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: { message: "path not found" } }));
      return;
    }
    const hasTools = body.tools?.length;
    const continued = body.input?.some(
      (item: any) => item.type === "function_call_output",
    );
    res.end(
      JSON.stringify({
        status: "completed",
        output:
          hasTools && !continued
            ? [
                opaque,
                {
                  type: "function_call",
                  call_id: "call_probe",
                  name: "connection_probe",
                  arguments: '{"value":"pong"}',
                },
              ]
            : [
                {
                  type: "message",
                  content: [{ type: "output_text", text: "OK" }],
                },
              ],
      }),
    );
  });
  const f = await context(t);
  const profile = await f.profiles.save(f.user, {
    name: "Responses fixture",
    mode: "custom",
    base_url: provider.url,
    model: "fixture-responses",
    api_key: TEST_KEY,
    allow_local: true,
  });
  assert.equal(profile.api_kind, "auto");
  const tested = await f.profiles.test(f.user, profile.id);
  assert.equal(tested.capabilities.chat, true);
  assert.equal(tested.capabilities.tools, true);
  assert.equal(tested.capabilities.stream, false);
  assert.equal(tested.resolved_api_kind, "responses");
  assert.deepEqual(provider.requests[3].body.input[1], opaque);
  const model = await f.profiles.model(f.user, tested);
  await model.complete(request());
  assert.equal(provider.requests.at(-1)?.path, "/v1/responses");
  assert.equal(
    provider.requests.filter((r) => r.path.endsWith("chat/completions")).length,
    1,
  );
});
test("连接测试遇到 503 只请求一次并给出失败阶段；工具未测试不伪造通过", async (t) => {
  const provider = await upstream(t, (_req, res) => {
    res.writeHead(503);
    res.end(
      JSON.stringify({
        error: { code: "no_available_channel", message: TEST_KEY },
      }),
    );
  });
  const f = await context(t);
  const profile = await f.profiles.save(f.user, {
    name: "Unavailable fixture",
    mode: "custom",
    base_url: provider.url,
    model: "offline-model",
    api_key: TEST_KEY,
    allow_local: true,
  });
  const tested = await f.profiles.test(f.user, profile.id);
  assert.equal(tested.capabilities.chat, false);
  assert.equal(tested.capabilities.tools, false);
  assert.equal(provider.requests.length, 1);
  assert.ok(tested.capabilities.note.includes("HTTP 503"));
  assert.ok(!JSON.stringify(tested).includes(TEST_KEY));
  assert.ok(
    !tested.capabilities.checks?.some((check) => check.stage === "tools"),
  );
});
test("流式不支持时补测非流式，工具失败仍保留可用聊天", async (t) => {
  const f = await fixture(t, {
    model: new ScriptedModel((request) => {
      if (request.stream) throw new ProviderError(400, "stream 不受支持");
      if (request.tools.length) throw new ProviderError(400, "工具不受支持");
      return reply("普通聊天可用");
    }),
  });
  const tested = await f.profiles.test(f.user, f.profile.id);
  assert.equal(tested.capabilities.chat, true);
  assert.equal(tested.capabilities.stream, false);
  assert.equal(tested.capabilities.tools, false);
  assert.ok(
    tested.capabilities.checks?.some(
      (check) => check.stage === "chat" && check.ok,
    ),
  );
});

test("明确不支持 stream 时自动收普通 JSON，后续同模型请求不再强行流式", async () => {
  const bodies: any[] = [];
  const model = new CompatibleModel(
    connection,
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return body.stream
        ? json(
            { error: { param: "stream", message: "stream is not supported" } },
            400,
          )
        : json(chat());
    },
    false,
  );
  const result = await model.complete({ ...request(), stream: true });
  assert.equal(result.streamed, false);
  await model.complete({ ...request(), stream: true });
  assert.equal(bodies.length, 3);
  assert.equal(bodies[2].stream, false);
  assert.ok(!bodies[2].stream_options);
});
test("只在工具阶段丢失流式时仍验证工具往返，并让后续任务使用非流式", async (t) => {
  const f = await fixture(t, {
    model: new ScriptedModel((request) =>
      request.forceTool
        ? {
            ...reply("", [
              {
                id: "call_plain",
                name: "connection_probe",
                arguments: '{"value":"pong"}',
              },
            ]),
            streamed: false,
          }
        : { ...reply("OK"), streamed: Boolean(request.stream) },
    ),
  });
  const tested = await f.profiles.test(f.user, f.profile.id);
  assert.equal(tested.capabilities.chat, true);
  assert.equal(tested.capabilities.tools, true);
  assert.equal(tested.capabilities.stream, false);
  assert.equal(f.model.requests[0].maxOutputTokens, 2048);
});

test("429 区分中转预算、并发和上游余额，保留分类且不回显原始错误", async () => {
  for (const [code, expected, message] of [
    ["relay_daily_output_limit", "relay_daily_output_limit", "RELAY_DAILY_OUTPUT_TOKEN_LIMIT"],
    ["relay_daily_request_limit", "relay_daily_request_limit", "RELAY_DAILY_REQUEST_LIMIT"],
    ["relay_busy", "relay_busy", "正在处理"],
    ["provider_quota", "provider_quota", "余额"],
    ["unknown_code", "provider_429", "HTTP 429 本身不能说明余额不足"],
    ["constructor", "provider_429", "HTTP 429 本身不能说明余额不足"],
  ]) {
    let calls = 0;
    const model = new CompatibleModel(connection, async () => {
      calls++; return json({ error: { type: "relay_error", code, message: "private " + TEST_KEY } }, 429);
    }, false);
    await assert.rejects(model.complete(request()), error => error instanceof ProviderError && error.code === expected && error.message.includes(message) && !error.message.includes(TEST_KEY));
    assert.equal(calls, 1);
  }
});
