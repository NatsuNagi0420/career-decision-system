/** 青穗集 · 陪伴状态回归：真实任务、确认门、已提交结果、重放和跨任务隔离均可独立验证。 */
import { describe, expect, it } from "vitest";
import type { ArtifactEntry, Snapshot } from "../api/client";
import { emptyState, reduceFrame, type Frame } from "../state/frames";
import { companionCue, type CompanionInput } from "./suinaiCompanion";

function frame(kind: Frame["kind"], seq: number, data: Record<string, unknown> = {}): Frame {
  return { run_id: "r", thread_id: "t", event_id: `e${seq}`, occurred_at: "2026-10-19T12:00:00Z", kind, seq, ...data };
}
function artifact(type = "ResumeDraft", overrides: Partial<ArtifactEntry> = {}): ArtifactEntry {
  return { id: "a", run_id: "r", artifact_type: type, title: "真实草稿", status: "draft", version: 1,
    data_coverage: 1, is_provisional: false, generation_mode: "deterministic", content: {}, evidence_quotes: {}, source_refs: [], supersedes_id: null, ...overrides };
}
function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return { run: { id: "r", thread_id: "t", status: "completed", goal: "整理简历", capability_id: "resume_build", risk_tier: "R0",
    entry_point: "user", model_used: null, steps_used: 1, usage: { prompt: 0, completion: 0, reasoning: 0, cached: 0 }, error: null, created_at: null, finished_at: null },
    pending_approval_id: null, artifacts: [artifact()], proposals: [], ...overrides };
}
function select(overrides: Partial<CompanionInput> = {}) {
  return companionCue({ runId: null, state: emptyState, snapshot: null, composing: false, reactToResult: true, ...overrides });
}
const running = reduceFrame(emptyState, frame("run_started", 0, { capability_id: "resume_build" }));
const completed = reduceFrame(running, frame("run_completed", 1, { status: "completed" }));

