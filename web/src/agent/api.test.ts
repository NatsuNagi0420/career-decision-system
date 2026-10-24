/** 青穗集 · 新 API 回归：空请求不标 JSON、模型密钥不保存至浏览器。 */
import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("../api/client", () => ({
  tokenStore: { get: () => "test-session", clear: vi.fn() },
}));
import { agentApi, streamEvents } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("新版 Agent HTTP 客户端", () => {
  it("无正文 POST 不发送 application/json，避免 Fastify 拒绝空 JSON", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    await agentApi.testProfile("test-id");
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer test-session",
    );
  });
  it("有正文的提交使用 JSON 和会话头", async () => {
    let captured: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        captured = init;
        return new Response("{}");
      }),
    );
    await agentApi.createConversation(null);
    expect(new Headers(captured?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(captured?.body))).toEqual({ profile_id: null });
  });
});

it("进度流登录过期应退出会话，不反复假装网络重连", async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  const fetcher = vi.fn(async () => new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  await streamEvents("c", 0, new AbortController().signal, vi.fn(), vi.fn());
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(dispatchEvent.mock.calls[0][0].type).toBe("agent:unauthorized");
});

it("拉取模型无需保存配置或预填模型，Key 只经本机 API 提交", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          base_url: "https://gateway.example/v1",
          models: [{ id: "listed-model" }],
          note: "fixture",
        }),
      );
    }),
  );
  const found = await agentApi.discoverModels({
    base_url: "https://gateway.example",
    api_key: "fixture-key",
    allow_local: false,
  });
  expect(captured?.url).toBe("/api/v1/agent/models/discover");
  expect(captured?.init.method).toBe("POST");
  expect(JSON.parse(String(captured?.init.body))).toEqual({
    base_url: "https://gateway.example",
    api_key: "fixture-key",
    allow_local: false,
  });
  expect(found.models[0].id).toBe("listed-model");
});
it("模型上游 401 作为 502 诊断展示，不清除本地登录", async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: "上游 HTTP 401：密钥无效。" }), {
          status: 502,
        }),
    ),
  );
  await expect(
    agentApi.discoverModels({
      base_url: "https://gateway.example",
      api_key: "fixture-key",
      allow_local: false,
    }),
  ).rejects.toThrow("上游 HTTP 401");
  expect(dispatchEvent).not.toHaveBeenCalled();
});
