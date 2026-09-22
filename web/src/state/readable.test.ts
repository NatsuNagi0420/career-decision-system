import { describe, expect, it } from "vitest";
import { evidencePill, pointerDetail, pointerSummary, readableQuote, rowPointers } from "./readable";

/**
 * Pinned because it shipped once: the first real run rendered
 * `{"count": 2, "runs": [{"run_id": "63982e…"}` at a student as a 逐字引文. The model
 * was obeying §6.4 correctly — the payload *was* what the tool said — so the fix had
 * to be in presentation, and the original text still has to be reachable.
 */
describe("readableQuote", () => {
  it("leaves a real sentence untouched", () => {
    const quote = "负责数据清洗与指标体系搭建，会用 SQL 取数";
    expect(readableQuote(quote)).toEqual({ text: quote, raw: null });
  });

  it("summarises a JSON payload and keeps the original folded", () => {
    const raw = JSON.stringify({ count: 2, runs: [{ run_id: "a", status: "completed" }] });
    const { text, raw: kept } = readableQuote(raw);
    expect(text).not.toContain("run_id");
    expect(text).not.toContain("{");
    expect(kept).toBe(raw);
  });

  it("prefers readable fields over identifiers", () => {
    const { text } = readableQuote(JSON.stringify({ title: "数据分析师", responsibilities: "清洗与建模", created_at: "2026-09-19" }));
    expect(text).toContain("数据分析师");
    expect(text).toContain("清洗与建模");
    expect(text).not.toContain("2026-09-19");
  });

  it("copes with an array of records", () => {
    const { text } = readableQuote(JSON.stringify([{ name: "后端工程师" }, { name: "数据分析师" }]));
    expect(text).toContain("后端工程师");
    expect(text).toContain("数据分析师");
  });

  it("does not treat a leading brace in prose as JSON", () => {
    const { text, raw } = readableQuote("{这个岗位} 要求里写了三年以上经验");
    expect(raw).toBeNull();
    expect(text).toContain("三年以上经验");
  });

  it("says 返回为空 rather than describing an unrenderable blob", () => {
    expect(readableQuote("{}").text).toContain("返回为空");
    expect(readableQuote('{"items": []}').text).toContain("返回为空");
    expect(readableQuote('{"items": [{"name": "后端工程师"}]}').text).toContain("后端工程师");
  });

  it("still folds something when the payload has no readable string", () => {
    const { text, raw } = readableQuote(JSON.stringify({ count: 3, ids: [1, 2] }));
    expect(text.length).toBeGreaterThan(0);
    expect(raw).toBeTruthy();
  });
});

describe("evidencePill", () => {
  it("never reads a percentage off the run status", () => {
    // The shell used to print "100% 证据可溯源" for any completed run. A finished run is
    // not evidence, and this product's promise is that it does not dress up as one.
    expect(evidencePill({ coverage: null, quotes: 0, provisional: false })).not.toMatch(/\d+%/);
    expect(evidencePill({ coverage: null, quotes: 3, provisional: false }).length).toBeGreaterThan(0);
  });

  it("gives a job seeker counts, not a coverage ratio, and flags a first draft", () => {
    expect(evidencePill({ coverage: 40, quotes: 2, provisional: false })).toBe("2 条原话能对上了");
    expect(evidencePill({ coverage: 0, quotes: 0, provisional: true })).toBe("还没有能对上的原话 · 这条还只是初步");
    expect(evidencePill({ coverage: 100, quotes: 5, provisional: false })).not.toContain("%");
  });
});

/**
 * 目标二 asks for "用户可以查看证据来源，而不只是看到最终分数". The server already binds
 * each quote to a row (§39/#56) and already ships those pointers on `source_refs`; what
 * was missing was a reader for them — both surfaces printed a count and let the model's
 * own `evidence_basis[].source` word stand as the provenance.
 */
describe("rowPointers", () => {
  it("keeps the business rows and drops the bookkeeping ones", () => {
    const rows = rowPointers([
      { table: "agent_runs", id: "63982e" },
      { table: "tool", id: "get_job_samples" },
      { table: "jobs", id: 295 },
      { table: "jobs", id: 295 },
    ]);
    expect(rows).toEqual([{ table: "jobs", label: "岗位样本", id: "295" }]);
  });

  it("names an unlabelled table by its own name instead of hiding it", () => {
    // Dropping a pointer we haven't written a label for yet would re-create "值在、没人读"
    // the first time a tool starts reading a new table.
    expect(rowPointers([{ table: "salary_benchmarks", id: 3 }])[0].label).toBe("salary_benchmarks");
  });

  it("drops a ref with no id instead of naming a row that does not exist", () => {
    expect(rowPointers([{ table: "jobs" }, { table: "jobs", id: "" }])).toEqual([]);
  });

  it("counts the rows per kind, which is what a job seeker can use", () => {
    const refs = [{ table: "jobs", id: 1 }, { table: "evidence_items", id: 2 }, { table: "plan_tasks", id: 3 }];
    expect(pointerSummary(refs)).toBe("岗位样本 1 条 · 证据条目 1 条 · 计划任务 1 条");
    expect(pointerSummary([{ table: "jobs", id: 1 }, { table: "jobs", id: 2 }])).toBe("岗位样本 2 条");
    expect(pointerSummary([{ table: "tool", id: "get_plan" }])).toBe("");
  });

  it("never prints a row identifier: these ids are 32-char hex and read as a bug", () => {
    const refs = [
      { table: "jobs", id: "32a6c0b590d6474f8d98b1546e354a7a" },
      { table: "evidence_items", id: "ee8deb8483094146b5ad1f2426f63d37" },
    ];
    expect(pointerSummary(refs)).toBe("岗位样本 1 条 · 证据条目 1 条");
    // The ids are not lost, only unprinted: a researcher still reaches them.
    expect(pointerDetail(refs)).toContain("jobs#32a6c0b590d6474f8d98b1546e354a7a");
  });
});
