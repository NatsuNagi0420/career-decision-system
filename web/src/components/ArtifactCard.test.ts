/** 青穗集 · 成果卡验收：保留原话依据、缺项引导和独立的正式打印内容。 */
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

describe("the resume draft card", () => {
  const resumeArtifact = (sections: unknown[]) =>
    renderToStaticMarkup(
      createElement(ArtifactCard, {
        artifact: {
          id: "r-1",
          run_id: "run-1",
          artifact_type: "ResumeDraft",
          title: "简历生成与优化：先做后端",
          status: "committed",
          version: 1,
          data_coverage: null,
          is_provisional: false,
          generation_mode: "fallback",
          content: { resume: { sections, completeness: "1/4 节有内容，其余是还没问过你，不是「你没有」" } },
          evidence_quotes: {},
          source_refs: [],
          supersedes_id: null,
        } as ArtifactEntry,
        usage: null,
        steps: 0,
        model: null,
        projectId: null,
        onFiled: () => {},
      }),
    );

  const section = (key: string, title: string, lines: { text: string; ref: { table: string; id: string } }[]) => ({
    key,
    title,
    lines,
    empty: lines.length === 0,
    ask: `去补${title}`,
  });

  it("keeps an empty section on the page and says what would fill it", () => {
    const html = resumeArtifact([
      section("education", "教育", []),
      section("skills", "技能", [{ text: "会用 SQL 做数据清洗", ref: { table: "profile_facts", id: "f1" } }]),
    ]);

    expect(html).toContain("教育");
    expect(html).toContain("去补教育");
    expect(html).toContain('class="resume-sheet__section no-print"');
    expect(html).toContain('class="resume-context no-print"');
    expect(html).toContain("会用 SQL 做数据清洗");
    expect(html).toContain("1/4 节有内容");
  });

  it("never prints the row id behind a line", () => {
    const html = resumeArtifact([section("skills", "技能", [{ text: "处理过 12 万行", ref: { table: "profile_facts", id: "3d24b6ab0f0e4a5f9a1c2b3d4e5f6071" } }])]);

    expect(html).toContain("处理过 12 万行");
    expect(html).not.toContain("3d24b6ab");
    expect(html).not.toContain("profile_facts");
  });
});

describe("the job match card", () => {
  it("shows matched words and the reference-sample warning, not a percentage", () => {
    const html = renderToStaticMarkup(
      createElement(ArtifactCard, {
        artifact: {
          id: "j1",
          run_id: "r1",
          artifact_type: "JobMatchReport",
          title: "对照岗位",
          status: "committed",
          version: 1,
          data_coverage: null,
          is_provisional: false,
          generation_mode: "fallback",
          content: {
            conclusion: "对上了 1 个参考岗位。这些行没有采集日期，不能当成现在还在招的推荐。",
            job_match: {
              reference_only: true,
              jobs: [
                {
                  job_id: 7,
                  title: "初级数据分析师",
                  company: "A 公司",
                  city: "广州",
                  matched: ["SQL"],
                  matched_count: 1,
                  reference_only: true,
                  quotes: [{ text: "熟练使用 SQL 完成多表关联取数", id: 1 }],
                },
              ],
            },
          },
          evidence_quotes: {},
          source_refs: [],
          supersedes_id: null,
        } as ArtifactEntry,
        usage: null,
        steps: 0,
        model: null,
        projectId: null,
        onFiled: () => {},
      }),
    );
    expect(html).toContain("初级数据分析师");
    expect(html).toContain("参考样本");
    expect(html).toContain("对上 1 个词");
    expect(html).toContain("熟练使用 SQL");
    expect(html).not.toContain("%");
    expect(html).not.toContain("覆盖度");
  });
});
