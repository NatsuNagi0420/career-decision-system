/** 青穗集 · 精选 ASCII 素材：仅引入 ascii.rest 的猫与加载器，保留 MIT 归属；不使用模拟终端或假进度。 */
import type { Piece } from "ascii.rest";
import * as cat from "ascii.rest/pieces/cat";
import * as spinners from "ascii.rest/pieces/spinners";

function spinner(name: string, oneLine = false): Piece {
  return {
    meta: { name, category: "ui", note: "decorative activity indicator, not measured progress", cols: 7, rows: oneLine ? 1 : 3, fps: 8 },
    default: () => {
      const frame = spinners.default({ names: [name], labels: false, speed: 0.65 });
      // 单个原始加载器仍包含演示页留白，只裁去固定边距，不裁切随帧变化的图案。
      return t => frame(t).split("\n").slice(oneLine ? 2 : 1, oneLine ? 3 : 4).map(line => line.slice(2, 9)).join("\n");
    },
  };
}
export const ASCII_PIECES = {
  cat,
  waiting: spinner("dots"),
  working: spinner("scan", true),
  file: spinner("bounce", true),
} satisfies Record<string, Piece>;
export type AsciiVariant = keyof typeof ASCII_PIECES;
