/** 青穗集 · Cubism动作格式回归：曲线计数、时序、手形阶跃与参数范围；通过不等于模型绑定完成。 */
import { describe, expect, it } from "vitest";
import { EXPRESSION_SPECS, SUINAI_ACTIONS, type ExpressionId } from "./suinaiActions";
import { SUINAI_CUBISM_PARAMETERS, makeCubismExpression, makeCubismMotion } from "./suinaiCubism";
describe("Suinai Cubism authored motion export", () => {
  it("exports forty coherent motion3 files with bounded parameters and accurate meta counts", () => {
    const defs = new Map(SUINAI_CUBISM_PARAMETERS.map(value => [value.id, value]));
    expect(defs.size).toBe(SUINAI_CUBISM_PARAMETERS.length);
    for (const action of SUINAI_ACTIONS) {
      const motion = makeCubismMotion(action.id); let segments = 0, points = 0;
      expect(motion.Version).toBe(3); expect(motion.Meta.CurveCount).toBe(defs.size);
      expect(motion.Meta.Loop).toBe(action.id === "A02");
      for (const curve of motion.Curves) {
        const def = defs.get(curve.Id)!; let lastTime = -1;
        for (let offset = 0; offset < curve.Segments.length;) {
          const first = offset === 0;
          const time = curve.Segments[offset + (first ? 0 : 1)], value = curve.Segments[offset + (first ? 1 : 2)];
          if (!first) { segments++; expect(curve.Segments[offset]).toBe(curve.Id.startsWith("ParamHand") ? 2 : 0); }
          points++; expect(time).toBeGreaterThan(lastTime); lastTime = time;
          expect(value, curve.Id).toBeGreaterThanOrEqual(def.min); expect(value, curve.Id).toBeLessThanOrEqual(def.max);
          offset += first ? 2 : 3;
        }
        expect(lastTime).toBe(action.durationSec);
      }
      expect(motion.Meta.TotalSegmentCount).toBe(segments); expect(motion.Meta.TotalPointCount).toBe(points);
    }
  });
  it("exports facial-only expressions without permanently closing relieved eyes or faking speech", () => {
    for (const id of Object.keys(EXPRESSION_SPECS) as ExpressionId[]) {
      const expression = makeCubismExpression(id);
      expect(expression.Parameters.some(value => /Eye.*Open|Arm|Hand/.test(value.Id))).toBe(false);
      expect(expression.Parameters.every(value => value.Blend === "Overwrite")).toBe(true);
      if (id !== "E10") expect(expression.Parameters.find(value => value.Id === "ParamMouthOpenY")?.Value).toBe(0);
    }
  });
});
