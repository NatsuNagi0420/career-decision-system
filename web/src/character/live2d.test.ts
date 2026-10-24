/** 青穗集 · Live2D 交互契约测试：事件优先级、防原型键、参数范围与素材/动作的真实完整性。 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { clampUnit, companionStateFor, LIVE2D_MODEL, LIVE2D_PRESETS, safeCompanionState } from "./live2d";
const assetDir = resolve(process.cwd(), "../assets/web");
describe("Live2D companion state", () => {
  it("maps explicit product signals with predictable priority", () => {
    expect(companionStateFor({})).toBe("idle");
    expect(companionStateFor({ composing: true })).toBe("listening");
    expect(companionStateFor({ running: true, composing: true, completed: true })).toBe("thinking");
    expect(companionStateFor({ awaitingConfirmation: true, completed: true, running: true })).toBe("explaining");
    expect(companionStateFor({ completed: true })).toBe("success");
    expect(companionStateFor({ replying: true })).toBe("explaining");
    expect(companionStateFor({ error: true, running: true, completed: true })).toBe("concern");
  });
  it("rejects arbitrary strings and inherited object properties", () => {
    for (const value of [undefined, null, {}, "constructor", "__proto__", "unknown"]) expect(safeCompanionState(value)).toBe("idle");
    expect(safeCompanionState("success")).toBe("success");
  });
  it("keeps mouth input finite and bounded", () => {
    expect(clampUnit(-1)).toBe(0); expect(clampUnit(2)).toBe(1); expect(clampUnit(.35)).toBe(.35);
    for (const value of [NaN, Infinity, -Infinity]) expect(clampUnit(value)).toBe(0);
  });
  it("has six distinct poses and never fakes speech from text", () => {
    expect(Object.keys(LIVE2D_PRESETS)).toHaveLength(6);
    expect(new Set(Object.values(LIVE2D_PRESETS).map(preset => JSON.stringify(preset.params))).size).toBe(6);
    for (const preset of Object.values(LIVE2D_PRESETS)) {
      expect("ParamMouthOpenY" in preset.params).toBe(false);
      for (const value of Object.values(preset.params)) expect(Number.isFinite(value)).toBe(true);
    }
  });
});
describe("local Live2D assets", () => {
  it("uses actual MOC3 and PNG assets, not git-lfs pointers or missing files", () => {
    expect(LIVE2D_MODEL.isPlaceholder).toBe(true);
    const modelPath = resolve(assetDir, LIVE2D_MODEL.url.slice("/api/assets/".length));
    const settings = JSON.parse(readFileSync(modelPath, "utf8"));
    const folder = resolve(modelPath, "..");
    const refs = settings.FileReferences;
    expect(readFileSync(resolve(folder, refs.Moc)).subarray(0, 4).toString("ascii")).toBe("MOC3");
    for (const texture of refs.Textures) expect(readFileSync(resolve(folder, texture)).subarray(1, 4).toString("ascii")).toBe("PNG");
    for (const key of ["Physics", "Pose", "DisplayInfo"]) expect(existsSync(resolve(folder, refs[key]))).toBe(true);
    for (const group of Object.values(refs.Motions) as { File: string }[][]) for (const motion of group) expect(existsSync(resolve(folder, motion.File))).toBe(true);
    for (const expression of refs.Expressions) expect(existsSync(resolve(folder, expression.File))).toBe(true);
  });
  it("authors valid non-looping Cubism parameter motion curves", () => {
    for (const name of ["nod", "tilt", "celebrate"]) {
      const motion = JSON.parse(readFileSync(resolve(assetDir, "live2d/motions", `${name}.motion3.json`), "utf8"));
      expect(motion.Version).toBe(3); expect(motion.Meta.Loop).toBe(false);
      expect(motion.Meta.CurveCount).toBe(motion.Curves.length);
      let points = 0, segments = 0;
      for (const curve of motion.Curves) {
        expect(curve.Target).toBe("Parameter");
        expect(curve.Segments[0]).toBe(0); expect(curve.Segments[1]).toBe(0);
        let previous = 0; points++;
        for (let i = 2; i < curve.Segments.length; i += 3) {
          expect(curve.Segments[i]).toBe(0);
          expect(curve.Segments[i + 1]).toBeGreaterThan(previous);
          previous = curve.Segments[i + 1]; points++; segments++;
        }
        expect(previous).toBe(motion.Meta.Duration);
        expect(curve.Segments.at(-1)).toBe(0);
      }
      expect(motion.Meta.TotalPointCount).toBe(points);
      expect(motion.Meta.TotalSegmentCount).toBe(segments);
    }
  });
  it("keeps Core, shader sources and license notices local", () => {
    for (const file of ["core/live2dcubismcore.min.js", "runtime/companion.js", "shaders/vertshadersrc.vert", "shaders/fragshadersrcpremultipliedalpha.frag", "licenses/SDK-LICENSE.md", "licenses/core.html", "licenses/framework.html", "licenses/materials.html", "licenses/sample-models.html"]) expect(existsSync(resolve(assetDir, "live2d", file))).toBe(true);
  });
});

