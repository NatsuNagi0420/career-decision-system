/** 青穗集 · ASCII 界面回归：固定字符网格、可访问静止画面、偏好存储及真实任务状态，不调用模型或宿主命令。 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsciiArt, UiMotionToggle } from "./AsciiArt";
import { ASCII_PIECES } from "./asciiPieces";
import { RunActivity } from "./RunActivity";
import { executionRecords } from "./execution";
import { readUiMotionPreference, setUiMotionPreference, UI_MOTION_KEY } from "./uiMotion";
import type { AgentRun } from "./types";

const runStartedAt = new Date(Date.now() - 1_000).toISOString();
const run: AgentRun = { id: "ascii-test", status: "running", steps: 1, input_tokens: 0, output_tokens: 0, error: null, created_at: runStartedAt, updated_at: runStartedAt };
const noop = () => {};
afterEach(() => { vi.unstubAllGlobals(); setUiMotionPreference(true); });

describe("精选字符动画", () => {
  it("每一帧尺寸固定，不因动画变化产生布局跳动", () => {
    for (const piece of Object.values(ASCII_PIECES)) {
      const frame = piece.default();
      const dimensions = frame(0).split("\n").map(line => line.length);
      expect(dimensions).toHaveLength(piece.meta.rows);
      expect(dimensions.every(width => width === piece.meta.cols)).toBe(true);
      for (const t of [0.125, 0.5, 1, 4, 15.5]) expect(frame(t).split("\n").map(line => line.length)).toEqual(dimensions);
    }
  });
  it("猫和等待指示器随时间有变化，而不是静态截图", () => {
    for (const piece of Object.values(ASCII_PIECES)) {
      const frame = piece.default();
      expect(new Set([0, .25, .5, 1, 2].map(t => frame(t))).size).toBeGreaterThan(1);
    }
  });
  it("服务端可输出完整静止图案，装饰不反复进入读屏播报", () => {
    const html = renderToStaticMarkup(<AsciiArt variant="cat" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-motion="still"');
    expect(html).toContain('data-ascii="cat"');
    expect(html).not.toContain("aria-live");
    expect(html).not.toMatch(/<canvas|<script|<iframe/);
    expect(html).toContain("-------");
  });
  it("关闭动效保留文字状态和图案；开关语义不冒充角色控制", () => {
    const html = renderToStaticMarkup(<UiMotionToggle />);
    expect(html).toContain('aria-label="界面动效"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("减少动态效果");
    expect(html).toContain("disabled");
  });
  it("随产品保留原 MIT 声明，不引用远程脚本", () => {
    const license = readFileSync(new URL("../../../assets/web/brand/licenses/ascii-rest-MIT.txt", import.meta.url), "utf8");
    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 bas3line");
    const source = readFileSync(new URL("./AsciiArt.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).toContain('fps: playing ? 8 : 0');
  });
});

describe("动效偏好", () => {
  it("默认开启，用户关闭后持久保存，与角色开关相互独立", () => {
    const store = new Map<string, string>([["career.motion", "1"]]);
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener("career:ui-motion", listener);
    vi.stubGlobal("window", target);
    vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
    expect(readUiMotionPreference()).toBe(true);
    setUiMotionPreference(false);
    expect(store.get(UI_MOTION_KEY)).toBe("0");
    expect(readUiMotionPreference()).toBe(false);
    expect(store.get("career.motion")).toBe("1");
    setUiMotionPreference(true);
    expect(readUiMotionPreference()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("浏览器存储不可用时仍可切换，不崩溃也不丢失本次选择", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    setUiMotionPreference(false);
    expect(readUiMotionPreference()).toBe(false);
    setUiMotionPreference(true);
    expect(readUiMotionPreference()).toBe(true);
  });
});

describe("真实状态而非模拟执行", () => {
  it("等待模型使用穗奈轻动效，不伪造工具、进度数字或内部思维", () => {
    const html = renderToStaticMarkup(<RunActivity run={run} records={[]} onOpen={noop} />);
    expect(html).toContain('data-phase="waiting"');
    expect(html).toContain("正在构思");
    expect(html).not.toContain("等待模型返回");
    expect(html).not.toMatch(/\d+%|正在执行命令|思考过程/);
  });
  it("真实开始事件才切换工作态，原命令仍可检查", () => {
    const call = { id: "test-call", name: "run_command", arguments: JSON.stringify({ command: "Get-Content inputs/test.txt" }) };
    const records = executionRecords([], [{ seq: 1, run_id: run.id, kind: "tool.started", data: { call }, created_at: run.created_at }], [run]);
    const html = renderToStaticMarkup(<RunActivity run={run} records={records} onOpen={noop} />);
    expect(html).toContain('data-phase="working"');
    expect(html).toContain("Get-Content inputs/test.txt");
    expect(html).not.toContain('data-phase="waiting"');
  });
  it("等待用户确认时不持续播放加载器，完成或停止后不保留加载状态", () => {
    for (const status of ["awaiting_approval", "completed", "cancelled", "failed"] as const) {
      const html = renderToStaticMarkup(<RunActivity run={{ ...run, status }} records={[]} onOpen={noop} />);
      expect(html).not.toContain("run-presence");
      if (status === "awaiting_approval") expect(html).toContain("等待你的确认");
    }
  });
});



