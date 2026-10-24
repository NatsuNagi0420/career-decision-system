/** 青穗集 · 穗奈共享姿态与双臂几何：固定肩缝、按弧长连续弯曲；动作时序只在suinaiActions中定义。 */
export type ArmSide = "l" | "r";
export type Point = readonly [number, number];
export interface ArmPose { shoulder: number; elbow: number; wrist: number }
export interface SuinaiPose {
  body: number; head: number; nod: number; lift: number; gazeX: number; gazeY: number;
  left: ArmPose; right: ArmPose;
}
export interface Keyframe { at: number; pose: SuinaiPose }
export interface GestureClip { duration: number; frames: Keyframe[] }
const arm = (shoulder = 0, elbow = 0, wrist = 0): ArmPose => ({ shoulder, elbow, wrist });
export function neutralPose(): SuinaiPose {
  return { body: 0, head: 0, nod: 0, lift: 0, gazeX: 0, gazeY: 0, left: arm(), right: arm() };
}
export function smoothUnit(value: number): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return t * t * (3 - 2 * t);
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function blendPose(a: SuinaiPose, b: SuinaiPose, t: number): SuinaiPose {
  const mixArm = (x: ArmPose, y: ArmPose): ArmPose => ({ shoulder: lerp(x.shoulder, y.shoulder, t), elbow: lerp(x.elbow, y.elbow, t), wrist: lerp(x.wrist, y.wrist, t) });
  return {
    body: lerp(a.body, b.body, t), head: lerp(a.head, b.head, t), nod: lerp(a.nod, b.nod, t),
    lift: lerp(a.lift, b.lift, t), gazeX: lerp(a.gazeX, b.gazeX, t), gazeY: lerp(a.gazeY, b.gazeY, t),
    left: mixArm(a.left, b.left), right: mixArm(a.right, b.right),
  };
}
export function samplePoseClip(clip: GestureClip, seconds: number): SuinaiPose {
  const time = Math.max(0, Math.min(clip.duration, Number.isFinite(seconds) ? seconds : 0));
  const end = clip.frames.findIndex(frame => frame.at >= time);
  if (end <= 0) return blendPose(clip.frames[0].pose, clip.frames[0].pose, 0);
  const a = clip.frames[end - 1], b = clip.frames[end];
  return blendPose(a.pose, b.pose, smoothUnit((time - a.at) / (b.at - a.at)));
}
export interface ArmRig { shoulder: Point; elbow: Point; wrist: Point; bottom: number }
// l/r follow the source layer names: l is on the viewer's right, r on the viewer's left.
export const SUINAI_ARMS: Record<ArmSide, ArmRig> = {
  r: { shoulder: [655, 300], elbow: [615, 500], wrist: [570, 730], bottom: 813 },
  l: { shoulder: [853, 300], elbow: [894, 500], wrist: [946, 730], bottom: 812 },
};
export function armRestX(rig: ArmRig, y: number): number {
  const [a, b] = y <= rig.elbow[1] ? [rig.shoulder, rig.elbow] : [rig.elbow, rig.wrist];
  return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
}
function bendAngle(rig: ArmRig, pose: ArmPose, y: number): number {
  const shoulder = smoothUnit((y - rig.shoulder[1] - 8) / 45);
  const elbow = smoothUnit((y - rig.elbow[1] + 32) / 64);
  const wrist = smoothUnit((y - rig.wrist[1] + 8) / 28);
  return (pose.shoulder * shoulder + pose.elbow * elbow + pose.wrist * wrist) * Math.PI / 180;
}
export interface ArmRow { y: number; center: Point; rotation: number }
export function buildArmRows(side: ArmSide, pose: ArmPose, top: number, bottom: number): ArmRow[] {
  const rig = SUINAI_ARMS[side];
  const ys = [top];
  // Four source pixels per strip retain a rounded elbow and an unbroken shoulder seam.
  for (let y = top + 4; y < bottom; y += 4) ys.push(y);
  ys.push(bottom);
  let x = armRestX(rig, top), y = top;
  return ys.map((sourceY, index) => {
    if (index) {
      const previousY = ys[index - 1];
      const dx = armRestX(rig, sourceY) - armRestX(rig, previousY), dy = sourceY - previousY;
      const angle = bendAngle(rig, pose, (sourceY + previousY) / 2);
      x += dx * Math.cos(angle) - dy * Math.sin(angle);
      y += dx * Math.sin(angle) + dy * Math.cos(angle);
    }
    return { y: sourceY, center: [x, y], rotation: bendAngle(rig, pose, sourceY) };
  });
}
export function armRowPoint(side: ArmSide, row: ArmRow, x: number): Point {
  const offset = x - armRestX(SUINAI_ARMS[side], row.y);
  return [row.center[0] + offset * Math.cos(row.rotation), row.center[1] + offset * Math.sin(row.rotation)];
}
export function armWrist(side: ArmSide, pose: ArmPose): Point {
  const rig = SUINAI_ARMS[side];
  return buildArmRows(side, pose, 277, rig.wrist[1]).at(-1)!.center;
}
