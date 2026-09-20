import { describe, expect, it } from "vitest";
import type { ComparisonCell, ComparisonRound } from "../api/client";
import { verdictOf, verdictShifts } from "./ComparisonBoard";

const cell = (candidate: string, criterion: string, verdict: string, over: Partial<ComparisonCell> = {}): ComparisonCell => ({
  candidate,
  criterion,
  verdict,
  score: verdict === "supported" ? 3 : verdict === "partial" ? 1 : 0,
  note: "",
  for_it: [],
  against: [],
  ...over,
});

const round = (round_no: number, cells: ComparisonCell[]): ComparisonRound => ({
  round_no,
  artifact_id: `a${round_no}`,
  supersedes_id: round_no === 1 ? null : `a${round_no - 1}`,
  conclusion: "",
  is_provisional: false,
  created_at: "2026-09-20T10:00:00",
  cells,
});

describe("stored comparison board", () => {
  it("names only the cells whose verdict moved", () => {
    const previous = round(1, [
      cell("数据分析师", "SQL 与统计", "partial"),
      cell("数据分析师", "真实项目经验", "missing"),
      cell("后端工程师", "真实项目经验", "missing"),
    ]);
    const current = round(2, [
      cell("数据分析师", "SQL 与统计", "partial"),
      cell("数据分析师", "真实项目经验", "missing"),
      cell("后端工程师", "真实项目经验", "supported"),
    ]);

    const shifts = verdictShifts(previous, current);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toEqual({
      cell: "后端工程师 · 真实项目经验",
      from: "还缺证据",
      to: "有证据支持",
    });
  });

  it("says nothing moved rather than inventing a change against a first version", () => {
    const only = round(1, [cell("数据分析师", "SQL 与统计", "partial")]);
    expect(verdictShifts(null, only)).toEqual([]);
    expect(verdictShifts(only, only)).toEqual([]);
  });

  it("keeps a score change quiet when the verdict is the same", () => {
    // 1→3 quotes on the same yardstick is still "只对上一点"; reporting it as a change
    // would dress up counting as a new conclusion.
    const previous = round(1, [cell("后端工程师", "工程能力", "partial", { score: 1 })]);
    const current = round(2, [cell("后端工程师", "工程能力", "partial", { score: 3 })]);
    expect(verdictShifts(previous, current)).toEqual([]);
  });

  it("falls back to the raw verdict instead of mislabelling an unknown one", () => {
    expect(verdictOf("missing").label).toBe("还缺证据");
    expect(verdictOf(null).label).toBe("未判定");
    expect(verdictOf("contradicted").cls).toContain("tag--bad");
    expect(verdictOf("something_new").label).toBe("something_new");
  });
});
