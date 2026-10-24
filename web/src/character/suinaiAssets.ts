// 青穗集 · 穗奈 v0.4 素材帧目录：让代码状态机和可编辑 PNG 素材保持松耦合。
import { assetUrl } from "../assets";
import { poseForFace, type Face, type SpritePose } from "./suinai";

export type SpriteSource = "code" | "pixel-v04-reference";
export type PixelAssetState = "journal" | "listen" | "write" | "review";

export const PIXEL_ASSET_FRAME_COUNT = 4;
export const PIXEL_ASSET_ROOT = assetUrl("brand/pixel-v04");

const STATE_BY_FACE: Partial<Record<Face, PixelAssetState>> = {
  smile: "journal",
  listen: "listen",
  think: "write",
  encourage: "review",
};

const STATE_BY_POSE: Partial<Record<SpritePose, PixelAssetState>> = {
  journal: "journal",
  listen: "listen",
  write: "write",
  review: "review",
};

/** 返回当前姿态是否已有 v0.4 素材；没有时由调用方回落到代码稿。 */
export function pixelAssetStateFor(pose: SpritePose, requestedFace?: Face, avatar = false): PixelAssetState | null {
  if (requestedFace !== undefined) {
    const state = STATE_BY_FACE[requestedFace] ?? null;
    if (!state) return null;
    if (avatar) return state;
    return poseForFace(requestedFace) === pose ? state : null;
  }
  return STATE_BY_POSE[pose] ?? null;
}

export function pixelAssetPath(state: PixelAssetState, frame: number): string {
  const safeFrame = ((Math.floor(frame) % PIXEL_ASSET_FRAME_COUNT) + PIXEL_ASSET_FRAME_COUNT) % PIXEL_ASSET_FRAME_COUNT;
  return `${PIXEL_ASSET_ROOT}/${state}/frame-${String(safeFrame).padStart(2, "0")}.png`;
}

export function pixelAssetFrameForTick(tick: number): number {
  // 48 个代码时间片映射到 4 张素材帧，保留现有逐帧检查和业务状态时钟。
  const normalized = ((Math.floor(tick) % 48) + 48) % 48;
  return Math.floor(normalized / 12);
}
