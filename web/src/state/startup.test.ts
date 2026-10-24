/** 青穗集 · 启动契约：一次性策略、无假进度、字体独立路径和跨播放器蒙版标记。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BootScreen } from "../components/Startup";
import { BOOT_ANIMATION_LIMIT_MS, BOOT_DURATION_MS, BOOT_FADE_MS, BOOT_SEEN_KEY, readStartupPreferences, rememberStartup, wantsStartupMotion } from "./startup";
const scene = JSON.parse(readFileSync(new URL("../../../assets/web/projects/qingsuiji-boot/scene-1/lottie.json", import.meta.url), "utf8"));
afterEach(() => vi.unstubAllGlobals());
describe("startup policy", () => {
  it("only animates an unseen entry when both preferences allow motion", () => {
    for (const seen of [true, false]) for (const motion of [true, false]) for (const reduced of [true, false]) {
      expect(wantsStartupMotion(seen, motion, reduced)).toBe(!seen && motion && !reduced);
    }
  });
  it("reads independent session and global-motion preferences", () => {
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => key === BOOT_SEEN_KEY ? "1" : null });
    vi.stubGlobal("localStorage", { getItem: () => "0" });
    expect(readStartupPreferences()).toEqual({ seen: true, motion: false });
  });
  it("never blocks entry when browser storage is unavailable", () => {
    const unavailable = () => { throw new Error("storage disabled"); };
    vi.stubGlobal("sessionStorage", { getItem: unavailable, setItem: unavailable });
    vi.stubGlobal("localStorage", { getItem: unavailable });
    expect(readStartupPreferences()).toEqual({ seen: false, motion: true });
    expect(() => rememberStartup()).not.toThrow();
  });
  it("records only the per-tab startup marker", () => {
    const setItem = vi.fn(); vi.stubGlobal("sessionStorage", { setItem }); rememberStartup();
    expect(setItem).toHaveBeenCalledExactlyOnceWith(BOOT_SEEN_KEY, "1");
  });
});
describe("the authored startup asset", () => {
  it("has a short, transparent, local-only composition matching the controller", () => {
    expect(scene.w).toBe(640); expect(scene.h).toBe(340);
    expect((scene.op - scene.ip) / scene.fr * 1000).toBe(BOOT_DURATION_MS);
    expect(scene.assets).toEqual([]); expect(scene.fonts).toBeUndefined();
    expect(scene.meta.background).toBe("transparent"); expect(scene.meta.audio).toBe(false);
    expect(BOOT_FADE_MS).toBeLessThan(250); expect(BOOT_ANIMATION_LIMIT_MS).toBeGreaterThan(BOOT_DURATION_MS);
  });
  it("preserves all three readable brand glyphs with compatible path-reveal masks", () => {
    const titles = scene.layers.filter((layer: { nm: string }) => layer.nm.startsWith("Wordmark /"));
    expect(titles.map((layer: { nm: string }) => layer.nm.split(" / ")[1]).sort()).toEqual(["青", "穗", "集"].sort());
    for (const layer of titles) {
      expect(layer.hasMask).toBe(true); expect(layer.masksProperties).toHaveLength(1);
      const states = layer.masksProperties[0].pt.k;
      expect(states.at(-1).s[0].v[1][0]).toBeGreaterThan(states[0].s[0].v[1][0]);
    }
    expect(JSON.stringify(scene)).not.toMatch(/https?:|data:image|\.woff|\.ttf/);
  });
  it("ships a same-source static fallback with a font licence", () => {
    const poster = readFileSync(new URL("../../../assets/web/projects/qingsuiji-boot/scene-1/poster.svg", import.meta.url), "utf8");
    expect(poster).toContain("青穗集 CAREER DESKTOP"); expect(poster).not.toContain("<image");
    expect(readFileSync(new URL("../../../assets/web/projects/qingsuiji-boot/scene-1/LICENSE-font.txt", import.meta.url), "utf8")).toContain("SIL OPEN FONT LICENSE");
  });
  it("offers skip and indeterminate feedback without invented numeric progress", () => {
    const html = renderToStaticMarkup(createElement(BootScreen, { animated: false, onSkip: () => {} }));
    expect(html).toContain("跳过动画"); expect(html).toContain('role="progressbar"');
    expect(html).not.toContain("aria-valuenow"); expect(html).not.toContain("%");
    expect(html).toContain('data-status="static"'); expect(html).not.toContain("云端");
  });
});
