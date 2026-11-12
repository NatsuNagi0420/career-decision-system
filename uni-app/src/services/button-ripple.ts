/** 青穗集 · 点击反馈：触点涟漪与图标回弹共用一次状态更新，不增加节点、帧循环或导航等待。 */
import { getCurrentInstance, shallowReactive } from "vue";

interface PointerPoint {
  clientX?: number;
  clientY?: number;
  pageX?: number;
  pageY?: number;
}
interface ButtonPressEvent extends PointerPoint {
  type?: string;
  detail?: unknown;
  touches?: ArrayLike<PointerPoint>;
  changedTouches?: ArrayLike<PointerPoint>;
  currentTarget?: {
    id?: string;
    offsetLeft?: number;
    offsetTop?: number;
    disabled?: boolean;
    getBoundingClientRect?: () => { left: number; top: number };
  };
}
type RippleStyle = Record<string, string>;
const EMPTY_STYLE: RippleStyle = {};

function origin(event: ButtonPressEvent): { x: string; y: string } {
  if (event.type === "click" && event.detail === 0) return { x: "50%", y: "50%" };
  const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
  if (event.type === "click" && point.clientX === 0 && point.clientY === 0)
    return { x: "50%", y: "50%" };
  const target = event.currentTarget;
  // H5 鼠标坐标使用可视区；原生微信 offsetLeft/Top 与 pageX/Y 同属文档坐标。
  const rect = target?.getBoundingClientRect?.();
  if (rect && typeof point.clientX === "number" && typeof point.clientY === "number")
    return { x: `${Math.round(point.clientX - rect.left)}px`, y: `${Math.round(point.clientY - rect.top)}px` };
  // #ifdef H5
  // uni H5 的 currentTarget 是简化对象，offsetTop 相对父级；用独立按钮 id 找回实际边界。
  if (typeof document !== "undefined" && target?.id) {
    const element = document.getElementById(target.id);
    if (element && typeof point.clientX === "number" && typeof point.clientY === "number") {
      const bounds = element.getBoundingClientRect();
      const windowTop = uni.getWindowInfo().windowTop || 0;
      return { x: `${Math.round(point.clientX - bounds.left)}px`, y: `${Math.round(point.clientY + windowTop - bounds.top)}px` };
    }
  }
  // #endif
  if (typeof point.pageX === "number" && typeof point.pageY === "number" &&
      typeof target?.offsetLeft === "number" && typeof target?.offsetTop === "number")
    return { x: `${Math.round(point.pageX - target.offsetLeft)}px`, y: `${Math.round(point.pageY - target.offsetTop)}px` };
  return { x: "50%", y: "50%" };
}

export function useButtonRipple() {
  const scope = getCurrentInstance()?.uid ?? 0;
  const styles = shallowReactive<Record<string, RippleStyle>>({});
  const touches = new Map<string, number>();
  const keyOf = (site: number, identity?: unknown[]) => JSON.stringify([site, ...(identity ?? [])]);
  function buttonRippleId(site: number, identity?: unknown[]): string {
    const safeKey = keyOf(site, identity).replace(/[^a-zA-Z0-9-]/g,
      char => "_" + char.charCodeAt(0).toString(16) + "_");
    return `qs-button-${scope}-${safeKey}`;
  }
  function buttonRippleStyle(site: number, identity?: unknown[]): RippleStyle {
    return styles[keyOf(site, identity)] ?? EMPTY_STYLE;
  }
  function startButtonRipple(
    input: unknown,
    site: number,
    identity?: unknown[],
    disabled = false,
  ) {
    if (!input || typeof input !== "object") return;
    const event = input as ButtonPressEvent;
    if (disabled || event.currentTarget?.disabled) return;
    const key = keyOf(site, identity);
    const now = Date.now();
    if (event.type === "touchstart") touches.set(key, now);
    // 同一次手势的 touchstart 和 tap/click 只播放一次，鼠标和键盘仍能单独触发。
    else if (touches.has(key) && now - touches.get(key)! < 800) return;
    const point = origin(event);
    const phase = styles[key]?.["--qs-ripple-wave"] === "qs-button-wave-a" ? "b" : "a";
    styles[key] = {
      "--qs-ripple-x": point.x,
      "--qs-ripple-y": point.y,
      "--qs-ripple-wave": `qs-button-wave-${phase}`,
      "--qs-icon-pop": `qs-icon-pop-${phase}`,
      "--qs-arrow-nudge": `qs-arrow-nudge-${phase}`,
    };
  }
  return { buttonRippleId, buttonRippleStyle, startButtonRipple };
}
