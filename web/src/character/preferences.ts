/** 青穗集 · 像素/点阵展示偏好：仅保存显示方式，多处角色同步，不涉及账号资料或模型。 */
import { useSyncExternalStore } from "react";
import type { SpriteMode } from "./suinai";
const KEY = "career.suinai.display";
const EVENT = "suinai-display-change";
let fallbackMode: SpriteMode | undefined;
function readMode(): SpriteMode {
  if (fallbackMode) return fallbackMode;
  try { return localStorage.getItem(KEY) === "dots" ? "dots" : "pixel"; }
  catch { return "pixel"; }
}
function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) { fallbackMode = undefined; callback(); } };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", storage); };
}
export function useSpriteMode() {
  const mode = useSyncExternalStore(subscribe, readMode, (): SpriteMode => "pixel");
  const setMode = (next: SpriteMode) => {
    try { localStorage.setItem(KEY, next); fallbackMode = undefined; }
    catch { fallbackMode = next; }
    window.dispatchEvent(new Event(EVENT));
  };
  return [mode, setMode] as const;
}

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
}
