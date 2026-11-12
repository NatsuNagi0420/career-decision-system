/** 青穗集 · 官方中转与沙箱边界回归：配额和固定上游为夹具；Docker 隔离需显式启用实测。 */
import test from "node:test";
import { validateRelayPayload } from "../src/relay-policy.js";
import assert from "node:assert/strict";
import { createRelay, issueRelayToken } from "../src/relay-app.js";
import {
  dockerRunArguments,
  dockerEnvironment,
  DockerSandbox,
  dockerUser,
} from "../src/sandbox.js";
import { temporary, fixture } from "./helpers.js";

test("官方中转凭证鉴权、固定上游和模型、可撤销令牌及日配额", async (t) => {
  const dir = await temporary("relay");
  let sent: any;
  let hits = 0;
  const relay = createRelay(
    {
      dataDir: dir,
      upstreamUrl: "http://127.0.0.1:8131/v1",
      upstreamKey: "upstream-test-secret",
      model: "fixed-model",
      kind: "chat-completions",
      maxOutput: 128,
      dailyOutput: 256,
      dailyRequests: 2,
      allowLocal: true,
    },
    async (url, init) => {
      sent = { url, init };
      hits++;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        }),
      );
    },
  );
  t.after(() => relay.app.close());
  const token = issueRelayToken(relay.db, "测试安装");
  const headers = { authorization: "Bearer " + token.token };
  const payload = {
    model: "fixed-model",
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 128,
    stream: false,
  };
  assert.equal(
    (
      await relay.app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload,
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await relay.app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload,
        headers: { ...headers, origin: "http://localhost" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await relay.app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { ...payload, model: "other" },
        headers,
      })
    ).statusCode,
    403,
  );
  for (let n = 0; n < 2; n++) {
    const result = await relay.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload,
      headers,
    });
    assert.equal(result.statusCode, 200);
    assert.ok(!result.body.includes("upstream-test-secret"));
  }
  assert.equal(hits, 2);
  assert.equal(sent.url, "http://127.0.0.1:8131/v1/chat/completions");
  assert.equal(sent.init.headers.Authorization, "Bearer upstream-test-secret");
  const limited = await relay.app.inject({ method: "POST", url: "/v1/chat/completions", payload, headers });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, "relay_daily_request_limit");
  assert.equal(hits, 2);
  relay.db
    .prepare("UPDATE access_tokens SET revoked=1 WHERE hash=?")
    .run(token.hash);
  assert.equal(
    (
      await relay.app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload,
        headers,
      })
    ).statusCode,
    401,
  );
  assert.ok(
    !JSON.stringify(
      relay.db.prepare("SELECT * FROM access_tokens").all(),
    ).includes(token.token),
  );
});
test("官方 Responses 中转保留必要状态参数，强制 store=false 并限制请求字段", async (t) => {
  let body: any;
  const relay = createRelay(
    {
      dataDir: await temporary("relay-responses"),
      upstreamUrl: "http://127.0.0.1:8131/v1",
      upstreamKey: "test-key",
      model: "fixed",
      kind: "responses",
      maxOutput: 128,
      dailyOutput: 1024,
      dailyRequests: 10,
      allowLocal: true,
    },
    async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ status: "completed", output: [] }));
    },
  );
  t.after(() => relay.app.close());
  const token = issueRelayToken(relay.db, "测试");
  const headers = { authorization: "Bearer " + token.token };
  const payload = {
    model: "fixed",
    input: [{ role: "user", content: "hi" }],
    max_output_tokens: 500,
    include: ["reasoning.encrypted_content"],
    store: true,
  };
  assert.equal(
    (
      await relay.app.inject({
        method: "POST",
        url: "/v1/responses",
        headers,
        payload,
      })
    ).statusCode,
    200,
  );
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 128);
  assert.equal(
    (
      await relay.app.inject({
        method: "POST",
        url: "/v1/responses",
        headers,
        payload: { ...payload, upstream_url: "https://elsewhere.invalid" },
      })
    ).statusCode,
    400,
  );
});
test("官方中转按能力选择模型，未知能力回退默认模型且不把路由头传给上游", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  const relay = createRelay(
    {
      dataDir: await temporary("relay-routing"),
      upstreamUrl: "http://127.0.0.1:8131/v1",
      upstreamKey: "routing-secret",
      model: "default-model",
      modelRoutes: { compare_decide: "decision-model" },
      routePaths: { compare_decide: "/v1/enterprise/chat/completions" },
      kind: "chat-completions",
      maxOutput: 128,
      dailyOutput: 1024,
      dailyRequests: 10,
      allowLocal: true,
    },
    async (url, init) => {
      urls.push(String(url));
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    },
  );
  t.after(() => relay.app.close());
  const token = issueRelayToken(relay.db, "路由测试");
  const base = {
    model: "default-model",
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 32,
    stream: false,
  };
  const headers = { authorization: "Bearer " + token.token };
  assert.equal(
    (await relay.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { ...headers, "x-suinai-capability": "compare_decide" },
      payload: base,
    })).statusCode,
    200,
  );
  assert.equal(bodies[0].model, "decision-model");
  assert.equal(String(urls[0]), "http://127.0.0.1:8131/v1/enterprise/chat/completions");
  assert.equal(
    (await relay.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { ...headers, "x-suinai-capability": "unknown_capability" },
      payload: base,
    })).statusCode,
    200,
  );
  assert.equal(bodies[1].model, "default-model");
  assert.equal(String(urls[1]), "http://127.0.0.1:8131/v1/chat/completions");
});
test("生成命令只作为容器参数，禁网、非 root、只读根、资源限制和只读输入均存在", () => {
  const args = dockerRunArguments(
    "fixture",
    "python:3.12-slim",
    "D:\\workspace",
    "printf test",
  );
  for (const expected of [
    "--pull=never",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "no-new-privileges",
    "--pids-limit",
    "--memory",
    "--cpus",
    dockerUser(),
  ])
    assert.ok(args.includes(expected));
  assert.ok(args.some((s) => s.includes("dst=/workspace/inputs,readonly")));
  assert.deepEqual(args.slice(-3), ["sh", "-lc", "printf test"]);
  assert.throws(() => dockerRunArguments("a", "x", "D:\\comma,path", "x"));
});
test("Docker 子进程环境不携带模型密钥或可重定向的远端上下文", () => {
  const old = process.env.OFFICIAL_ACCESS_TOKEN;
  process.env.OFFICIAL_ACCESS_TOKEN = "must-not-pass";
  try {
    const env = dockerEnvironment();
    for (const key of [
      "OPENAI_API_KEY",
      "OFFICIAL_ACCESS_TOKEN",
      "RELAY_UPSTREAM_API_KEY",
      "DOCKER_HOST",
      "DOCKER_CONTEXT",
    ])
      assert.equal(env[key], undefined);
  } finally {
    if (old === undefined) delete process.env.OFFICIAL_ACCESS_TOKEN;
    else process.env.OFFICIAL_ACCESS_TOKEN = old;
  }
});
test("Docker 不存在时健康状态诚实，执行不会降级为宿主 shell", async () => {
  const sandbox = new DockerSandbox(
    "definitely-not-installed-qsg-docker",
    "python:3.12-slim",
  );
  assert.equal((await sandbox.health()).available, false);
  await assert.rejects(
    sandbox.execute("echo no", "D:\\unused", AbortSignal.timeout(1000)),
  );
});
test(
  "实际 Docker 隔离验收（必须显式设置 AGENT_TEST_DOCKER=1）",
  { skip: process.env.AGENT_TEST_DOCKER !== "1" },
  async (t) => {
    const f = await fixture(t);
    const sandbox = new DockerSandbox("docker", "python:3.12-slim");
    assert.equal(
      (await sandbox.health()).available,
      true,
      "需要先安装并启动 Docker Linux 引擎并准备镜像",
    );
    const root = await f.workspace.root(f.conversation.id);
    await f.workspace.import(
      f.conversation.id,
      "input.txt",
      Buffer.from("readonly").toString("base64"),
    );
    const command = [
      "python - <<'PY'",
      "import os,socket,pathlib",
      "assert os.getuid()!=0",
      "assert not os.getenv('OPENAI_API_KEY')",
      "p=pathlib.Path('/workspace/inputs/input.txt')",
      "assert p.read_text()=='readonly'",
      "for name in ['/workspace/inputs/input.txt','/etc/cannot-write']:",
      "    try:",
      "        pathlib.Path(name).write_text('forbidden')",
      "    except OSError:",
      "        pass",
      "    else:",
      "        raise AssertionError('write escaped intended output')",
      "try:",
      "    socket.create_connection(('1.1.1.1',53),timeout=.5)",
      "except OSError:",
      "    pass",
      "else:",
      "    raise AssertionError('network unexpectedly available')",
      "pathlib.Path('/workspace/outputs/result.txt').write_text('ok')",
      "print('isolated')",
      "PY",
    ].join("\n");
    const result = await sandbox.execute(
      command,
      root,
      AbortSignal.timeout(15000),
    );
    assert.equal(result.exit_code, 0, result.stderr);
    assert.match(result.stdout, /isolated/);
  },
);

