/** 青穗集 · 启动策略：一次性品牌动效不等于业务进度，资源就绪即可进入，不设置最短等待。 */
import { assetUrl } from "../assets";
export const BOOT_SCENE = assetUrl("projects/qingsuiji-boot/scene-1");
export const BOOT_SEEN_KEY = "career.boot.seen.v1";
export const BOOT_DURATION_MS = 1300;
export const BOOT_FADE_MS = 180;
export const BOOT_ANIMATION_LIMIT_MS = 2200;
export function wantsStartupMotion(seen: boolean, motion: boolean, reduced: boolean): boolean {
  return !seen && motion && !reduced;
}
export function readStartupPreferences() {
  let seen = false, motion = true;
  try { seen = sessionStorage.getItem(BOOT_SEEN_KEY) === "1"; } catch { /* 无法保存偏好时仍能打开页面。 */ }
  try { motion = localStorage.getItem("career.motion") !== "0"; } catch { /* 动效不是登录前置条件。 */ }
  return { seen, motion };
}
export function rememberStartup() {
  try { sessionStorage.setItem(BOOT_SEEN_KEY, "1"); } catch { /* 私密窗口或存储被禁用时不阻止进入。 */ }
}
