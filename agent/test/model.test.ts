/** 青穗集 · 模型协议回归：以本地 HTTP/Response 夹具测试，不代表真实供应商验收。 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CompatibleModel,
  normalizeBaseUrl,
  validateEndpoint,
} from "../src/model.js";
import { fixture, ScriptedModel, reply, tool, TEST_KEY } from "./helpers.js";
import type { ModelRequest } from "../src/types.js";
const request = (): ModelRequest => ({
  messages: [{ role: "user", content: "你好" }],
  tools: [],
  signal: AbortSignal.timeout(5000),
});
const connection = {
  base_url: "https://example.invalid/v1",
  model: "test-model",
  key: TEST_KEY,
  api_kind: "chat-completions" as const,
  allow_local: false,
  timeout_ms: 5000,
  max_output_tokens: 256,
};
const chat = (content = "OK", tool_calls: unknown[] = []) => ({
  choices: [
    {
      message: { content, tool_calls },
      finish_reason: tool_calls.length ? "tool_calls" : "stop",
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 4 },
});
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
const sse = (events: unknown[], done = true) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const data =
          events
            .map((item) => "data: " + JSON.stringify(item) + "\r\n\r\n")
            .join("") + (done ? "data: [DONE]\r\n\r\n" : "");
        const bytes = new TextEncoder().encode(data);
        for (let i = 0; i < bytes.length; i += 3)
          controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
test("Base URL 规范化，支持完整 API 路径但拒绝 URL 凭据和未授权 HTTP", () => {
  assert.equal(
    normalizeBaseUrl("https://example.com"),
    "https://example.com/v1",
  );
  assert.equal(
    normalizeBaseUrl(" https://example.com/v1/ "),
    "https://example.com/v1",
  );
  for (const suffix of ["chat/completions", "responses", "models"]) {
    assert.equal(
      normalizeBaseUrl("https://example.com/v1/" + suffix + "/"),
      "https://example.com/v1",
    );
    assert.equal(
      normalizeBaseUrl("https://example.com/custom/api/" + suffix),
      "https://example.com/custom/api",
    );
  }
  for (const url of [
    "https://user:pass@example.com/v1",
    "https://example.com/v1?key=x",
    "http://127.0.0.1:8000/v1",
  ])
    assert.throws(() => normalizeBaseUrl(url));
  assert.equal(
    normalizeBaseUrl("http://127.0.0.1:8000/v1", true),
    "http://127.0.0.1:8000/v1",
  );
});
test("本机地址须明确授权，系统元数据地址始终阻止", async () => {
  await assert.rejects(validateEndpoint("http://127.0.0.1/v1", false));
  await validateEndpoint("http://127.0.0.1/v1", true);
  await assert.rejects(validateEndpoint("http://169.254.169.254/v1", true));
  await assert.rejects(validateEndpoint("https://[::ffff:7f00:1]/v1", false));
  await assert.rejects(validateEndpoint("http://[::ffff:a9fe:a9fe]/v1", true));
});
test("Chat 普通请求与工具输出续答载荷正确，重定向禁止", async () => {
  let sent: any;
  const model = new CompatibleModel(
    connection,
    async (_url, init) => {
      sent = init;
      return response(chat("你好"));
    },
    false,
  );
  const value = await model.complete(request());
  assert.equal(value.text, "你好");
  assert.equal(value.input_tokens, 12);
  assert.equal(sent.redirect, "error");
  assert.equal(JSON.parse(sent.body).model, "test-model");
  assert.equal(sent.headers.Authorization, "Bearer " + TEST_KEY);
});
test("Chat 流式 UTF-8/CRLF 任意分片合并正文和工具参数", async () => {
  let delta = "";
  const model = new CompatibleModel(
    connection,
    async () =>
      sse([
        {
          choices: [
            {
              delta: {
                content: "你好",
                tool_calls: [
                  {
                    index: 0,
                    id: "call_one",
                    function: { name: "write_file", arguments: '{"path":' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '"outputs/a.txt","content":"好"}' },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 6 },
        },
      ]),
    false,
  );
  const value = await model.complete({
    ...request(),
    stream: true,
    onDelta: (text) => (delta += text),
  });
  assert.equal(delta, "你好");
  assert.equal(value.tool_calls[0].name, "write_file");
  assert.deepEqual(JSON.parse(value.tool_calls[0].arguments), {
    path: "outputs/a.txt",
    content: "好",
  });
  assert.equal(value.output_tokens, 6);
});
test("缺失终止事件、截断、过滤、无效 JSON 或供应商错误不会被当作执行成功", async () => {
  const values = [
    sse([{ choices: [{ delta: { content: "残缺" } }] }], false),
    response({
      ...chat("partial"),
      choices: [{ message: { content: "partial" }, finish_reason: "length" }],
    }),
    new Response("not-json"),
    new Response(JSON.stringify({ error: { message: TEST_KEY } }), {
      status: 401,
    }),
  ];
  for (const value of values) {
    const model = new CompatibleModel(connection, async () => value, false);
    await assert.rejects(
      model.complete({
        ...request(),
        stream: value.headers
          .get("content-type")
          ?.includes("text/event-stream"),
      }),
      (error) => !String(error).includes(TEST_KEY),
    );
  }
});
test("不支持 max_tokens 时只按参数错误重试一次", async () => {
  const bodies: any[] = [];
  const model = new CompatibleModel(
    connection,
    async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return bodies.length === 1
        ? new Response(JSON.stringify({ error: { param: "max_tokens" } }), {
            status: 400,
          })
        : response(chat());
    },
    false,
  );
  await model.complete(request());
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].max_completion_tokens, 256);
  assert.ok(!("max_tokens" in bodies[1]));
});
test("Responses 输出含不透明状态，下一次工具输出带上原样续答项且不泄露至 UI", async (t) => {
  const items = [
    { type: "reasoning", id: "rs_1", encrypted_content: "opaque-test-data" },
    {
      type: "function_call",
      call_id: "call_resp",
      name: "list_files",
      arguments: "{}",
    },
  ];
  let payload: any;
  const model = new CompatibleModel(
    { ...connection, api_kind: "responses" },
    async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return response({
        status: "completed",
        output: items,
        usage: { input_tokens: 5, output_tokens: 2 },
      });
    },
    false,
  );
  const result = await model.complete(request());
  assert.deepEqual(result.response_items, items);
  await model.complete({
    ...request(),
    messages: [
      {
        role: "assistant",
        content: "",
        tool_calls: result.tool_calls,
        response_items: result.response_items,
      },
      { role: "tool", content: "[]", tool_call_id: "call_resp" },
    ],
  });
  assert.deepEqual(payload.input.slice(0, 2), items);
  assert.equal(payload.input[2].type, "function_call_output");
  assert.equal(payload.store, false);
  assert.deepEqual(payload.include, ["reasoning.encrypted_content"]);
  const f = await fixture(t, {
    model: new ScriptedModel((_, index) =>
      index === 0
        ? { ...reply("", [tool("list_files", {})]), response_items: items }
        : reply(),
    ),
  });
  f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "状态测试",
    crypto.randomUUID(),
  );
  await f.runtime.waitIdle();
  assert.ok(
    !JSON.stringify(f.runtime.snapshot(f.user, f.conversation.id)).includes(
      "opaque-test-data",
    ),
  );
});
test("Responses 流以 completed 的完整 output 为准，只有 DONE 不算完整", async () => {
  const model = new CompatibleModel(
    { ...connection, api_kind: "responses" },
    async () =>
      sse([
        { type: "response.output_text.delta", delta: "已完成" },
        {
          type: "response.completed",
          response: {
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "已完成" }],
              },
            ],
          },
        },
      ]),
    false,
  );
  assert.equal(
    (await model.complete({ ...request(), stream: true })).text,
    "已完成",
  );
  const incomplete = new CompatibleModel(
    { ...connection, api_kind: "responses" },
    async () => sse([{ type: "response.output_text.delta", delta: "残缺" }]),
    false,
  );
  await assert.rejects(incomplete.complete({ ...request(), stream: true }));
});
test("模型能力测试实际验证聊天、工具参数和工具续答；不支持工具只开放聊天", async (t) => {
  const f = await fixture(t, {
    model: new ScriptedModel((request) =>
      request.forceTool
        ? reply("", [tool("connection_probe", { value: "pong" })])
        : reply("pong"),
    ),
  });
  const tested = await f.profiles.test(f.user, f.profile.id);
  assert.equal(tested.capabilities.chat, true);
  assert.equal(tested.capabilities.tools, true);
  assert.equal(f.model.requests.length, 3);
  const g = await fixture(t, {
    model: new ScriptedModel(() => reply("只会聊天")),
  });
  const chatOnly = await g.profiles.test(g.user, g.profile.id);
  assert.equal(chatOnly.capabilities.chat, true);
  assert.equal(chatOnly.capabilities.tools, false);
});

test("Chat 与 Responses 在工具尚未完成时持续提供参数快照，仍以完整响应决定执行", async () => {
  const argumentsText = JSON.stringify({ request_id: "test", data: { kind: "rewrite", body: { summary: { text: "", fact_ids: [] }, sections: [] } } });
  const halfway = Math.floor(argumentsText.length / 2);
  for (const api_kind of ["chat-completions", "responses"] as const) {
    const toolCall = { type: "function_call", call_id: "preview-call", name: "propose_resume_update", arguments: argumentsText };
    const events = api_kind === "chat-completions" ? [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "preview-call", function: { name: "propose_resume_update", arguments: argumentsText.slice(0, halfway) } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: argumentsText.slice(halfway) } }] }, finish_reason: "tool_calls" }] },
    ] : [
      { type: "response.output_item.added", output_index: 0, item: { ...toolCall, arguments: "" } },
      { type: "response.function_call_arguments.delta", output_index: 0, delta: argumentsText.slice(0, halfway) },
      { type: "response.function_call_arguments.delta", output_index: 0, delta: argumentsText.slice(halfway) },
      { type: "response.completed", response: { status: "completed", output: [toolCall] } },
    ];
    const snapshots: string[] = [];
    const model = new CompatibleModel({ ...connection, api_kind }, async () => sse(events), false);
    const result = await model.complete({ ...request(), stream: true, onToolDelta: call => snapshots.push(call.arguments) });
    assert.equal(snapshots[0], argumentsText.slice(0, halfway));
    assert.equal(snapshots.at(-1), argumentsText);
    assert.equal(result.tool_calls[0].arguments, argumentsText);
    assert.equal(result.tool_calls[0].name, "propose_resume_update");
  }
});