test("官方凭证不能被用于内建联网、远程代码或文件库等额外付费工具", () => {
  for (const type of ["web_search", "code_interpreter", "file_search", "mcp"])
    assert.throws(() =>
      validateRelayPayload(
        { tools: [{ type }], input: [{ role: "user", content: "hi" }] },
        "responses",
      ),
    );
  assert.doesNotThrow(() =>
    validateRelayPayload(
      {
        tools: [
          {
            type: "function",
            name: "list_files",
            parameters: { type: "object", properties: {} },
          },
        ],
        input: [{ role: "user", content: "hi" }],
        include: ["reasoning.encrypted_content"],
      },
      "responses",
    ),
  );
});
test("官方凭证不接受外部文件/图片引用或额外资源 include", () => {
  for (const input of [
    [{ type: "input_file", file_id: "file_other" }],
    [
      {
        role: "user",
        content: [
          { type: "input_image", image_url: "https://elsewhere.invalid/a.png" },
        ],
      },
    ],
  ])
    assert.throws(() => validateRelayPayload({ input }, "responses"));
  assert.throws(() =>
    validateRelayPayload(
      {
        include: ["file_search_call.results"],
        input: [{ role: "user", content: "hi" }],
      },
      "responses",
    ),
  );
  assert.doesNotThrow(() => validateRelayPayload({
    input: [{ role: "user", content: [
      { type: "input_text", text: "请看图" },
      { type: "input_image", image_url: "data:image/png;base64,AA==" },
    ] }],
  }, "responses"));
  assert.throws(() => validateRelayPayload({
    input: [{ role: "assistant", content: [{ type: "input_image", image_url: "data:image/png;base64,AA==" }] }],
  }, "responses"));
});

