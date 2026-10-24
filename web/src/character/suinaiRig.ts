// 青穗集 · 穗奈 v0.5 像素绑定契约：规定画布、图层、锚点和手绘关键姿势的边界。
export type RigPoint = readonly [number, number];
export type RigLayerId =
  | "hair-back"
  | "body"
  | "neck-face"
  | "hair-front"
  | "glasses"
  | "arm-left"
  | "arm-right"
  | "prop"
  | "hands"
  | "effects";
export type RigBoneId = "root" | "torso" | "neck" | "head" | "arm-left" | "forearm-left" | "arm-right" | "forearm-right";
export type RigAction = "idle" | "listen" | "think" | "encourage";

export const SUINAI_RIG_CANVAS = { width: 128, height: 160, nativeScale: 2 } as const;
export const SUINAI_RIG_PALETTE_LIMIT = 32;
export const SUINAI_RIG_FRAME_COUNT = 4;

export const SUINAI_RIG_LAYERS: ReadonlyArray<{ id: RigLayerId; order: number; editable: boolean }> = [
  { id: "hair-back", order: 10, editable: true },
  { id: "body", order: 20, editable: true },
  { id: "neck-face", order: 30, editable: true },
  { id: "hair-front", order: 40, editable: true },
  { id: "glasses", order: 50, editable: true },
  { id: "arm-left", order: 60, editable: true },
  { id: "arm-right", order: 70, editable: true },
  { id: "prop", order: 80, editable: true },
  { id: "hands", order: 90, editable: true },
  { id: "effects", order: 100, editable: true },
];

export const SUINAI_RIG_BONES: ReadonlyArray<{
  id: RigBoneId;
  parent: RigBoneId | null;
  pivot: RigPoint;
  restEnd: RigPoint;
}> = [
  { id: "root", parent: null, pivot: [64, 150], restEnd: [64, 126] },
  { id: "torso", parent: "root", pivot: [64, 126], restEnd: [64, 82] },
  { id: "neck", parent: "torso", pivot: [64, 82], restEnd: [64, 72] },
  { id: "head", parent: "neck", pivot: [64, 72], restEnd: [64, 24] },
  { id: "arm-left", parent: "torso", pivot: [46, 94], restEnd: [32, 116] },
  { id: "forearm-left", parent: "arm-left", pivot: [32, 116], restEnd: [30, 132] },
  { id: "arm-right", parent: "torso", pivot: [82, 94], restEnd: [96, 116] },
  { id: "forearm-right", parent: "arm-right", pivot: [96, 116], restEnd: [98, 132] },
];

export const SUINAI_RIG_ANCHORS = {
  faceCenter: [64, 45],
  chin: [64, 70],
  neckBase: [64, 82],
  shoulderLeft: [46, 94],
  shoulderRight: [82, 94],
  handLeft: [30, 132],
  handRight: [98, 132],
  propCenter: [64, 122],
} as const satisfies Record<string, RigPoint>;

export const SUINAI_RIG_STYLE = {
  silhouette: "soft-anime-half-body",
  pixelCluster: "clean-clusters-with-selective-colored-outline",
  palette: "24-to-32-colors",
  antiAlias: "none",
  dither: "none",
  headHeightLimit: 62,
  shoulderLine: 94,
  faceSafeZone: { x: 42, y: 27, width: 44, height: 40 },
  note: "头部要有表情空间，肩颈和双手要为动作留出空位；所有轮廓最终手工清理。",
} as const;

export const SUINAI_RIG_ACTIONS: ReadonlyArray<{
  id: RigAction;
  frameCount: number;
  handTargets: { left: RigPoint; right: RigPoint };
  prop: "none" | "journal" | "note" | "offering";
  authored: "key-pose-first";
}> = [
  { id: "idle", frameCount: 4, handTargets: { left: [46, 124], right: [82, 124] }, prop: "journal", authored: "key-pose-first" },
  { id: "listen", frameCount: 4, handTargets: { left: [48, 122], right: [79, 66] }, prop: "none", authored: "key-pose-first" },
  { id: "think", frameCount: 4, handTargets: { left: [48, 124], right: [82, 116] }, prop: "note", authored: "key-pose-first" },
  { id: "encourage", frameCount: 4, handTargets: { left: [44, 124], right: [100, 104] }, prop: "offering", authored: "key-pose-first" },
];

export function rigActionForPose(pose: "journal" | "listen" | "write" | "review" | "compare" | "filed"): RigAction {
  return ({ journal: "idle", listen: "listen", write: "think", review: "encourage", compare: "encourage", filed: "idle" } as const)[pose];
}

export function rigFrameForTick(tick: number): number {
  const normalized = ((Math.floor(tick) % SUINAI_RIG_FRAME_COUNT) + SUINAI_RIG_FRAME_COUNT) % SUINAI_RIG_FRAME_COUNT;
  return normalized;
}
