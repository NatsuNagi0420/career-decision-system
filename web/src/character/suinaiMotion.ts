/** 青穗集 · 穗奈v03动作渲染：连续双臂、安全手势画幅、同向遮罩眼神与原坐标表情；非Cubism模型。 */
import { assetUrl } from "../assets";
import { armRowPoint, armWrist, buildArmRows, type ArmSide, type Point, type SuinaiPose } from "./suinaiGesture";
import { EXPRESSION_SPECS, type ActionFrame } from "./suinaiActions";
export type SuinaiView = "gesture" | "portrait" | "face" | "hands" | "full";
type Bounds = [number, number, number, number];
interface MotionLayer { name: string; url: string; bounds: Bounds }
interface EyeSpec {
  bounds: Bounds; anchorY: number; sclera: string; iris_highlights: string;
  iris_clip_mask: string; upper_lid: string; lower_lid: string; closed: string; smile: string;
}
export interface MotionManifest {
  version: number; renderer: string; canvas: [number, number]; sourceSha256: string;
  base: Record<string, string>; arms: Record<ArmSide, Record<string, string>>;
  eyes: Record<ArmSide, EyeSpec>; brows: Record<string, string>; mouths: Record<string, string>;
  views: Record<"portrait" | "face", Bounds>; assets: MotionLayer[];
}
export interface LoadedMotionLayer extends MotionLayer { image: HTMLImageElement }
interface EyeBuffer { image: HTMLCanvasElement; iris: HTMLCanvasElement }
export interface MotionAssets { manifest: MotionManifest; layers: Record<string, LoadedMotionLayer>; buffers: Record<ArmSide, EyeBuffer> }
export const MOTION_MANIFEST_URL = assetUrl("brand/suinai-motion-v03/manifest.json");
// Forty-scene contour review reaches x246..1261; retain at least 35px around fingertips.
export const GESTURE_VIEW: Bounds = [210, -20, 1100, 930];
// 正式侧栏只扩展相机取景，沿用同一套穗奈原画、绑定和动作。
export const FULL_VIEW: Bounds = [210, -20, 1100, 1570];
const BASE_ORDER = ["back hair", "legwear", "footwear", "neck", "bottomwear", "topwear", "ears-r", "ears-l", "face", "nose"];
const HEAD_LAYERS = /^(back hair|front hair|headwear|face|ears-|eyewear|nose)/;
const offscreen = (width: number, height: number) => { const target = document.createElement("canvas"); target.width = width; target.height = height; return target; };
export function parseMotionManifest(value: unknown): MotionManifest {
  const invalid = (): never => { throw new Error("角色素材清单与当前动作版本不一致。"); };
  const object = (item: unknown): boolean => !!item && typeof item === "object" && !Array.isArray(item);
  const rect = (item: unknown): item is Bounds => Array.isArray(item) && item.length === 4 && item.every(coordinate => Number.isInteger(coordinate) && coordinate >= 0 && coordinate <= 1536) && item[2] > item[0] && item[3] > item[1];
  if (!object(value)) return invalid();
  const manifest = value as MotionManifest;
  if (manifest.version !== 3 || manifest.renderer !== "canvas-continuous-mesh" || !Array.isArray(manifest.canvas) || manifest.canvas.length !== 2 || manifest.canvas[0] !== 1536 || manifest.canvas[1] !== 1536 || !/^[a-f0-9]{64}$/.test(manifest.sourceSha256) || !Array.isArray(manifest.assets) || manifest.assets.length !== 53 || !object(manifest.base) || !object(manifest.arms) || !object(manifest.brows) || !object(manifest.mouths) || !object(manifest.eyes) || !object(manifest.views)) return invalid();
  const names = new Set<string>();
  for (const asset of manifest.assets) {
    if (!object(asset) || typeof asset.name !== "string" || names.has(asset.name) || typeof asset.url !== "string" || !/^\/api\/assets\/brand\/suinai-motion-v03\/[\w-]+\.png$/.test(asset.url) || !rect(asset.bounds)) return invalid();
    names.add(asset.name);
  }
  const reference = (item: unknown): void => { if (typeof item !== "string" || !names.has(item)) invalid(); };
  for (const name of [...BASE_ORDER, "headwear", "eyewear", "front hair"]) reference(manifest.base[name]);
  reference("blush");
  for (let index = 1; index <= 7; index++) {
    reference(manifest.mouths[`M0${index}`]); if (index <= 6) reference(manifest.brows[`B0${index}`]);
  }
  for (const side of ["l", "r"] as const) {
    const eye = manifest.eyes[side];
    if (!object(manifest.arms[side]) || !object(eye) || !rect(eye.bounds) || !Number.isFinite(eye.anchorY) || eye.anchorY < eye.bounds[1] || eye.anchorY > eye.bounds[3]) return invalid();
    for (let index = 1; index <= 6; index++) reference(manifest.arms[side][`H0${index}`]);
    for (const key of ["sclera", "iris_highlights", "iris_clip_mask", "upper_lid", "lower_lid", "closed", "smile"] as const) reference(eye[key]);
  }
  for (const view of ["portrait", "face"] as const) {
    const box = manifest.views[view];
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] > 1536 || box[1] + box[3] > 1536) return invalid();
  }
  return manifest;
}
export async function loadMotionAssets(signal: AbortSignal): Promise<MotionAssets> {
  const response = await fetch(MOTION_MANIFEST_URL, { signal });
  if (!response.ok) throw new Error("角色素材清单暂时无法读取。");
  const manifest = parseMotionManifest(await response.json());
  const entries = await Promise.all(manifest.assets.map(async layer => {
    signal.throwIfAborted();
    const image = new Image(); image.src = layer.url;
    try { await image.decode(); } catch { throw new Error("有一个角色部件未能加载，请重试。"); }
    signal.throwIfAborted();
    if (image.naturalWidth !== layer.bounds[2] - layer.bounds[0] || image.naturalHeight !== layer.bounds[3] - layer.bounds[1]) throw new Error("角色部件尺寸与坐标不一致。");
    return [layer.name, { ...layer, image }] as const;
  }));
  const layers = Object.fromEntries(entries);
  const buffer = (side: ArmSide): EyeBuffer => { const [x, y, x1, y1] = manifest.eyes[side].bounds; return { image: offscreen(x1 - x, y1 - y), iris: offscreen(x1 - x, y1 - y) }; };
  return { manifest, layers, buffers: { l: buffer("l"), r: buffer("r") } };
}
export function blinkClosure(phase: number): number {
  if (!Number.isFinite(phase) || phase < 0 || phase > .3) return 0;
  return Math.sin(Math.PI * phase / .3) ** 2;
}
interface MotionFrame { handFocus?: ArmSide | "auto"; view: SuinaiView; eyeOpen: number; action: ActionFrame; breath: number; sway: number }
function triangle(context: CanvasRenderingContext2D, image: HTMLImageElement, points: [Point, Point, Point], matrix: [number, number, number, number, number, number]): void {
  context.save();
  const area = (points[1][0] - points[0][0]) * (points[2][1] - points[0][1]) - (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]);
  const direction = area >= 0 ? 1 : -1;
  context.beginPath();
  for (let index = 0; index < 3; index++) {
    const p = points[index], before = points[(index + 2) % 3], after = points[(index + 1) % 3];
    const ax = p[0] - before[0], ay = p[1] - before[1], bx = after[0] - p[0], by = after[1] - p[1];
    const al = Math.hypot(ax, ay) || 1, bl = Math.hypot(bx, by) || 1;
    const n1 = [direction * ay / al, -direction * ax / al], n2 = [direction * by / bl, -direction * bx / bl];
    // Offset the edges, rather than the radius: thin triangles also need a full antialias overlap.
    const factor = .6 / Math.max(.001, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    const x = p[0] + (n1[0] + n2[0]) * factor, y = p[1] + (n1[1] + n2[1]) * factor;
    if (!index) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath(); context.clip(); context.transform(...matrix); context.drawImage(image, 0, 0); context.restore();
}
function drawArm(context: CanvasRenderingContext2D, layer: LoadedMotionLayer, side: ArmSide, pose: SuinaiPose, front: boolean): void {
  const angles = side === "l" ? pose.left : pose.right;
  const [x0, y0, x1, y1] = layer.bounds, width = x1 - x0;
  const splitY = 461;
  if (Math.abs(angles.shoulder) + Math.abs(angles.elbow) + Math.abs(angles.wrist) < .001) {
    const top = front ? splitY : y0, bottom = front ? y1 : splitY;
    context.drawImage(layer.image, 0, top - y0, width, bottom - top, x0, top, width, bottom - top);
    return;
  }
  const rows = buildArmRows(side, angles, y0, y1);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if ((a.y >= splitY) !== front) continue;
    const tl = armRowPoint(side, a, x0), tr = armRowPoint(side, a, x1);
    const bl = armRowPoint(side, b, x0), br = armRowPoint(side, b, x1);
    const top = a.y - y0, height = b.y - a.y;
    const ac = (tr[0] - tl[0]) / width, ab = (tr[1] - tl[1]) / width;
    const bc = (br[0] - tr[0]) / height, bd = (br[1] - tr[1]) / height;
    triangle(context, layer.image, [tl, tr, br], [ac, ab, bc, bd, tl[0] - bc * top, tl[1] - bd * top]);
    const cc = (br[0] - bl[0]) / width, cd = (br[1] - bl[1]) / width;
    const dc = (bl[0] - tl[0]) / height, dd = (bl[1] - tl[1]) / height;
    triangle(context, layer.image, [tl, br, bl], [cc, cd, dc, dd, tl[0] - dc * top, tl[1] - dd * top]);
  }
}