for (const kind of ["chat-completions", "responses"] as const) {
  test(kind + "：本地每日输出预留不足不请求上游，独立于请求次数和供应商余额", async t => {
    let hits = 0;
    const relay = createRelay({
      dataDir: await temporary("relay-output-budget"), upstreamUrl: "http://127.0.0.1:8131/v1",
      upstreamKey: "fixture-secret", model: "fixed", kind,
      maxOutput: 128, dailyOutput: 128, dailyRequests: 10, allowLocal: true,
    }, async () => { hits++; return new Response(JSON.stringify({ ok: true })); });
    t.after(() => relay.app.close());
    const token = issueRelayToken(relay.db, "输出预留测试");
    const request = { method: "POST" as const, url: kind === "responses" ? "/v1/responses" : "/v1/chat/completions",
      headers: { authorization: "Bearer " + token.token },
      payload: { model: "fixed", stream: false, ...(kind === "responses" ? { input: [{ role: "user", content: "hi" }], max_output_tokens: 128 } : { messages: [{ role: "user", content: "hi" }], max_tokens: 128 }) },
    };
    assert.equal((await relay.app.inject(request)).statusCode, 200);
    const blocked = await relay.app.inject(request);
    assert.equal(blocked.statusCode, 429); assert.equal(blocked.json().error.code, "relay_daily_output_limit");
    assert.ok(!blocked.json().error.message.includes("RELAY_"));
    assert.equal(hits, 1);
    assert.deepEqual({ ...relay.db.prepare("SELECT requests,output_reserved FROM daily_usage").get() }, { requests: 1, output_reserved: 128 });
  });
}
