/** 青穗集 · Agent 界面状态回归：断线重放去重、正文替换与取消后的残片清理。 */
import { describe, it, expect } from "vitest";
import { initialView, applyEvent } from "./state";
import type { Snapshot, AgentEvent, AgentRun } from "./types";
const empty = (): Snapshot => ({
  conversation: {
    id: "c",
    title: "新对话",
    profile_id: null,
    created_at: "",
    updated_at: "",
  },
  messages: [],
  runs: [],
  artifacts: [],
  approvals: [],
  last_seq: 0,
});
const running = (): Snapshot => ({ ...empty(), runs: [{ id: "r", status: "running" } as AgentRun] });
const event = (
  seq: number,
  kind: string,
  data: Record<string, unknown>,
): AgentEvent => ({ seq, kind, data, run_id: "r", created_at: "" });
describe("新版 Agent 事件归并", () => {
  it("相同序号重放不会重复追加正文", () => {
    let state = initialView(running());
    const delta = event(1, "answer.delta", { message_id: "m", text: "你好" });
    state = applyEvent(state, delta);
    expect(applyEvent(state, delta)).toBe(state);
    expect(state.drafts.m).toBe("你好");
  });
  it("完整消息代替草稿，刷新快照恢复计划与残片", () => {
    let state = initialView({
      ...running(),
      drafts: { m: "一半" },
      events: [event(1, "plan.updated", { plan: { steps: [] } })],
    });
    expect(state.drafts.m).toBe("一半");
    expect(state.events).toHaveLength(1);
    state = applyEvent(
      state,
      event(2, "message.added", {
        message: {
          id: "m",
          role: "assistant",
          content: "完整消息",
          created_at: "",
          run_id: "r",
        },
      }),
    );
    expect(state.drafts.m).toBeUndefined();
    expect(state.snapshot.messages[0].content).toBe("完整消息");
  });
  it("失败或停止清理残片，文件重放只保留同一登记条目一次", () => {
    let state = initialView({ ...running(), drafts: { m: "残片" } });
    state = applyEvent(
      state,
      event(1, "run.status", {
        run: { id: "r", status: "cancelled" } as AgentRun,
      }),
    );
    expect(state.drafts).toEqual({});
    const file = { id: "f", path: "outputs/a.txt", version: 1 };
    state = applyEvent(state, event(2, "artifact.created", { artifact: file }));
    state = applyEvent(state, event(3, "artifact.created", { artifact: file }));
    expect(state.snapshot.artifacts).toHaveLength(1);
  });
});

it("回退事件同时切换消息、运行和执行记录，文件不随对话分支消失", () => {
  const first = { id: "first", role: "user", run_id: "keep", content: "保留", created_at: "" } as const;
  const removed = { id: "old", role: "user", run_id: "remove", content: "替换", created_at: "" } as const;
  const state = initialView({ ...empty(), messages: [first, removed], runs: [{ id: "keep", status: "completed" } as AgentRun, { id: "remove", status: "completed" } as AgentRun], drafts: { late: "迟到残片" }, events: [event(1, "tool.started", { call: {} })] });
  state.events[0].run_id = "remove";
  const next = applyEvent(state, event(2, "conversation.rewound", { message_ids: ["old"], run_ids: ["remove"], guidance: { revision: 2 } }));
  expect(next.snapshot.messages.map(message => message.id)).toEqual(["first"]);
  expect(next.snapshot.runs.map(run => run.id)).toEqual(["keep"]);
  expect(next.events.some(item => item.kind === "tool.started")).toBe(false);
  expect(next.drafts).toEqual({}); expect(next.snapshot.artifacts).toBe(state.snapshot.artifacts);
  expect(applyEvent(next, event(1, "answer.delta", { message_id: "late", text: "旧消息" }))).toBe(next);
});


it("回复完成或等待用户输入后清理孤立草稿，旧快照也不能显示永久正在回复", () => {
  for (const status of ["completed", "failed", "cancelled", "interrupted", "waiting_input"] as const) {
    const state = initialView({ ...running(), drafts: { orphan: "上一轮残片" } });
    const next = applyEvent(state, event(1, "run.status", { run: { id: "r", status } as AgentRun }));
    expect(next.drafts).toEqual({});
    expect(initialView({ ...empty(), runs: [{ id: "r", status } as AgentRun], drafts: { orphan: "残片" } }).drafts).toEqual({});
  }
});

it("已落库消息不会从快照或迟到分片重新生成为第二条草稿", () => {
  const message = { id: "m", role: "assistant", run_id: "r", content: "完整回复", created_at: "" } as const;
  const state = initialView({ ...running(), messages: [message], drafts: { m: "旧正文" } });
  expect(state.drafts).toEqual({});
  expect(applyEvent(state, event(1, "answer.delta", { message_id: "m", text: "迟到" })).drafts).toEqual({});
});

it("只接收当前运行的分片，已替换或已完成运行的残片不复活", () => {
  const state = initialView(running());
  const stale = { ...event(1, "answer.delta", { message_id: "old", text: "旧回复" }), run_id: "previous" };
  const next = applyEvent(state, stale);
  expect(next.drafts).toEqual({}); expect(next.snapshot.last_seq).toBe(1);
  expect(applyEvent(initialView(empty()), event(1, "answer.delta", { message_id: "old", text: "旧回复" })).drafts).toEqual({});
});

it("新一轮运行开始时清理上轮残片，旧轮次结束事件不清空新轮次", () => {
  const state = initialView({ ...running(), drafts: { old: "旧残片" } });
  let next = applyEvent(state, event(1, "run.status", { run: { id: "new", status: "running" } as AgentRun }));
  expect(next.drafts).toEqual({});
  next = applyEvent(next, { ...event(2, "answer.delta", { message_id: "fresh", text: "新的回复" }), run_id: "new" });
  next = applyEvent(next, event(3, "run.status", { run: { id: "r", status: "completed" } as AgentRun }));
  expect(next.drafts).toEqual({ fresh: "新的回复" });
});

it("同一轮续接前清空失败流残片，不污染新的回复", () => {
  let state = initialView(running());
  state = applyEvent(state, event(1, "answer.delta", { message_id: "failed-draft", text: "未完成的片段" }));
  expect(state.drafts["failed-draft"]).toBe("未完成的片段");
  state = applyEvent(state, event(2, "run.retry", { attempt: 1 }));
  expect(state.drafts).toEqual({});
  state = applyEvent(state, event(3, "answer.delta", { message_id: "recovered-draft", text: "重新生成的回复" }));
  expect(state.drafts).toEqual({ "recovered-draft": "重新生成的回复" });
  expect(state.snapshot.messages).toHaveLength(0);
});
