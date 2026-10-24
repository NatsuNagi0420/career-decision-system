// 青穗集 · 穗奈 v0.5 绑定契约测试：保证未来素材拆层时不会丢锚点或越过画风边界。
import { describe, expect, it } from "vitest";
import { rigActionForPose, rigFrameForTick, SUINAI_RIG_ACTIONS, SUINAI_RIG_ANCHORS, SUINAI_RIG_BONES, SUINAI_RIG_CANVAS, SUINAI_RIG_LAYERS, SUINAI_RIG_PALETTE_LIMIT, SUINAI_RIG_STYLE } from "./suinaiRig";

describe("Suinai v0.5 rig contract", () => {
  it("keeps the larger animation-friendly canvas and readable face zone", () => {
    expect(SUINAI_RIG_CANVAS).toEqual({ width: 128, height: 160, nativeScale: 2 });
    expect(SUINAI_RIG_STYLE.headHeightLimit).toBeLessThan(SUINAI_RIG_CANVAS.height / 2);
    expect(SUINAI_RIG_STYLE.faceSafeZone.width).toBeGreaterThanOrEqual(40);
    expect(SUINAI_RIG_PALETTE_LIMIT).toBeLessThanOrEqual(32);
  });

  it("keeps layer order and bone parents deterministic", () => {
    expect(new Set(SUINAI_RIG_LAYERS.map((layer) => layer.id)).size).toBe(SUINAI_RIG_LAYERS.length);
    expect(SUINAI_RIG_LAYERS.map((layer) => layer.order)).toEqual([...SUINAI_RIG_LAYERS].sort((a, b) => a.order - b.order).map((layer) => layer.order));
    expect(SUINAI_RIG_BONES.find((bone) => bone.id === "root")?.parent).toBeNull();
    expect(SUINAI_RIG_BONES.every((bone) => bone.pivot.every(Number.isInteger) && bone.restEnd.every(Number.isInteger))).toBe(true);
  });

  it("defines four hand-authored key-pose actions with stable targets", () => {
    expect(SUINAI_RIG_ACTIONS).toHaveLength(4);
    expect(SUINAI_RIG_ACTIONS.every((action) => action.frameCount === 4 && action.authored === "key-pose-first")).toBe(true);
    expect(SUINAI_RIG_ACTIONS.map((action) => action.id)).toEqual(["idle", "listen", "think", "encourage"]);
    expect(SUINAI_RIG_ACTIONS.every((action) => action.handTargets.left[1] >= 60 && action.handTargets.right[1] >= 60)).toBe(true);
    expect(SUINAI_RIG_ANCHORS.chin[1]).toBeLessThan(SUINAI_RIG_ANCHORS.neckBase[1]);
  });

  it("maps product poses to animation actions without inventing new motion", () => {
    expect((["journal", "filed"] as const).map(rigActionForPose)).toEqual(["idle", "idle"]);
    expect((["listen", "write", "review", "compare"] as const).map(rigActionForPose)).toEqual(["listen", "think", "encourage", "encourage"]);
    expect([0, 1, 4, -1].map(rigFrameForTick)).toEqual([0, 1, 0, 3]);
  });
});
