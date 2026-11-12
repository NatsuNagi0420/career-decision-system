/** 青穗集 · 纸面书写时间轴回归：分片连续、跨字段接续、已落笔稳定与积压上限。 */
import { describe, expect, it } from "vitest";
import { appendInkTimings, PAPER_INK_HOLD_MS, PAPER_INK_MAX_QUEUE_MS, PAPER_INK_STEP_MS } from "./resume-paper-motion";

describe("简历纸面书写时间轴", () => {
  it("后续分片沿用同一时间轴，解码期间下一字的乱码已出现", () => {
    const first = appendInkTimings([], 3, 1000);
    const times = first.map(item => item.readyAt);
    const second = appendInkTimings(first, 2, 1040);
    expect(times).toEqual([1000 + PAPER_INK_HOLD_MS, 1000 + PAPER_INK_HOLD_MS + PAPER_INK_STEP_MS, 1000 + PAPER_INK_HOLD_MS + PAPER_INK_STEP_MS * 2]);
    expect(first.map(item => item.readyAt)).toEqual(times);
    expect(second[0].readyAt).toBe(first.at(-1)!.readyAt + PAPER_INK_STEP_MS);
    expect(second[0].appearsAt).toBeLessThan(first.at(-1)!.readyAt);
  });
  it("跨字段的后续文字接在前一字段之后，避免并行落笔", () => {
    const title = appendInkTimings([], 10, 1000);
    const details = appendInkTimings(title, 10, 1000);
    expect(details[0].readyAt).toBe(title.at(-1)!.readyAt + PAPER_INK_STEP_MS);
    expect(details[0].readyAt).toBeGreaterThan(title[0].readyAt);
  });
  it("网络停顿后收到的乱码不会提前出现在纸上", () => {
    const old = appendInkTimings([], 4, 1000);
    const next = appendInkTimings(old, 2, 5000);
    expect(next[0].appearsAt).toBe(5000);
    expect(next[0].readyAt).toBe(5000 + PAPER_INK_HOLD_MS);
  });
  it("大批量分片限制积压，且不挪动已经落笔的时间", () => {
    const old = appendInkTimings([], 5, 1000);
    const begun = old.filter(item => item.readyAt <= 1250).map(item => ({ item, at: item.readyAt }));
    const result = appendInkTimings(old, 500, 1250);
    expect(result.at(-1)!.readyAt).toBeLessThanOrEqual(1250 + PAPER_INK_MAX_QUEUE_MS);
    for (const { item, at } of begun) expect(item.readyAt).toBe(at);
    for (let i = 1; i < result.length; i++) expect(result[i].readyAt).toBeGreaterThanOrEqual(result[i - 1].readyAt);
    for (const item of result) expect(item.appearsAt).toBeGreaterThanOrEqual(item.receivedAt);
  });
});
