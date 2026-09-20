import { describe, expect, it } from "vitest";
import { readableQuote } from "./readable";

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
