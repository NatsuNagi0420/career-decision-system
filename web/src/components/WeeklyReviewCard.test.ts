import { describe, expect, it } from "vitest";
import { newRequestId } from "../api/client";
import { mondayOf, prefill, toPayload } from "./WeeklyReviewCard";

const draft = {
  conclusion: "这周把两份 JD 逐条对过了，数据分析更贴我现在能做的事。",
  evidence_basis: [{ claim: "岗位要 SQL", quote: "熟练 SQL 者优先", source: "jobs" }],
  uncertainties: ["还没问学长团队里到底谁写报表", "不知道实习有没有转正名额"],
  next_actions: ["约学长聊一次"],
  confidence_trend: "up",
  confidence_reason: "两次面谈都提到同一项要求",
  next_focus: "问清转正名额",
};

describe("weekly review confirmation card", () => {
  it("closes the week that started on Monday, even on a Sunday", () => {
    expect(mondayOf(new Date(2026, 8, 21))).toBe("2026-09-21");
    expect(mondayOf(new Date(2026, 8, 27))).toBe("2026-09-21");
    expect(mondayOf(new Date(2027, 0, 1))).toBe("2026-12-28");
  });

  it("prefills every field from the draft and keeps what it admits as unknown", () => {
    const form = prefill(draft, new Date(2026, 8, 23));
    expect(form.week_start).toBe("2026-09-21");
    expect(form.body).toContain(draft.conclusion);
    expect(form.body).toContain(`还没确认：${draft.uncertainties.join("；")}`);
    expect(form.confidence_trend).toBe("up");
    // A draft with no trend is not a trend: the card defaults to 持平.
    expect(prefill({ confidence_trend: null }).confidence_trend).toBe("flat");
    expect(prefill({ confidence_trend: "上涨" }).confidence_trend).toBe("flat");
  });

  it("sends exactly the contract's keys, with the id generated in the browser", () => {
    const requestId = newRequestId();
    const payload = toPayload(prefill(draft, new Date(2026, 8, 23)), requestId, "run-7");
    expect(Object.keys(payload).sort()).toEqual([
      "body",
      "confidence_reason",
      "confidence_trend",
      "next_focus",
      "request_id",
      "source_run_id",
      "week_start",
    ]);
    expect(payload.request_id).toBe(requestId);
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(payload.confidence_trend).toBe("up");
    // One card holds one id, so a second press is a replay of this same body rather
    // than a second write: what the server dedupes on.
    expect(toPayload(prefill(draft, new Date(2026, 8, 23)), newRequestId(), "run-7").request_id).not.toBe(requestId);
  });

  it("omits source_run_id when the draft arrived without a run", () => {
    const payload = toPayload(prefill({ body: "x" }), newRequestId(), "");
    expect("source_run_id" in payload).toBe(false);
    expect(payload.confidence_trend).toBe("flat");
  });
});
