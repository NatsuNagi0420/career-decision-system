/** 青穗集 · 界面微动效偏好：独立于穗奈动作，持久保存、跨标签同步，并始终尊重系统减少动态设置。 */
import { useSyncExternalStore } from "react";
import { useReducedMotion } from "../character/preferences";

export const UI_MOTION_KEY = "career.uiMotion";
const EVENT = "career:ui-motion";
let memoryPreference: boolean | undefined;

export function readUiMotionPreference(): boolean {
  if (memoryPreference !== undefined) return memoryPreference;
  try { return localStorage.getItem(UI_MOTION_KEY) !== "0"; }
  catch { return true; }
}
export function setUiMotionPreference(enabled: boolean): void {
  try { localStorage.setItem(UI_MOTION_KEY, enabled ? "1" : "0"); memoryPreference = undefined; }
  catch { memoryPreference = enabled; }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}
function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === UI_MOTION_KEY || event.key === null) { memoryPreference = undefined; callback(); }
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", storage); };
}
export function useUiMotion() {
  const enabled = useSyncExternalStore(subscribe, readUiMotionPreference, () => true);
  const reduced = useReducedMotion();
  return { enabled, reduced, playing: enabled && !reduced, setEnabled: setUiMotionPreference };
}
