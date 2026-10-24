/** 青穗集 · 对话工具栏图标：统一描边，按钮名称由使用处提供。 */
import type { CSSProperties } from "react";
const paths = {
  search: "M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  terminal: "M3 4h18v16H3z M7 9l3 3-3 3 M13 16h4",
  clock: "M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  warning: "m12 3 10 18H2L12 3Z M12 9v5 M12 17v.1",
  copy: "M9 9h12v12H9z M5 15H3V3h12v2",
  chevron: "m9 6 6 6-6 6",
  panel: "M3 4h18v16H3z M15 4v16 M7 9l3 3-3 3",
  exit: "M10 4H4v16h6 M9 12h12 M16 7l5 5-5 5",
  pause: "M8 5v14 M16 5v14",
  play: "m8 4 12 8-12 8V4Z",
  attach: "m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5L13 2.5a4 4 0 0 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.9-2.9L15.5 5.5",
  shield: "M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z M9 12l2 2 4-4",
  unlock: "M8 10V7a4 4 0 0 1 7.5-2 M6 10h12v11H6z M12 14v3",
  down: "m6 9 6 6 6-6",
  send: "M12 19V5 M5 12l7-7 7 7",
  stop: "M6 6h12v12H6z",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  edit: "m16 3 5 5-12 12-6 1 1-6L16 3Z M14 5l5 5",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  archive: "M3 4h18v4H3z M5 8v13h14V8 M9 12h6",
  restore: "M4 9a8 8 0 1 1-1 7 M4 3v6h6",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12 M18 6 6 18",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  external: "M14 3h7v7 M21 3l-11 11 M10 4H4v16h16v-6",
  folder: "M3 6h7l2 3h9v12H3V6Z",
  file: "M5 3h9l5 5v13H5V3Z M14 3v6h5 M9 13h6 M9 17h6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
};
export function AgentIcon({ name, size = 18, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
