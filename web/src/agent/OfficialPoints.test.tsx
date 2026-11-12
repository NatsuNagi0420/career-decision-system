/** 青穗集 · 积分视图回归：余额精度、缓存说明、预留与失败状态保持一致。 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PointsDetails, formatPoints } from "./OfficialPoints";
import type { OfficialCredits } from "../../../agent/src/credits-contract";
const data: OfficialCredits = { enabled: true, account: { id: 1, username: "test", role: "member", permissions: [] }, summary: { day: "2026-10-31", timezone: "Asia/Shanghai", resets_at: "2026-10-31T16:00:00Z", daily_points: 2300, adjustment_points: 0, remaining_points: 2289, reserved_points: 0, used_points: 11 }, pricing: { version: "v1", input_per_1000: 10, cached_input_per_1000: 2.5, output_per_1000: 40, image_per_item: 200 }, entries: [], next_cursor: null };
describe("官方积分", () => {
  it("显示余额与每日刷新，空记录不假造消费", () => { const html = renderToStaticMarkup(<PointsDetails data={data} />); expect(html).toContain("2,289"); expect(html).toContain("北京时间零点刷新"); expect(html).toContain("还没有用量记录"); expect(html).toContain("缓存输入 2.5"); });
  it("预留与失败明确显示，避免当作实际扣款", () => {
    const html = renderToStaticMarkup(<PointsDetails data={{ ...data, summary: { ...data.summary, reserved_points: 12 }, entries: [{ id: "1", created_at: "2026-10-31T00:00:00Z", completed_at: null, capability: "简历制作", state: "failed", points: 0, reserved_points: 12, input_tokens: null, output_tokens: null, cached_input_tokens: 0, price_version: "v1" }] }} />);
    expect(html).toContain("任务已预留 12"); expect(html).toContain("未扣费"); expect(html).not.toContain("−12");
  });
  it("小数保留两位，整数不补无意义零", () => { expect(formatPoints(2300)).toBe("2,300"); expect(formatPoints(3.285)).toBe("3.29"); expect(formatPoints(.001)).toBe("<0.01"); });
});
