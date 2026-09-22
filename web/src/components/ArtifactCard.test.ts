import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ArtifactEntry } from "../api/client";
import { ArtifactCard } from "./ArtifactCard";

function artifact(lines: number): ArtifactEntry {
  const basis = Array.from({ length: lines }, (_, i) => ({
    claim: `结论 ${String(i + 1)}`,
    quote: `原话 ${String(i + 1)}`,
    source: "岗位原句",
  }));
  return {
    id: "a1",
    run_id: "r1",
    artifact_type: "DirectionBrief",
    title: "方向说明",
    status: "committed",
    version: 1,
    data_coverage: null,
    is_provisional: false,
    generation_mode: "llm",
    content: { conclusion: "先做后端。", evidence_basis: basis, uncertainties: [], next_actions: [] },
    evidence_quotes: Object.fromEntries(basis.map((b) => [b.claim, b.quote])),
    source_refs: [],
    supersedes_id: null,
  };
}

const render = (lines: number) =>
  renderToStaticMarkup(
    createElement(ArtifactCard, {
      artifact: artifact(lines),
      usage: null,
      steps: 0,
      model: null,
      projectId: null,
      onFiled: () => {},
    }),
  );

describe("answer card density", () => {
  it("shows three quotes and offers the rest, because the list outranked the answer", () => {
    const html = render(5);
    expect(html).toContain("结论 1");
    expect(html).toContain("结论 3");
    expect(html).not.toContain("结论 4");
    expect(html).toContain("还有 2 条，展开看");
  });

  it("does not add a control when there is nothing to expand", () => {
    const html = render(3);
    expect(html).toContain("结论 3");
    expect(html).not.toContain("展开看");
  });
});
