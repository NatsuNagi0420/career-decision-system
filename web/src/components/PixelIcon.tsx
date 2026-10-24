/** 青穗集 · 原创桌面像素图标：统一 24×24 网格，不依赖游戏素材或第三方图标字体。 */
import type { DesktopApp } from "../state/desktop";
const paths: Record<DesktopApp | "wheat", string> = {
  profile: "M5 3h12v2h2v16H5V3Zm0 4h14M9 10h6v5H9v-5Zm-2 9h10M9 3v4M15 3v4",
  jobs: "M3 5h18v15H3V5Zm0 4h18M6 7h1M9 7h1M7 12h6v5H7v-5Zm8 0h3M15 15h3M15 18h3",
  growth: "M4 4h7l1 2 1-2h7v16h-7l-1 1-1-1H4V4Zm8 2v15M6 8h3M6 11h3M6 14h3M15 8h3M15 11h3M15 14h3",
  resume: "M6 2h9l4 4v16H6V2Zm9 0v5h4M9 10h7M9 13h7M9 16h7M9 19h4",
  messages: "M3 4h18v13H9l-4 4v-4H3V4Zm4 5h10M7 12h7",
  wheat: "M12 22V4M12 8 7 5V2l5 3M12 12 6 9V6l6 3M12 16 6 13v-3l6 3M12 8l5-3V2l-5 3M12 12l6-3V6l-6 3M12 16l6-3v-3l-6 3",
};
export function PixelIcon({ kind, size = 32 }: { kind: DesktopApp | "wheat"; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" strokeLinecap="square" aria-hidden="true"><path d={paths[kind]} /></svg>;
}