describe("real companion cues", () => {
  it("is quiet by default and listens without a task", () => {
    expect(select().action).toBe("A02");
    expect(select({ composing: true }).action).toBe("A03");
  });
  it("uses the server capability, not the visible tab or reply keywords", () => {
    expect(select({ runId: "r", state: running }).action).toBe("A31");
    const jobs = reduceFrame(emptyState, frame("run_started", 0, { capability_id: "job_match", goal: "画像完成 文件导出成功" }));
    expect(select({ runId: "r", state: jobs }).action).toBe("A14");
  });
  it("gives submitting and real processing priority over unsent input", () => {
    expect(select({ composing: true, submitting: "run" }).action).toBe("A38");
    expect(select({ runId: "r", state: running, composing: true }).action).toBe("A31");
  });
  it("waits for approval and never celebrates a pending proposal", () => {
    const state = reduceFrame(running, frame("approval_required", 1, { approval_id: "approval", proposal_id: "proposal" }));
    const result = select({ runId: "r", state, composing: true });
    expect(result.phase).toBe("confirmation"); expect(result.action).toBe("A37");
  });
  it("does not mistake a lost connection or unacknowledged submission for backend failure", () => {
    const result = select({ runId: "r", state: running, issue: { kind: "connection", message: "network" } });
    expect(result.label).toBe("连接暂时中断"); expect(result.line).toContain("不代表后台任务已经失败");
    expect(select({ issue: { kind: "request", message: "500" } }).label).toBe("提交尚未确认");
  });
  it("shows a real failure and translates its stage", () => {
    const state = reduceFrame(running, frame("run_failed", 1, { error: "finalize: 记录冲突" }));
    const result = select({ runId: "r", state });
    expect(result.action).toBe("A39"); expect(result.line).toContain("收尾写入");
  });
  it("keeps cancelled separate from failure and success", () => {
    const state = reduceFrame(running, frame("run_completed", 1, { status: "cancelled" }));
    expect(state.status).toBe("cancelled");
    expect(select({ runId: "r", state }).phase).toBe("cancelled");
    expect(select({ runId: "r", state, composing: true }).phase).toBe("listening");
  });
  it("requires a matching persisted snapshot before showing a result", () => {
    expect(select({ runId: "r", state: completed }).key).toContain("syncing");
    const old = snapshot(); old.run.id = "other";
    expect(select({ runId: "r", state: completed, snapshot: old }).phase).toBe("working");
  });
  it("will not let a lagging snapshot override a terminal event", () => {
    const old = snapshot(); old.run.status = "running";
    expect(select({ runId: "r", state: completed, snapshot: old }).label).toBe("正在同步结果");
  });
  it("does not treat a resume draft as a file upload or export", () => {
    const result = select({ runId: "r", state: completed, snapshot: snapshot() });
    expect(result.action).toBe("A33"); expect(result.line).toContain("还没有导出文件");
    expect(result.action).not.toBe("A36"); expect(result.action).not.toBe("A30");
  });
  it("does not accept a foreign or rejected artifact as evidence", () => {
    for (const change of [{ run_id: "other" }, { status: "rejected" }]) {
      expect(select({ runId: "r", state: completed, snapshot: snapshot({ artifacts: [artifact("ResumeDraft", change)] }) }).action).toBe("A02");
    }
  });
  it("keeps an unconfirmed persisted artifact cautious even if the run has ended", () => {
    const result = select({ runId: "r", state: completed, snapshot: snapshot({ artifacts: [artifact("ResumeDraft", { status: "pending_approval" })] }) });
    expect(result.action).toBe("A12"); expect(result.label).toBe("本轮结果尚未确认");
  });
  it("uses an uncertainty cue instead of success when evidence is provisional", () => {
    const result = select({ runId: "r", state: completed, snapshot: snapshot({ artifacts: [artifact("ResumeDraft", { is_provisional: true })] }) });
    expect(result.action).toBe("A12"); expect(result.label).toContain("补充依据");
  });
  it("maps the four existing result types without claiming a milestone or export", () => {
    for (const [type, action] of [["ProfileGapReport", "A11"], ["JobMatchReport", "A15"], ["LearningPathDraft", "A26"], ["ResumeDraft", "A33"]]) {
      expect(select({ runId: "r", state: completed, snapshot: snapshot({ artifacts: [artifact(type)] }) }).action).toBe(action);
    }
  });
  it("only reports a write after the server confirms it was applied with a result", () => {
    const snap = snapshot(); snap.run.capability_id = "profile_diagnose";
    snap.proposals = [{ id: "p", proposal_type: "ProfileFactBatch", title: "保存画像", rationale: "", status: "applied", payload: {}, acceptance_criteria: [], source_refs: [], result: { count: 1 }, error: null }];
    const profile = { ...completed, capabilityId: "profile_diagnose" };
    expect(select({ runId: "r", state: profile, snapshot: snap }).label).toBe("本次画像信息已保存");
    snap.proposals[0].result = null;
    expect(select({ runId: "r", state: profile, snapshot: snap }).label).not.toContain("已保存");
  });
  it("never re-celebrates a completed historical run", () => {
    expect(select({ runId: "r", state: completed, snapshot: snapshot(), reactToResult: false }).action).toBe("A02");
  });
  it("keeps the same cue key on token/progress changes and repeated snapshot refreshes", () => {
    const cue = select({ runId: "r", state: completed, snapshot: snapshot() });
    const next = select({ runId: "r", state: { ...completed, lastSeq: 100 }, snapshot: snapshot() });
    expect(next.key).toBe(cue.key);
  });
  it("returns to listening when the person writes their next question", () => {
    expect(select({ runId: "r", state: completed, snapshot: snapshot(), composing: true }).action).toBe("A03");
  });
  it("ignores the prior run's events and capability when switching conversations", () => {
    const result = select({ runId: "new-run", state: completed, snapshot: snapshot() });
    expect(result.action).toBe("A38"); expect(result.label).toBe("正在读取任务进度");
    expect(reduceFrame(running, frame("run_failed", 3, { run_id: "old-run", error: "old failure" }))).toBe(running);
  });
});
