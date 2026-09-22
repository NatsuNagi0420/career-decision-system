import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ArtifactEntry } from "../api/client";
import { EvidenceDrawer } from "./EvidenceDrawer";

function artifact(source_refs: Array<Record<string, unknown>>): ArtifactEntry {
  return {
    id: "a1",
    run_id: "r1",
    artifact_type: "ComparisonMatrix",
    title: "比较结论",
    status: "committed",
    version: 1,
    data_coverage: 60,
    is_provisional: false,
    generation_mode: "llm",
    content: {
      evidence_basis: [{ claim: "岗位要 SQL", quote: "熟练 SQL 者优先", source: "招聘网站" }],
    },
    evidence_quotes: { "岗位要 SQL": "熟练 SQL 者优先" },
    source_refs,
    supersedes_id: null,
  };
}

/**
 * 目标二 says the user can 查看证据来源, so the bound row pointers have to reach the
 * markup — the reducer test only proves they survive to the state. Rendered here rather
 * than in a browser because the drawer needs no data fetching: it is a reader over one
 * 成果物, so static markup is the whole surface.
 */
const render = (refs: Array<Record<string, unknown>>) =>
  renderToStaticMarkup(
    createElement(EvidenceDrawer, { open: true, artifact: artifact(refs), onClose: () => {} }),
  );

describe("EvidenceDrawer provenance", () => {
  it("shows which rows the answer stands on", () => {
    const html = render([{ table: "jobs", id: 295 }, { table: "tool", id: "get_job_samples" }]);
    expect(html).toContain("系统记下的真实出处：岗位样本 1 条");
    // The row id is kept off the face of the drawer but not thrown away.
    expect(html).toContain('title="jobs#295');
  });

  it("says so when there is no row pointer, instead of letting the model's word stand as one", () => {
    const html = render([{ table: "agent_runs", id: "r1" }, { table: "tool", id: "get_job_samples" }]);
    expect(html).toContain("没有落到具体行");
    expect(html).toContain("模型自述来源：招聘网站");
  });
});
