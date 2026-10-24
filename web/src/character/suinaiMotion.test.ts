/** 青穗集 · 动作素材清单回归：在加载图片前拒绝缺侧、坏坐标、越界引用和不支持的原画版本。 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blinkClosure, parseMotionManifest } from "./suinaiMotion";
const valid = () => JSON.parse(readFileSync(new URL("../../../assets/web/brand/suinai-motion-v03/manifest.json", import.meta.url), "utf8"));
describe("Suinai v03 asset manifest", () => {
  it("accepts the exported coordinate contract", () => {
    const input = valid(); expect(parseMotionManifest(input)).toBe(input);
  });
  it("limits the reviewed palm-side correction to three distal hands, not neutral sleeves or every left/right asset", () => {
    const input = valid();
    expect(input.handOrientation).toEqual({
      revision: 1, convention: "character-left-is-viewer-right",
      corrections: {
        "arm-l-H02": { axisX: 945.5, keepThroughY: 742, fullFromY: 750 },
        "arm-r-H02": { axisX: 569.5, keepThroughY: 742, fullFromY: 750 },
        "arm-r-H03": { axisX: 569, keepThroughY: 742, fullFromY: 750 },
      },
    });
    // Actual image pixels and fingertip-side checks live in verify:suinai-hands.
    expect(input.arms.l.H01).toBe("arm-l-H01"); expect(input.arms.r.H01).toBe("arm-r-H01");
    expect(input.assets).toHaveLength(53);
    expect(input.assets.filter((asset: { derivation?: unknown }) => asset.derivation).map((asset: { name: string }) => asset.name).sort())
      .toEqual(["arm-l-H02", "arm-r-H02", "arm-r-H03"]);
  });
  it("rejects incomplete right arms, eyes, portraits or facial sprite mappings", () => {
    const cases = [
      (input: ReturnType<typeof valid>) => { delete input.arms.r; },
      (input: ReturnType<typeof valid>) => { delete input.eyes.r; },
      (input: ReturnType<typeof valid>) => { delete input.views.portrait; },
      (input: ReturnType<typeof valid>) => { input.base.face = "not-exported"; },
      (input: ReturnType<typeof valid>) => { input.mouths.M03 = null; },
      (input: ReturnType<typeof valid>) => { input.eyes.l.anchorY = NaN; },
    ];
    for (const mutate of cases) { const input = valid(); mutate(input); expect(() => parseMotionManifest(input)).toThrow("版本不一致"); }
  });
  it("rejects duplicate names, path traversal and invalid geometry before requesting images", () => {
    const cases = [
      (input: ReturnType<typeof valid>) => { input.assets[0].bounds = [5, 2, 1, 8]; },
      (input: ReturnType<typeof valid>) => { input.assets[0].url = "/api/assets/brand/suinai-motion-v03/../bad.png"; },
      (input: ReturnType<typeof valid>) => { input.assets[1].name = input.assets[0].name; },
      (input: ReturnType<typeof valid>) => { input.version = 1; },
      (input: ReturnType<typeof valid>) => { input.views.face = [1000, 0, 600, 300]; },
    ];
    for (const mutate of cases) { const input = valid(); mutate(input); expect(() => parseMotionManifest(input)).toThrow("版本不一致"); }
    for (const input of [null, [], "manifest", 0, {}]) expect(() => parseMotionManifest(input)).toThrow("版本不一致");
  });
  it("keeps blink timing finite and bounded", () => {
    expect(blinkClosure(NaN)).toBe(0); expect(blinkClosure(-1)).toBe(0); expect(blinkClosure(.4)).toBe(0);
    expect(blinkClosure(.15)).toBe(1);
  });
});
