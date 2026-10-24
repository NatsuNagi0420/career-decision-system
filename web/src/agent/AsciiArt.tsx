/** 青穗集 · 轻量字符画：固定占位、不进入读屏播报；只在可见且前台时低帧率播放，卸载时回收观察器。 */
import { memo, useEffect, useRef } from "react";
import { mount } from "ascii.rest";
import { ASCII_PIECES, type AsciiVariant } from "./asciiPieces";
import { useUiMotion } from "./uiMotion";

export const AsciiArt = memo(function AsciiArt({ variant, className = "" }: { variant: AsciiVariant; className?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const { playing } = useUiMotion();
  const piece = ASCII_PIECES[variant];
  const still = piece.default()(0);
  useEffect(() => {
    if (!ref.current) return;
    // motion:true 会覆盖系统偏好，因此不传；fps:0 才是用户选择的静止模式。
    return mount(ref.current, piece, { fps: playing ? 8 : 0 });
  }, [piece, playing]);
  return <pre ref={ref} className={"ascii-art ascii-art--" + variant + (className ? " " + className : "")} data-ascii={variant} data-motion={playing ? "playing" : "still"} aria-hidden="true">{still}</pre>;
});

export function UiMotionToggle() {
  const { playing, reduced, setEnabled } = useUiMotion();
  const title = reduced ? "系统已开启减少动态效果，界面动效保持静止" : playing ? "暂停 ASCII 与界面微动效，不影响穗奈动作" : "开启 ASCII 与界面微动效，不影响穗奈动作";
  return <button className="agent-icon-button ascii-motion-toggle" type="button" aria-label="界面动效" aria-pressed={playing} title={title} disabled={reduced} onClick={() => setEnabled(!playing)}><span className="ascii-motion-toggle__glyph" aria-hidden="true">{playing ? "[~]" : "[·]"}</span></button>;
}
