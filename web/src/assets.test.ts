/** 青穗集 · 素材路径契约：前后端统一前缀，拒绝绝对路径与不安全目录片段。 */
import { describe, expect, it } from "vitest";
import { assetUrl, SUINAI_AVATAR_URL } from "./assets";

describe("网页素材地址", () => {
  it("品牌头像与动画资源统一走后端", () => {
    expect(assetUrl("dialogs/warning-window.webp")).toBe("/api/assets/dialogs/warning-window.webp");
    expect(SUINAI_AVATAR_URL).toBe("/api/assets/brand/suinai-avatar/suinai-avatar.png");
  });
  it("不接受绝对路径、路径穿越或查询片段", () => {
    for (const value of ["", "/brand/x.png", "brand/../x.png", "brand/.secret", "brand//x.png", "https://example.com/x.png", "brand/x.png?v=1", "brand/x.png#hash", "brand\\x.png", "brand/x\0.png"]) {
      expect(() => assetUrl(value), value).toThrow();
    }
  });
});
