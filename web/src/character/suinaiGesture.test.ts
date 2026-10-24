/** 青穗集 · 双臂网格回归：40场景共用同一几何，核对肩缝、弧长、手腕登记点与相邻条带无裂口。 */
import { describe, expect, it } from "vitest";
import { armRestX, armRowPoint, armWrist, buildArmRows, SUINAI_ARMS, type ArmSide } from "./suinaiGesture";
import { SUINAI_ACTIONS, sampleAction } from "./suinaiActions";
const sides: ArmSide[] = ["l", "r"];
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
describe("Suinai continuous arm rig", () => {
  it("uses the art registration points, not the earlier approximate wrist pivots", () => {
    expect(SUINAI_ARMS.l.wrist).toEqual([946, 730]); expect(SUINAI_ARMS.r.wrist).toEqual([570, 730]);
    for (const side of sides) expect(distance(armWrist(side, { shoulder: 0, elbow: 0, wrist: 0 }), SUINAI_ARMS[side].wrist)).toBeLessThan(.000001);
  });
  it("keeps the shoulder seam fixed even at maximum elbow flexion", () => {
    for (const action of SUINAI_ACTIONS) for (const fraction of [.25, .42, .6, 1]) for (const side of sides) {
      const rig = SUINAI_ARMS[side], pose = sampleAction(action.id, action.durationSec * fraction).pose;
      const rows = buildArmRows(side, side === "l" ? pose.left : pose.right, 277, rig.bottom);
      for (const row of rows.filter(value => value.y <= 305)) {
        expect(distance(row.center, [armRestX(rig, row.y), row.y])).toBeLessThan(.000001);
        expect(Math.abs(row.rotation)).toBeLessThan(.000001);
      }
    }
  });
  it("preserves each centerline segment length without stretching the forearm", () => {
    for (const action of SUINAI_ACTIONS) for (const side of sides) {
      const rig = SUINAI_ARMS[side], pose = sampleAction(action.id, action.durationSec * .42).pose;
      const rows = buildArmRows(side, side === "l" ? pose.left : pose.right, 277, rig.bottom);
      for (let index = 1; index < rows.length; index++) {
        const a = rows[index - 1], b = rows[index];
        const rest = Math.hypot(armRestX(rig, b.y) - armRestX(rig, a.y), b.y - a.y);
        expect(distance(a.center, b.center)).toBeCloseTo(rest, 9);
      }
    }
  });
  it("shares exactly the same boundary vertices above/below the hand and wrist", () => {
    for (const side of sides) for (const wrist of [-16, 0, 16]) {
      const angle = { shoulder: side === "l" ? -9 : 9, elbow: side === "l" ? -150 : 150, wrist };
      const full = buildArmRows(side, angle, 277, 845);
      const row = full.find(value => value.y === 729)!;
      expect(row).toBeDefined();
      for (const x of [SUINAI_ARMS[side].wrist[0] - 12, SUINAI_ARMS[side].wrist[0], SUINAI_ARMS[side].wrist[0] + 12]) {
        const top = armRowPoint(side, row, x), bottom = armRowPoint(side, buildArmRows(side, angle, 277, 813).find(value => value.y === 729)!, x);
        expect(top).toEqual(bottom);
      }
    }
  });
});
