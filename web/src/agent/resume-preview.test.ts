/** 青穗集 · 简历纸面数据回归：同一份事实投影、逐段替换和生成片段生命周期。 */
import { describe, expect, it } from "vitest";
import { emptyResumeState, type ResumeLiveDraft } from "../../../agent/src/resume-contract";
import { createResumeExample, changeResumeExample } from "./resume-flow";
import { currentResumeDraft, resumePreviewDocument } from "./resume-preview";
import type { AgentEvent, AgentRun } from "./types";
function ready() {
  let state = changeResumeExample(createResumeExample(), { type: "task.request", kind: "facts" });
  state = changeResumeExample(state, { type: "facts.confirm", facts: state.facts });
  state = changeResumeExample(state, { type: "task.request", kind: "selection" });
  state = changeResumeExample(state, { type: "selection.confirm", choices: state.selection!.choices });
  state.pending = { id: "current", kind: "rewrite" };
  return state;
}
function draft(state: ReturnType<typeof ready>): ResumeLiveDraft {
  return { request_id: "current", context_version: state.context_version, body: { summary: { text: "", fact_ids: [] }, sections: [{ kind: "projects", entries: [{ title: "流式改写的报名项目", subtitle: "", period: "", fact_ids: [state.facts[1].id], bullets: ["刚生成的一条经历。"] }] }] } };
}
describe("简历纸面投影", () => {
  it("原文先按纸面显示，未收集的姓名和经历保持空白", () => {
    const state = emptyResumeState(); state.source_text = "我做过一个小项目，未上线。";
    const result = resumePreviewDocument(state);
    expect(result.sourceText).toBe(state.source_text);
    expect(result.header.name).toBe("");
    expect(result.body.sections).toEqual([]);
  });
  it("流式条目替换对应事实，保留其他经历并排除不选的经历", () => {
    const state = ready(), streamed = draft(state);
    const paper = resumePreviewDocument(state, streamed);
    const entries = paper.body.sections.flatMap(section => section.entries);
    expect(entries.some(entry => entry.title === "流式改写的报名项目")).toBe(true);
    expect(entries.filter(entry => entry.fact_ids.includes(state.facts[1].id))).toHaveLength(1);
    expect(entries.some(entry => entry.fact_ids.includes(state.facts[0].id))).toBe(true);
    const omitted = state.selection!.choices.find(choice => choice.use === "omit")!;
    expect(entries.some(entry => entry.fact_ids.includes(omitted.fact_id))).toBe(false);
    expect(state.body).toBeNull();
  });
  it("材料或请求变化后立即丢弃旧片段", () => {
    const state = ready(), streamed = draft(state);
    expect(resumePreviewDocument({ ...state, context_version: state.context_version + 1 }, streamed)).toEqual(resumePreviewDocument(state));
    expect(resumePreviewDocument({ ...state, pending: null }, streamed)).toEqual(resumePreviewDocument(state));
  });
  it("停止、失败、重试和切换模型步骤不会恢复旧片段", () => {
    const state = ready(), streamed = draft(state), run = { id: "run", status: "running" } as AgentRun;
    const event = (kind: string, data: Record<string, unknown> = {}): AgentEvent => ({ seq: 1, kind, run_id: "run", data, created_at: "" });
    const events = [event("model.started"), event("resume.preview", { draft: streamed })];
    expect(currentResumeDraft(events, run, state)).toEqual(streamed);
    for (const status of ["failed", "cancelled", "completed"] as const) expect(currentResumeDraft(events, { ...run, status }, state)).toBeNull();
    for (const kind of ["model.started", "model.failed", "run.retry"]) expect(currentResumeDraft([...events, event(kind)], run, state)).toBeNull();
    expect(currentResumeDraft([...events, event("tool.finished", { name: "propose_resume_update", ok: false })], run, state)).toBeNull();
    expect(currentResumeDraft(events, { ...run, id: "another" }, state)).toBeNull();
  });
});


it("完整重写流只展示真实已生成内容，不用旧经历填满尚未生成的部分", () => {
  const state = ready(), streamed = { ...draft(state), mode: "replace" as const };
  const paper = resumePreviewDocument(state, streamed);
  expect(paper.body).toEqual(streamed.body);
  expect(paper.body.sections.flatMap(section => section.entries)).toHaveLength(1);
  expect(state.body).toBeNull();
});
