import { describe, expect, it } from "vitest";
import { emptyState, expiryNote, groupTrace, reduceFrame, type Frame, type ShellState } from "./frames";

/** How the server actually writes a deadline: `utcnow()` strips the offset. */
function naiveUtc(fromNowMs: number): string {
  return new Date(Date.now() + fromNowMs).toISOString().slice(0, 19);
}

function frame(kind: Frame["kind"], seq: number, extra: Record<string, unknown> = {}): Frame {
  return {
    run_id: "run-1",
    thread_id: "thread-1",
    seq,
    event_id: `evt-${kind}-${seq}`,
    kind,
    occurred_at: "2026-09-19T12:00:00",
    ...extra,
  };
}

const applyAll = (frames: Frame[]): ShellState => frames.reduce(reduceFrame, emptyState);

describe("reduceFrame", () => {
  it("replays committed history without duplicating entries", () => {
    const frames = [
      frame("run_started", 0, { goal: "在数据分析和后端之间选" }),
      frame("tool_call", 1, { name: "get_job_samples", source_refs: [{ table: "jobs", id: 1 }] }),
    ];
    const once = applyAll(frames);
    // A reconnect resumes from the last applied seq, so the tail arrives again.
    const afterReplay = [frames[0], frames[1], frames[1]].reduce(reduceFrame, once);
    expect(afterReplay.items).toHaveLength(2);
    expect(afterReplay.lastSeq).toBe(1);
  });

  it("ignores a frame that is older than the cursor", () => {
    const state = applyAll([frame("run_started", 5), frame("usage_recorded", 6, { model: "deepseek-flash", thinking: "on", prompt: 1, completion: 1, reasoning: 0, cached: 0 })]);
    const items = state.items.length;
    expect(reduceFrame(state, frame("run_started", 2)).items).toHaveLength(items);
  });

  it("keeps a provisional artifact visible as provisional", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("artifact_created", 1, {
        artifact_id: "a1",
        artifact_type: "ComparisonMatrix",
        title: "比较结果",
        version: 0,
        data_coverage: 25,
        is_provisional: true,
        generation_mode: "llm",
      }),
    ]);
    expect(state.artifacts[0].isProvisional).toBe(true);
    expect(state.items.at(-1)?.tone).toBe("warn");
    expect(state.items.at(-1)?.detail).toContain("依据不足");
  });

  it("moves into awaiting_approval only because of a durable approval frame", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("proposal_created", 1, { proposal_id: "p1", proposal_type: "add_candidate", title: "加入候选", risk_tier: "R2", acceptance_criteria: ["补一条 JD 证据"] }),
      frame("approval_required", 2, { approval_id: "ap1", proposal_id: "p1", expires_at: "2026-09-20T12:00:00" }),
    ]);
    expect(state.status).toBe("awaiting_approval");
    expect(state.proposals[0].approvalId).toBe("ap1");
    expect(state.proposals[0].state).toBe("awaiting");
  });

  it("records what happened to the decision", () => {
    const base = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("proposal_created", 1, { proposal_id: "p1", proposal_type: "add_candidate", title: "t", risk_tier: "R2" }),
      frame("approval_required", 2, { approval_id: "ap1", proposal_id: "p1", expires_at: "x" }),
    ]);
    expect(reduceFrame(base, frame("approval_resolved", 3, { approval_id: "ap1", status: "approved" })).proposals[0].state).toBe("approved");
    expect(reduceFrame(base, frame("approval_resolved", 3, { approval_id: "ap1", status: "error" })).proposals[0].state).toBe("error");
  });

  it("tells the person the confirmation has a fuse, and counts it in UTC", () => {
    // Naive-UTC from the server must not be read as local time: in UTC+8 that would
    // turn a card with 3 hours left into one that already expired.
    const note = expiryNote(naiveUtc(3 * 3_600_000));
    expect(note).toContain("有效期到");
    expect(note).toMatch(/还剩 \d+ 小时/);
    expect(expiryNote(naiveUtc(-60_000))).toContain("已经过期");
    expect(expiryNote("2099-01-01T00:00:00+08:00")).toContain("有效期到");
    // A frame without a usable deadline says nothing rather than inventing one.
    expect(expiryNote("")).toBe("");
    expect(expiryNote("x")).toBe("");
  });

  it("states that deadline on the card that asks for the decision", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("proposal_created", 1, { proposal_id: "p1", proposal_type: "add_candidate", title: "t", risk_tier: "R2" }),
      frame("approval_required", 2, { approval_id: "ap1", proposal_id: "p1", expires_at: naiveUtc(3 * 3_600_000) }),
    ]);
    expect(state.items.at(-1)?.detail).toContain("有效期到");
  });

  it("survives a failed apply instead of hiding it", () => {
    const state = applyAll([frame("run_started", 0, { goal: "g" }), frame("run_failed", 1, { error: "schema validation failed" })]);
    expect(state.status).toBe("failed");
    expect(state.errors).toEqual(["schema validation failed"]);
    expect(state.items.at(-1)?.tone).toBe("bad");
  });

  it("flags truncated tool output so the reader knows the model saw a摘要", () => {
    const state = applyAll([frame("run_started", 0, { goal: "g" }), frame("tool_call", 1, { name: "get_job_samples", truncated: true, source_refs: [] })]);
    expect(state.items.at(-1)?.tone).toBe("warn");
    expect(state.items.at(-1)?.detail).toContain("裁剪");
  });

  it("makes a withheld write as visible as a proposal", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("artifact_created", 1, {
        artifact_id: "a1",
        artifact_type: "CandidateList",
        title: "候选清单",
        version: 0,
        data_coverage: 0,
        is_provisional: true,
        generation_mode: "llm",
      }),
      frame("write_withheld", 2, {
        artifact_id: "a1",
        capability_id: "candidate_source",
        wanted_proposal: "add_candidate",
        reason: "覆盖度 0%，缺少逐字引文",
      }),
    ]);
    expect(state.proposals).toHaveLength(0);
    expect(state.items.at(-1)?.title).toContain("不提供写入");
    expect(state.items.at(-1)?.tone).toBe("warn");
    expect(state.status).not.toBe("awaiting_approval");
  });

  it("tracks reasoning tokens separately from output tokens", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("usage_recorded", 1, { model: "deepseek-flash", thinking: "on", prompt: 1200, completion: 300, reasoning: 285, cached: 900, step_id: "s1" }),
    ]);
    expect(state.usage).toMatchObject({ reasoning: 285, cached: 900, thinking: "on" });
    expect(state.items.at(-1)?.detail).toContain("思考 285");
  });

  it("keeps a promise as its own object, not just another line", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("obligation_created", 1, {
        obligation_id: "ob1",
        capability_id: "direction_explore",
        intent: "去取两个方向的岗位原句",
        trigger_kind: "on_return",
        not_before: null,
      }),
    ]);
    expect(state.promise).toMatchObject({ id: "ob1", capabilityId: "direction_explore", triggerKind: "on_return" });
    expect(state.items.at(-1)?.title).toContain("答应了下一步");
    expect(state.items.at(-1)?.phase).toBe("result");
  });

  it("files node names and token counts under trace, not under the answer", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("step_started", 1, { step_id: "s1", name: "select_action", step_kind: "plan" }),
      frame("usage_recorded", 2, { model: "m", thinking: "off", prompt: 1, completion: 1, reasoning: 0, cached: 0, step_id: "s1" }),
      frame("step_completed", 3, { step_id: "s1", summary: "1 tool call(s)" }),
      frame("step_started", 4, { step_id: "s2", name: "tool_batch", step_kind: "tool" }),
      frame("tool_call", 5, { step_id: "s2", name: "get_job_samples", source_refs: [{ table: "jobs", id: 1 }] }),
      frame("step_completed", 6, { step_id: "s2", summary: "1 call(s) executed" }),
      frame("artifact_created", 7, { artifact_id: "a1", artifact_type: "DirectionBrief", title: "方向", version: 0, data_coverage: 100, is_provisional: false, generation_mode: "llm" }),
    ]);

    const blocks = groupTrace(state.items);
    // `run_started` and the artifact are what the reader acts on; the two steps fold
    // in between them, in the order they happened.
    expect(blocks.map((block) => block.type)).toEqual(["item", "group", "group", "item"]);
    const groups = blocks.flatMap((block) => (block.type === "group" ? [block.group] : []));
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ label: "决定下一步", done: true, failed: false });
    expect(groups[1].items[0].title).toBe("查了「真实岗位样本」（1 条来源）");
    expect(blocks.at(-1)).toMatchObject({ item: { title: "产出成果物 · 方向" } });
  });

  it("times a step between its own open and close frames", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("step_started", 1, { step_id: "s1", name: "select_action", occurred_at: "2026-09-19T12:00:00" }),
      frame("usage_recorded", 2, {
        model: "m",
        thinking: "off",
        prompt: 1,
        completion: 1,
        reasoning: 0,
        cached: 0,
        step_id: "s1",
        occurred_at: "2026-09-19T12:00:02",
      }),
      frame("step_completed", 3, { step_id: "s1", summary: "ok", occurred_at: "2026-09-19T12:00:02.700" }),
    ]);
    const [group] = groupTrace(state.items).flatMap((block) => (block.type === "group" ? [block.group] : []));
    // The usage line sits inside the step, so measuring the items alone collapses to
    // ~0. The rail reads the step's own boundaries instead.
    expect(group.startedAt).toBe("2026-09-19T12:00:00");
    expect(group.endedAt).toBe("2026-09-19T12:00:02.700");
  });

  it("surfaces a failed step inside its group instead of hiding it", () => {
    const state = applyAll([
      frame("run_started", 0, { goal: "g" }),
      frame("step_started", 1, { step_id: "s1", name: "draft_digest" }),
      frame("step_completed", 2, { step_id: "s1", summary: "error: truncated empty content" }),
    ]);
    const [group] = groupTrace(state.items).flatMap((block) => (block.type === "group" ? [block.group] : []));
    expect(group).toMatchObject({ failed: true, done: true });
    expect(group.items.at(-1)?.title).toBe("这一步失败了");
  });
});
