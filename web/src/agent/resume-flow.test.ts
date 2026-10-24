/** 青穗集 · 简历工坊体验回归：示例与真实状态隔离，确认前不可跳步，被排除经历不会进入交付正文。 */
import { describe, expect, it } from "vitest";
import { canVisitResumeStep, createResumeExample, changeResumeExample } from "./resume-flow";
import { renderResumeHtml } from "../../../agent/src/resume-render";
import { emptyResumeState } from "../../../agent/src/resume-contract";

describe("简历工坊", () => {
  it("从示例材料经过两次人工确认进入编辑与预览，排除经历仍在原文中", () => {
    let state = createResumeExample();
    expect(canVisitResumeStep(state, "editor")).toBe(false);
    state = changeResumeExample(state, { type: "task.request", kind: "facts" });
    expect(state.facts.length).toBe(5);
    expect(canVisitResumeStep(state, "selection")).toBe(false);
    state = changeResumeExample(state, { type: "facts.confirm", facts: state.facts });
    state = changeResumeExample(state, { type: "task.request", kind: "selection" });
    expect(state.selection?.requirements.find(r => r.quote === "能对接 REST API")?.status).toBe("unknown");
    state = changeResumeExample(state, { type: "selection.confirm", choices: state.selection!.choices });
    state = changeResumeExample(state, { type: "task.request", kind: "rewrite" });
    const html = renderResumeHtml(state.header, state.body!, true);
    expect(html).toContain("虚构人物");
    expect(html).not.toContain("校园摄影社团");
    expect(state.source_text).toContain("校园摄影社团");
    expect(emptyResumeState().facts).toEqual([]);
  });
  it("示例自定义取舍后只交付保留经历，不把更改传回先前步骤的状态对象", () => {
    const original = createResumeExample();
    let state = changeResumeExample(original, { type: "task.request", kind: "facts" });
    state = changeResumeExample(state, { type: "facts.confirm", facts: state.facts });
    state = changeResumeExample(state, { type: "task.request", kind: "selection" });
    const choices = state.selection!.choices.map(c => ({ ...c, use: c.fact_id === "example-fact-4" ? "primary" as const : "omit" as const }));
    state = changeResumeExample(state, { type: "selection.confirm", choices });
    state = changeResumeExample(state, { type: "task.request", kind: "rewrite" });
    expect(state.body!.sections.flatMap(s => s.entries).map(e => e.title)).toEqual(["校园摄影社团"]);
    expect(original.facts.length).toBe(0);
  });
});
