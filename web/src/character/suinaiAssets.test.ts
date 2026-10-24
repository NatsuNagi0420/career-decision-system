// 青穗集 · 穗奈 v0.4 素材映射契约：状态机缺素材时必须明确回落到代码稿。
import { describe, expect, it } from "vitest";
import { pixelAssetFrameForTick, pixelAssetPath, pixelAssetStateFor } from "./suinaiAssets";

describe("Suinai v0.4 asset mapping", () => {
  it("maps the first four supported semantic states", () => {
    expect(pixelAssetStateFor("journal")).toBe("journal");
    expect(pixelAssetStateFor("listen")).toBe("listen");
    expect(pixelAssetStateFor("write")).toBe("write");
    expect(pixelAssetStateFor("review")).toBe("review");
  });

  it("falls back when a pose or expression has no v0.4 frame set", () => {
    expect(pixelAssetStateFor("compare")).toBeNull();
    expect(pixelAssetStateFor("journal", "happy")).toBeNull();
    expect(pixelAssetStateFor("listen", "smile")).toBeNull();
  });

  it("keeps the 48-tick runtime clock while exposing four asset frames", () => {
    expect([0, 12, 24, 36, 47].map(pixelAssetFrameForTick)).toEqual([0, 1, 2, 3, 3]);
    expect(pixelAssetPath("listen", -1)).toBe("/api/assets/brand/pixel-v04/listen/frame-03.png");
  });
});
