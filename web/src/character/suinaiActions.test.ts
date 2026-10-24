/** 青穗集 · 穗奈40场景动作回归：检查时序与幅度、表情收回、替代透明度、异常优先级和中途打断。 */
import { describe, expect, it } from "vitest";
import { ACTION_BY_ID, EXPRESSION_SPECS, SUINAI_ACTIONS, actionForSignals, sampleAction } from "./suinaiActions";
import { SUINAI_ARMS, armWrist, neutralPose, type ArmSide } from "./suinaiGesture";
import { SuinaiActionPlayer } from "./suinaiPlayback";
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
describe("Suinai v03 scene action direction", () => {
  it("provides forty recipes from thirteen actual bases and names two prop-free substitutes honestly", () => {
    expect(SUINAI_ACTIONS).toHaveLength(40);
    expect(new Set(SUINAI_ACTIONS.map(action => action.id)).size).toBe(40);
    expect(new Set(SUINAI_ACTIONS.map(action => action.gesture)).size).toBe(13);
    expect(SUINAI_ACTIONS.filter(action => action.requestedGesture === "G13").map(action => action.id)).toEqual(["A10", "A35"]);
    for (const action of SUINAI_ACTIONS) {
      expect(action.leftHand).not.toMatch(/H07|H08/); expect(action.rightHand).not.toMatch(/H07|H08/);
      if (action.requestedGesture === "G13") expect(action.substitution).toContain("替代");
    }
    expect(ACTION_BY_ID.A40.substitution).toContain("轻握拳");
    expect(Object.keys(EXPRESSION_SPECS)).toHaveLength(12);
  });
  it("keeps all sampled parameters finite, eyes clamped and hands valid", () => {
    for (const action of SUINAI_ACTIONS) for (let step = 0; step <= 100; step++) {
      const sample = sampleAction(action.id, step * action.durationSec / 100);
      expect(Object.values(sample.pose).filter(value => typeof value === "number").every(Number.isFinite)).toBe(true);
      expect(Object.values(sample.pose.left).every(Number.isFinite)).toBe(true); expect(Object.values(sample.pose.right).every(Number.isFinite)).toBe(true);
      expect(sample.closure).toBeGreaterThanOrEqual(0); expect(sample.closure).toBeLessThanOrEqual(1);
      expect(sample.expressionWeight).toBeGreaterThanOrEqual(0); expect(sample.expressionWeight).toBeLessThanOrEqual(1);
      expect(sample.leftHand).toMatch(/^H0[1-6]$/); expect(sample.rightHand).toMatch(/^H0[1-6]$/);
    }
  });
  it("uses visible articulated arms instead of scaling the idle sway", () => {
    for (const action of SUINAI_ACTIONS.filter(value => !["G01", "G03", "G14"].includes(value.gesture))) {
      const displacements: number[] = [];
      for (const fraction of [.3, .42, .55, .7]) {
        const pose = sampleAction(action.id, action.durationSec * fraction).pose;
        for (const side of ["l", "r"] as ArmSide[]) displacements.push(distance(armWrist(side, side === "l" ? pose.left : pose.right), SUINAI_ARMS[side].wrist));
      }
      expect(Math.max(...displacements), action.id).toBeGreaterThan(action.id === "A39" ? 120 : 180);
    }
  });
  it("settles one-shot poses, expressions and hands, but holds listening and thought", () => {
    for (const action of SUINAI_ACTIONS) {
      const last = sampleAction(action.id, action.durationSec + 100);
      if (action.playback !== "enter_then_hold") {
        expect(last.pose, action.id).toEqual(neutralPose()); expect(last.closure).toBe(0); expect(last.expressionWeight).toBe(0);
        expect(last.leftHand).toBe("H01"); expect(last.rightHand).toBe("H01");
      } else { expect(last.pose, action.id).not.toEqual(neutralPose()); expect(last.phase).toBe("保持"); }
    }
  });
  it("does not keep relieved eyes shut or invent independent gaze directions", () => {
    for (const action of SUINAI_ACTIONS.filter(value => value.expression === "E11" || value.expression === "E06")) {
      expect(sampleAction(action.id, .45 * action.durationSec).closure).toBeGreaterThan(.9);
      expect(sampleAction(action.id, .9 * action.durationSec).closure).toBe(0);
    }
    expect(sampleAction("A09", 1.8).pose.gazeX).toBeLessThan(0);
    expect(sampleAction("A14", 1.8).pose.gazeX).toBeGreaterThan(0);
    expect(sampleAction("A31", 1.8).pose.gazeY).toBeGreaterThan(0);
  });
  it("is continuous when sampling adjacent instants and robust to invalid time", () => {
    for (const action of SUINAI_ACTIONS) {
      expect(sampleAction(action.id, NaN)).toEqual(sampleAction(action.id, 0));
      for (let t = .05; t < action.durationSec; t += .05) {
        const a = sampleAction(action.id, t).pose, b = sampleAction(action.id, t + .00001).pose;
        for (const side of ["l", "r"] as ArmSide[]) expect(distance(armWrist(side, side === "l" ? a.left : a.right), armWrist(side, side === "l" ? b.left : b.right)), action.id).toBeLessThan(.1);
      }
    }
  });
  it("prioritizes errors and only celebrates confirmed completion signals", () => {
    expect(actionForSignals({ error: true, running: true, verifiedCompletion: "export" })).toBe("A39");
    expect(actionForSignals({ awaitingConfirmation: true, verifiedCompletion: "profile" })).toBe("A37");
    expect(actionForSignals({ running: true, domain: "resume", verifiedCompletion: "export" })).toBe("A31");
    expect(actionForSignals({ running: true, domain: "jobs" })).toBe("A14");
    expect(actionForSignals({ verifiedCompletion: "export" })).toBe("A36");
    expect(actionForSignals({ composing: true })).toBe("A03"); expect(actionForSignals({})).toBe("A02");
  });
});
describe("Suinai playback clock", () => {
  it("clamps frame deltas, seeks exactly and sends a completion once", () => {
    const player = new SuinaiActionPlayer("A01"); player.advance(-1); player.advance(NaN); expect(player.seconds).toBe(0);
    player.advance(100); expect(player.seconds).toBe(.05);
    for (let i = 0; i < 100; i++) player.advance(.05);
    expect(player.progress).toBe(1); expect(player.takeCompletion()).toBe(true); expect(player.takeCompletion()).toBe(false);
    player.seek(.42); expect(player.seconds).toBeCloseTo(3.8 * .42); expect(player.frame).toEqual(sampleAction("A01", player.seconds));
    player.seek(1); expect(player.takeCompletion()).toBe(false);
  });
  it("captures the last interrupted pose without a jump and never loops celebrations", () => {
    const player = new SuinaiActionPlayer("A01"); player.seek(.42); const previous = player.frame.pose;
    player.start("A39"); expect(player.frame.pose).toEqual(previous);
    for (let i = 0; i < 8; i++) player.advance(.05);
    expect(player.frame).toEqual(sampleAction("A39", player.seconds));
    for (let i = 0; i < 300; i++) player.advance(.05);
    expect(player.progress).toBe(1); expect(player.frame.pose).toEqual(neutralPose());
    player.start("A02"); for (let i = 0; i < 300; i++) player.advance(.05); expect(player.takeCompletion()).toBe(false);
  });
});