function drawPart(context: CanvasRenderingContext2D, assets: MotionAssets, name: string, alpha = 1): void {
  if (alpha <= 0) return;
  const layer = assets.layers[name];
  context.save(); context.globalAlpha *= alpha;
  context.drawImage(layer.image, layer.bounds[0], layer.bounds[1]); context.restore();
}
function drawMix(context: CanvasRenderingContext2D, assets: MotionAssets, neutral: string, target: string, weight: number): void {
  if (neutral === target) { drawPart(context, assets, neutral); return; }
  drawPart(context, assets, neutral, 1 - weight); drawPart(context, assets, target, weight);
}
function drawEye(context: CanvasRenderingContext2D, assets: MotionAssets, side: ArmSide, pose: SuinaiPose, openness: number, closedStyle: "closed" | "smile"): void {
  const eye = assets.manifest.eyes[side], buffer = assets.buffers[side], [x, y, x1, y1] = eye.bounds;
  const target = buffer.image.getContext("2d")!, iris = buffer.iris.getContext("2d")!;
  const width = x1 - x, height = y1 - y;
  target.setTransform(1, 0, 0, 1, 0, 0); target.clearRect(0, 0, width, height);
  iris.setTransform(1, 0, 0, 1, 0, 0); iris.clearRect(0, 0, width, height);
  const local = (ctx: CanvasRenderingContext2D, name: string, dx = 0, dy = 0) => {
    const layer = assets.layers[name]; ctx.drawImage(layer.image, layer.bounds[0] - x + dx, layer.bounds[1] - y + dy);
  };
  local(target, eye.sclera);
  // Both neutral irises share one target. Clip the shifted iris, not the eye-white behind it.
  local(iris, eye.iris_highlights, Math.max(-3.2, Math.min(3.2, pose.gazeX)), Math.max(-2.5, Math.min(2.5, pose.gazeY)));
  iris.globalCompositeOperation = "destination-in"; local(iris, eye.iris_clip_mask); iris.globalCompositeOperation = "source-over";
  target.drawImage(buffer.iris, 0, 0); local(target, eye.lower_lid); local(target, eye.upper_lid);
  const amount = Math.max(0, Math.min(1, openness)), closed = 1 - Math.min(1, amount / .28);
  context.save(); context.globalAlpha *= 1 - closed;
  context.translate(0, eye.anchorY); context.scale(1, .08 + .92 * amount); context.translate(0, -eye.anchorY);
  context.drawImage(buffer.image, x, y); context.restore();
  drawPart(context, assets, eye[closedStyle], closed);
}
export function drawSuinaiFrame(context: CanvasRenderingContext2D, assets: MotionAssets, frame: MotionFrame): void {
  const { manifest } = assets, { action } = frame, { pose } = action;
  const leftWrist = armWrist("l", pose.left), rightWrist = armWrist("r", pose.right);
  const autoLeft = Math.hypot(leftWrist[0] - 946, leftWrist[1] - 730) >= Math.hypot(rightWrist[0] - 570, rightWrist[1] - 730);
  const focus = frame.handFocus === "l" || frame.handFocus !== "r" && autoLeft ? leftWrist : rightWrist;
  const handView: Bounds = [focus[0] - 175, focus[1] - 145, 350, 350];
  const [vx, vy, vw, vh] = frame.view === "full" ? FULL_VIEW : frame.view === "gesture" ? GESTURE_VIEW : frame.view === "hands" ? handView : manifest.views[frame.view];
  const canvas = context.canvas;
  context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / vw, canvas.height / vh);
  context.translate((canvas.width - vw * scale) / 2, (canvas.height - vh * scale) / 2);
  context.scale(scale, scale); context.translate(-vx, -vy);
  context.translate(758 + frame.sway, 575 + pose.lift); context.rotate(pose.body * Math.PI / 180);
  context.scale(1 + frame.breath * .001, 1 + frame.breath * .003); context.translate(-758, -575);
  const arms = (["r", "l"] as const).map(side => ({ side, layer: assets.layers[manifest.arms[side][side === "l" ? action.leftHand : action.rightHand]] }));
  const transformHead = () => {
    context.translate(756, 236 + pose.nod); context.rotate(pose.head * Math.PI / 180);
    context.scale(1, 1 - Math.max(0, pose.nod) * .001); context.translate(-756, -236);
  };
  for (const name of BASE_ORDER) {
    context.save(); if (HEAD_LAYERS.test(name)) transformHead();
    drawPart(context, assets, manifest.base[name]); context.restore();
    if (name === "back hair") for (const { layer, side } of arms) drawArm(context, layer, side, pose, false);
  }
  context.save(); transformHead();
  const expression = EXPRESSION_SPECS[action.expression], weight = Math.max(0, Math.min(1, action.expressionWeight));
  const openness = Math.min(frame.eyeOpen, 1 - action.closure) * (1 - expression.softness * weight);
  drawPart(context, assets, "blush", action.blush);
  drawMix(context, assets, manifest.brows.B01, manifest.brows[expression.brow], weight);
  drawMix(context, assets, manifest.mouths.M01, manifest.mouths[expression.mouth], weight);
  for (const side of ["r", "l"] as const) drawEye(context, assets, side, pose, openness, action.closure > .4 ? action.closedStyle : "closed");
  for (const name of ["headwear", "eyewear", "front hair"]) drawPart(context, assets, manifest.base[name]);
  context.restore();
  for (const { layer, side } of arms) drawArm(context, layer, side, pose, true);
}
