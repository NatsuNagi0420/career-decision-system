/** 青穗集 · 客户端回归：会话失效、任务流中断与恢复必须向真实状态收敛，不静默伪装完成。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, onUnauthorized, readRunStream, tokenStore } from "./client";

const store = new Map<string, string>();
const session = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as unknown as Storage;

function reply(status: number, body: unknown = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));
}

beforeEach(() => {
  store.clear(); session.clear();
  vi.stubGlobal("localStorage", fakeStorage);
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => void session.set(key, value), removeItem: (key: string) => void session.delete(key) });
});

afterEach(() => {
  onUnauthorized(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a dead token", () => {
  it("ends the session instead of leaving the shell on an empty page", async () => {
    tokenStore.set("expired-token");
    const signedOut = vi.fn();
    onUnauthorized(signedOut);
    reply(401, { detail: "请先登录。" });

    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(signedOut).toHaveBeenCalledTimes(1);
    expect(tokenStore.get()).toBeNull();
  });

  it("does not sign anyone out over a wrong password", async () => {
    tokenStore.set("someone-elses-token");
    const signedOut = vi.fn();
    onUnauthorized(signedOut);
    reply(401, { detail: "用户名或密码不对。" });

    await expect(api.login("someone", "wrong-password")).rejects.toMatchObject({ status: 401 });
    expect(signedOut).not.toHaveBeenCalled();
    expect(tokenStore.get()).toBe("someone-elses-token");
  });
});

async function collect(maxReconnects = 0, signal?: AbortSignal) {
  const frames = [];
  for await (const frame of readRunStream("r", { maxReconnects, signal })) frames.push(frame);
  return frames;
}
describe("progress transport", () => {
  it("surfaces an exhausted connection without inventing run failure or success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network offline")));
    await expect(collect()).rejects.toThrow("任务进度连接已中断");
  });
  it("also reports an early EOF with no terminal frame", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("")));
    await expect(collect()).rejects.toThrow("重新打开当前对话核对");
  });
  it("does not report a connection issue for a terminal result or cancellation", async () => {
    for (const status of ["completed", "cancelled"]) {
      const terminal = { kind: "run_completed", run_id: "r", seq: 2, status };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify(terminal)}\n\n`)));
      expect(await collect()).toEqual([terminal]);
    }
  });
  it("resumes after the last durable sequence instead of replaying an animation", async () => {
    vi.useFakeTimers();
    const started = { kind: "run_started", run_id: "r", seq: 4 };
    const done = { kind: "run_completed", run_id: "r", seq: 5, status: "completed" };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(`data: ${JSON.stringify(started)}\n\n`))
      .mockResolvedValueOnce(new Response(`data: ${JSON.stringify(done)}\n\n`));
    vi.stubGlobal("fetch", fetcher);
    const result = collect(1); await vi.runAllTimersAsync();
    expect(await result).toEqual([started, done]);
    expect(fetcher.mock.calls[1][0]).toContain("after_seq=4");
  });
  it("silently ends an intentionally aborted stream", async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    expect(await collect(0, controller.signal)).toEqual([]);
  });
});


describe("login credential lifetime", () => {
  it("keeps an unchecked remember-me session out of persistent storage", () => {
    tokenStore.set("old-persistent");
    tokenStore.set("temporary-token", false);
    expect(localStorage.getItem("career.session.token")).toBeNull();
    expect(sessionStorage.getItem("career.session.token")).toBe("temporary-token");
    expect(tokenStore.get()).toBe("temporary-token");
  });
  it("can switch back to a persistent session and clears both on logout", () => {
    tokenStore.set("temporary-token", false);
    tokenStore.set("remembered-token", true);
    expect(sessionStorage.getItem("career.session.token")).toBeNull();
    expect(localStorage.getItem("career.session.token")).toBe("remembered-token");
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
    expect(session.size).toBe(0);
    expect(store.size).toBe(0);
  });
});
