/** 青穗集 · 框选命中回归：反向拖拽、空白排除、跨行字段和轻点命中。 */
import { describe, it, expect } from "vitest";
import { fieldsInRegion, regionRect } from "./resume-region";
const fields = [{ id: "first", rects: [{ x: 20, y: 40, width: 80, height: 12 }, { x: 20, y: 56, width: 40, height: 12 }] }, { id: "second", rects: [{ x: 20, y: 90, width: 80, height: 12 }] }];
describe("简历框选范围", () => {
  it("反向拖拽与正向一致", () => { expect(regionRect({ x: 80, y: 72 }, { x: 16, y: 38 })).toEqual({ x: 16, y: 38, width: 64, height: 34 }); });
  it("跨行命中同一字段一次，不包含旁边空白或未选字段", () => { expect(fieldsInRegion(fields, { x: 18, y: 50, width: 90, height: 20 })).toEqual(["first"]); expect(fieldsInRegion(fields, { x: 120, y: 38, width: 30, height: 70 })).toEqual([]); });
  it("支持点击和跨段选择", () => { expect(fieldsInRegion(fields, { x: 40, y: 47, width: 0, height: 0 })).toEqual(["first"]); expect(fieldsInRegion(fields, { x: 18, y: 38, width: 90, height: 68 })).toEqual(["first", "second"]); });
});
