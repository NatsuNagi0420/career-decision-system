/** 青穗集 · 正式桌面验收：使用同一任务状态选择新角色，不保留旧像素切换或未验证的成功提示。 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesktopScene } from "./DesktopScene";
import { companionCue, type CompanionInput } from "../character/suinaiCompanion";
import { emptyState } from "../state/frames";

function render(overrides: Partial<CompanionInput> = {}) {
  const cue = companionCue({ runId: null, state: emptyState, snapshot: null, composing: false, ...overrides });
  return renderToStaticMarkup(createElement(DesktopScene, {
    active: "messages", artifacts: [], companion: cue, motion: true, expanded: false, user: { id: 1, username: "演示用户", external_ai_consent: false }, feed: null, historyOpen: false,
    onConsent: async () => {}, onMotion: () => {}, onSignOut: () => {},
    projectId: null, onSelect: () => {}, onPrepare: () => {}, onHistory: () => {}, onFiled: () => {},
  }));
}
describe("desktop companion integration", () => {
  it("uses the new shared renderer and defaults to quiet company", () => {
    const html = render();
    expect(html).toContain('data-requested-action="A02"');
    expect(html).toContain('class="suinai-motion-character"');
    expect(html).not.toContain('class="suinai-portrait');
    expect(html).not.toContain('aria-label="穗奈显示方式"');
    expect(html).toContain('aria-label="穗奈：随时可以开始"');
  });
  it("listens to unsent drafts without claiming to process or save", () => {
    const html = render({ composing: true });
    expect(html).toContain('data-requested-action="A03"');
    expect(html).toContain("等你写完");
    expect(html).toContain("没发送前我不会整理或保存");
  });
  it("real processing and approval take priority over a draft", () => {
    const state = { ...emptyState, runId: "r", capabilityId: "resume_build", status: "running" as const };
    expect(render({ runId: "r", state, composing: true })).toContain('data-requested-action="A31"');
    const html = render({ runId: "r", state: { ...state, status: "awaiting_approval" }, composing: true });
    expect(html).toContain('data-requested-action="A37"');
    expect(html).toContain("等你确认");
    expect(html).not.toContain("文件导出成功");
  });
  it("shows real failures but never treats a refusal as failure", () => {
    const state = { ...emptyState, runId: "r", status: "failed" as const, errors: ["finalize: 写入失败"] };
    expect(render({ runId: "r", state })).toContain('data-requested-action="A39"');
    expect(render({ runId: "r", state: { ...state, status: "cancelled" } })).toContain("已按你的决定停止");
  });
  it("provides a labelled small-screen launcher and a stoppable animation", () => {
    const html = render();
    expect(html).toContain('aria-controls="suinai-companion"');
    expect(html).toContain('aria-label="打开穗奈陪伴窗口：随时可以开始"');
    expect(html).toContain('aria-label="系统已减少动态"');
    expect(html).toContain('aria-live="polite"');
  });
});
