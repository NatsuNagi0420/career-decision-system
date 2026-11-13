/** 青穗集 · 会话缓存回归：预读复用、事件竞争、删除取消与有限驻留。 */
import { describe, expect, it, vi } from "vitest";
import { ConversationCache } from "./conversationCache";
import { initialView } from "./state";
import type { Snapshot } from "./types";

function snapshot(id: string, seq = 0): Snapshot {
  return { conversation: { id, title: id, profile_id: null, created_at: "", updated_at: "" }, messages: [], runs: [], artifacts: [], approvals: [], last_seq: seq };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("会话切换缓存", () => {
  it("悬浮预读与点击复用请求，过期或重新连接时才重新读取", async () => {
    let time = 0;
    const response = deferred<Snapshot>(), fetch = vi.fn(() => response.promise);
    const cache = new ConversationCache(fetch, 8, 100, () => time);
    const prefetched = cache.load("a");
    expect(cache.load("a")).toBe(prefetched);
    response.resolve(snapshot("a"));
    await prefetched;
    await cache.load("a");
    expect(fetch).toHaveBeenCalledTimes(1);
    time = 101;
    await cache.load("a");
    await cache.load("a", true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("旧快照晚到时保留较新的事件与会话名称", async () => {
    const response = deferred<Snapshot>();
    const cache = new ConversationCache(() => response.promise);
    const pending = cache.load("a");
    const latest = initialView(snapshot("a", 12));
    latest.drafts.reply = "正在生成";
    cache.remember(latest);
    response.resolve(snapshot("a", 10));
    expect(await pending).toBe(latest);
    cache.updateConversation({ ...latest.snapshot.conversation, title: "改过的名称", updated_at: "2026-11-12" });
    cache.remember(initialView(snapshot("a", 12)));
    expect(cache.get("a")?.snapshot.conversation.title).toBe("改过的名称");
  });

  it("删除和退出会取消预读，迟到结果不能复活历史", async () => {
    for (const operation of ["remove", "clear"] as const) {
      const response = deferred<Snapshot>();
      let signal!: AbortSignal;
      const cache = new ConversationCache((_id, value) => { signal = value; return response.promise; });
      const pending = cache.load("a");
      await Promise.resolve();
      const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      if (operation === "remove") cache.remove("a"); else cache.clear();
      expect(signal.aborted).toBe(true);
      response.resolve(snapshot("a"));
      await rejected;
      expect(cache.get("a")).toBeNull();
    }
  });

  it("快速切换的请求各自归属正确会话，只保留最近使用的历史及其滚动位置", async () => {
    const a = deferred<Snapshot>(), b = deferred<Snapshot>();
    const cache = new ConversationCache(id => id === "a" ? a.promise : b.promise, 2);
    const readA = cache.load("a"), readB = cache.load("b");
    b.resolve(snapshot("b")); await readB;
    a.resolve(snapshot("a")); await readA;
    cache.saveScroll("b", { top: 240, atBottom: false });
    cache.get("b");
    cache.remember(initialView(snapshot("c")));
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")?.snapshot.conversation.id).toBe("b");
    expect(cache.scroll("b")).toEqual({ top: 240, atBottom: false });
    cache.remove("b");
    expect(cache.scroll("b")).toBeUndefined();
  });
});
