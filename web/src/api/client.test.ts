import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, onUnauthorized, tokenStore } from "./client";

const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as unknown as Storage;

function reply(status: number, body: unknown = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", fakeStorage);
});

afterEach(() => {
  onUnauthorized(null);
  vi.unstubAllGlobals();
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
