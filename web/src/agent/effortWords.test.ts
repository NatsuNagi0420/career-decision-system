/** 青穗集 · 日文变换帧回归：只使用假名、固定词槽并最终还原完整词语。 */
import { describe, expect, it } from "vitest";
import { effortWordFrame } from "./effortWords";
describe("日文词语字符流", () => {
  it("两行词槽稳定，所有过渡帧只含平假名与片假名", () => {
    for (let row = 0; row < 2; row++) for (let tick = 0; tick < 180; tick++) {
      const words = effortWordFrame(tick, row);
      expect(words).toHaveLength(8);
      words.forEach(word => expect(word).toMatch(/^[ぁ-ゖァ-ヶ]{3}$/u));
    }
  });
  it("两行错峰变化，包含平片假名且没有数字或普通符号", () => {
    const frames = Array.from({ length: 90 }, (_, tick) => effortWordFrame(tick, 0).join(""));
    expect(frames.join("")).toMatch(/[ぁ-ゖ]/u);
    expect(frames.join("")).toMatch(/[ァ-ヶ]/u);
    expect(new Set(frames).size).toBeGreaterThan(30);
    expect(effortWordFrame(20, 0)).not.toEqual(effortWordFrame(21, 0));
  });
  it("先停留完整词，再逐字变化并解码成下一个词", () => {
    expect(effortWordFrame(0, 0)[0]).toBe("ミライ");
    expect(effortWordFrame(19, 0)[0]).toBe("ミライ");
    expect(effortWordFrame(20, 0)[0]).not.toBe("ミライ");
    expect(effortWordFrame(23, 0)[0]?.startsWith("ヒ")).toBe(true);
    expect(effortWordFrame(27, 0)[0]).toBe("ヒカリ");
    expect(effortWordFrame(30, 0)[0]).toBe("ヒカリ");
    expect(effortWordFrame(30, 1)).not.toEqual(effortWordFrame(30, 0));
  });
});
