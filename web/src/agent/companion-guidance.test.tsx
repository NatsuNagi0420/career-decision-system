/** 青穗集 · 陪伴任务前端回归：轻入口、真实气泡、模型小结标识与不打扰的闲置规则。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuidedTaskBar } from "./GuidedTaskBar";
import { SuinaiBubble } from "./SuinaiBubble";
import { ConversationMemory } from "./ConversationMemory";
import { canNudge, idleMessage, IDLE_AFTER_MS, IDLE_COOLDOWN_MS, acceptGuidance } from "./companion-state";
import { emptyGuidance, type GuidanceView } from "../../../agent/src/guidance-contract";
import { initialView, applyEvent } from "./state";
import type { Snapshot } from "./types";
const noop = () => {};
const base = (): GuidanceView => ({ ...emptyGuidance(), progress: null, shared_resume: false });
describe("同一段对话的任务与建议", () => {
  it("任务条提供自由对话和三个明确入口，不是新建对话或表单", () => {
    const html = renderToStaticMarkup(<GuidedTaskBar guidance={base()} disabled={false} onChange={noop} />);
    for (const text of ["自由聊聊", "找职业方向", "定学习计划", "写／改简历"]) expect(html).toContain(text);
    expect(html).toContain('aria-pressed="true"'); expect(html).not.toContain('<form'); expect(html).not.toContain('新建');
  });
  it("建议气泡使用统一后端素材、明确是猜测、提供接受与关闭", () => {
    const html = renderToStaticMarkup(<SuinaiBubble message="是不是想改这份简历？" kind="intent" actionLabel="写／改简历" disabled={false} onAccept={noop} onDismiss={noop} />);
    expect(html).toContain('/api/assets/brand/career-pixel/suinai-speech-bubble.webp'); expect(html).toContain('穗奈的小猜测'); expect(html).toContain('先不用'); expect(html).toContain('收起穗奈气泡'); expect(html).not.toContain('Live2D角色文字');
  });
  it("窄屏提供紧凑气泡，既有角色不必常驻覆盖对话", () => {
    const html = renderToStaticMarkup(<SuinaiBubble message="要不要继续？" kind="idle" actionLabel="继续聊聊" disabled={false} compact onAccept={noop} onDismiss={noop} />);
    expect(html).toContain('suinai-bubble--compact'); expect(html).not.toContain('suinai-bubble__frame');
  });
  it("会话小结区分模型整理和正式档案，并标明共享草稿", () => {
    const guidance: GuidanceView = { ...base(), memory: { summary: "用户正在比较两个方向，岗位要求仍待补充。", next_step: "可以先提供一份岗位要求。", source: "model", through_message_id: "message", updated_at: "2026-10-23T08:30:00.000Z" }, shared_resume: true };
    const html = renderToStaticMarkup(<ConversationMemory guidance={guidance} analyzing={false} error="" enabled canRefresh onRefresh={noop} />);
    expect(html).toContain('聊到了这里'); expect(html).toContain('不是已确认的职业档案'); expect(html).toContain('不读取输入框草稿'); expect(html).toContain('账号共享简历草稿'); expect(html).not.toContain('执行环境与边界');
  });
  it("HTTP和SSE交错时，较旧的小结不能覆盖新的任务状态", () => {
    const latest = { ...base(), revision: 3 }, old = { ...base(), revision: 2 };
    expect(acceptGuidance(latest, old)).toBe(latest);
    const snapshot = { guidance: latest, last_seq: 1, messages: [], runs: [], approvals: [], artifacts: [], conversation: { id: "conversation" } } as unknown as Snapshot;
    const next = applyEvent(initialView(snapshot), { seq: 2, kind: "guidance.updated", data: { guidance: old }, run_id: null, created_at: "" });
    expect(next.snapshot.guidance?.revision).toBe(3);
  });
});
describe("闲置提醒不打扰", () => {
  const ready = { visible: true, enabled: true, blocked: false, hasDraft: false, now: 2_000_000, lastActivity: 2_000_000 - IDLE_AFTER_MS, lastNudge: 2_000_000 - IDLE_COOLDOWN_MS, shown: 0 };
  it("满足两分钟闲置与十分钟冷却才提醒", () => { expect(canNudge(ready)).toBe(true); expect(canNudge({ ...ready, lastActivity: ready.now - IDLE_AFTER_MS + 1 })).toBe(false); expect(canNudge({ ...ready, lastNudge: ready.now - IDLE_COOLDOWN_MS + 1 })).toBe(false); });
  it("隐藏页、写字、执行、关闭开关或达到次数上限均不提醒", () => {
    for (const change of [{ visible: false }, { hasDraft: true }, { blocked: true }, { enabled: false }, { shown: 2 }]) expect(canNudge({ ...ready, ...change })).toBe(false);
  });
  it("提醒使用本地语句，不假装已执行或制造离开压力", () => {
    expect(idleMessage(undefined)).toContain('休息一下也很好');
    expect(idleMessage({ ...base(), progress: { stage: "核对", next_step: "核对", needs_confirmation: true } })).toContain('不急着确认');
  });
});
